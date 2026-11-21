import RealityKit
import SwiftUI
import UIKit

/// A guide's picture in 3D, drawn from the state the website's engine computes for each moment.
@MainActor
protocol GuideScene: AnyObject {
    /// Holds the whole picture; the volume adds it to its content.
    var root: Entity { get }
    /// Turns the picture about the vertical; dragging parts of it that do nothing else changes it.
    var yaw: Float { get set }
    /// Shows the engine's state (JSON) for the player's current moment.
    func apply(_ state: Data, player: GuidePlayer, attachments: RealityViewAttachments)
    /// A drag that started on one of the picture's entities; returns false to let the volume turn the picture.
    func drag(_ value: EntityTargetValue<DragGesture.Value>, player: GuidePlayer) -> Bool
    func dragEnded(player: GuidePlayer)
    func tap(_ value: EntityTargetValue<SpatialTapGesture.Value>, player: GuidePlayer)
    /// Labels the scene makes itself, for play the website's state does not describe.
    var ownLabels: [BenchLabel] { get }
}

extension GuideScene {
    func drag(_ value: EntityTargetValue<DragGesture.Value>, player: GuidePlayer) -> Bool { false }
    func dragEnded(player: GuidePlayer) {}
    func tap(_ value: EntityTargetValue<SpatialTapGesture.Value>, player: GuidePlayer) {}
    var ownLabels: [BenchLabel] { [] }
}

/// The scene for a guide's picture kind.
@MainActor
enum GuideScenes {
    static func make(for player: GuidePlayer) -> any GuideScene {
        switch player.kind {
        case "seasons": SeasonsScene(engine: player.engine)
        case "standing-waves": StringsScene()
        default: ParticlesScene()
        }
    }
}

/// Places a scene's label attachments: each label found at a point under `parent`, the others hidden.
@MainActor
final class LabelPlacer {
    private var known: Set<String> = []

    func place(_ labels: [BenchLabel], attachments: RealityViewAttachments, in parent: Entity,
               position: (BenchLabel) -> SIMD3<Float>?) {
        var present: Set<String> = []
        for label in labels {
            guard let point = position(label), let entity = attachments.entity(for: label.id) else { continue }
            present.insert(label.id)
            if entity.parent !== parent {
                entity.components.set(BillboardComponent())
                parent.addChild(entity)
            }
            entity.isEnabled = true
            entity.position = point
        }
        for id in known.subtracting(present) { attachments.entity(for: id)?.isEnabled = false }
        known.formUnion(present)
    }
}

extension UIColor {
    /// A color from a `#rrggbb` string, as used by the website's engines.
    convenience init(hex: String) {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt32(digits, radix: 16) ?? 0
        self.init(red: CGFloat((value >> 16) & 0xff) / 255, green: CGFloat((value >> 8) & 0xff) / 255,
                  blue: CGFloat(value & 0xff) / 255, alpha: 1)
    }
}

/// Materials in the flat, bold style of the website's pictures.
@MainActor
enum Paint {
    static func lit(_ hex: String, roughness: Float = 0.7, metallic: Bool = false) -> SimpleMaterial {
        SimpleMaterial(color: UIColor(hex: hex), roughness: .float(roughness), isMetallic: metallic)
    }

    static func glow(_ hex: String, opacity: Float = 1) -> UnlitMaterial {
        var material = UnlitMaterial(color: UIColor(hex: hex))
        if opacity < 1 { material.blending = .transparent(opacity: .init(floatLiteral: opacity)) }
        return material
    }

    static func textured(_ texture: TextureResource) -> UnlitMaterial {
        var material = UnlitMaterial()
        material.color = .init(tint: .white, texture: .init(texture))
        return material
    }
}

/// Meshes built from points: tubes along curves, a sphere with longitude-latitude texture coordinates, and the
/// sunlit half of that sphere cut exactly along the day-night line.
enum MeshKit {
    /// A tube through `runs` of points (each run its own tube), its cross-section turned using `hint`, a direction
    /// that is never along the curve.
    @MainActor
    static func tubes(_ runs: [[SIMD3<Float>]], radius: Float, sides: Int = 8, hint: SIMD3<Float> = [0, 0, 1]) -> MeshResource? {
        var positions: [SIMD3<Float>] = [], normals: [SIMD3<Float>] = [], indices: [UInt32] = []
        for points in runs where points.count > 1 {
            let base = UInt32(positions.count)
            for (i, p) in points.enumerated() {
                let ahead = points[min(i + 1, points.count - 1)], behind = points[max(i - 1, 0)]
                let tangent = simd_normalize(ahead - behind + SIMD3<Float>(1e-6, 0, 0))
                var side = simd_cross(tangent, hint)
                if simd_length(side) < 1e-4 { side = simd_cross(tangent, [0, 1, 0]) }
                side = simd_normalize(side)
                let up = simd_normalize(simd_cross(side, tangent))
                for k in 0..<sides {
                    let a = Float(k) / Float(sides) * 2 * .pi
                    let n = cos(a) * side + sin(a) * up
                    positions.append(p + radius * n)
                    normals.append(n)
                }
            }
            for i in 0..<UInt32(points.count - 1) {
                for k in 0..<UInt32(sides) {
                    let a = base + i * UInt32(sides) + k, b = base + i * UInt32(sides) + (k + 1) % UInt32(sides)
                    let c = a + UInt32(sides), d = b + UInt32(sides)
                    indices += [a, c, b, b, c, d]
                }
            }
        }
        guard !indices.isEmpty else { return nil }
        var descriptor = MeshDescriptor(name: "tube")
        descriptor.positions = MeshBuffers.Positions(positions)
        descriptor.normals = MeshBuffers.Normals(normals)
        descriptor.primitives = .triangles(indices)
        return try? MeshResource.generate(from: [descriptor])
    }

    /// A unit sphere in a local frame with north along +y and longitude 0 along +x, east toward -z; texture
    /// coordinates run west to east (u) and south to north (v).
    struct Sphere {
        let positions: [SIMD3<Float>]
        let uvs: [SIMD2<Float>]
        let indices: [UInt32]

        init(segments: Int = 72, rings: Int = 36) {
            var positions: [SIMD3<Float>] = [], uvs: [SIMD2<Float>] = [], indices: [UInt32] = []
            for r in 0...rings {
                let lat = Float.pi / 2 - Float(r) / Float(rings) * .pi
                for s in 0...segments {
                    let lon = -Float.pi + Float(s) / Float(segments) * 2 * .pi
                    positions.append(Sphere.point(lat: lat, lon: lon))
                    uvs.append([Float(s) / Float(segments), 1 - Float(r) / Float(rings)])
                }
            }
            let row = UInt32(segments + 1)
            for r in 0..<UInt32(rings) {
                for s in 0..<UInt32(segments) {
                    let a = r * row + s, b = a + 1, c = a + row, d = c + 1
                    indices += [a, c, b, b, c, d]
                }
            }
            self.positions = positions
            self.uvs = uvs
            self.indices = indices
        }

        static func point(lat: Float, lon: Float) -> SIMD3<Float> {
            [cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon)]
        }

        @MainActor
        func mesh(radius: Float) -> MeshResource? {
            var descriptor = MeshDescriptor(name: "sphere")
            descriptor.positions = MeshBuffers.Positions(positions.map { $0 * radius })
            descriptor.normals = MeshBuffers.Normals(positions)
            descriptor.textureCoordinates = MeshBuffers.TextureCoordinates(uvs)
            descriptor.primitives = .triangles(indices)
            return try? MeshResource.generate(from: [descriptor])
        }

        /// The part of the sphere where `dot(point, sun) >= 0`, each triangle cut along the day-night line, with
        /// its texture coordinates carried along.
        @MainActor
        func litHalf(sun: SIMD3<Float>, radius: Float) -> MeshResource? {
            var outPositions: [SIMD3<Float>] = [], outUVs: [SIMD2<Float>] = []
            for t in stride(from: 0, to: indices.count, by: 3) {
                var poly: [(SIMD3<Float>, SIMD2<Float>)] = (0..<3).map { (positions[Int(indices[t + $0])], uvs[Int(indices[t + $0])]) }
                let side = poly.map { simd_dot($0.0, sun) }
                if side.allSatisfy({ $0 < 0 }) { continue }
                if !side.allSatisfy({ $0 >= 0 }) {
                    var cut: [(SIMD3<Float>, SIMD2<Float>)] = []
                    for i in 0..<3 {
                        let (p, q) = (poly[i], poly[(i + 1) % 3]), (dp, dq) = (side[i], side[(i + 1) % 3])
                        if dp >= 0 { cut.append(p) }
                        if (dp >= 0) != (dq >= 0) {
                            let f = dp / (dp - dq)
                            cut.append((p.0 + (q.0 - p.0) * f, p.1 + (q.1 - p.1) * f))
                        }
                    }
                    poly = cut
                }
                guard poly.count >= 3 else { continue }
                for i in 1..<(poly.count - 1) {
                    for v in [poly[0], poly[i], poly[i + 1]] {
                        outPositions.append(simd_normalize(v.0) * radius)
                        outUVs.append(v.1)
                    }
                }
            }
            guard !outPositions.isEmpty else { return nil }
            var descriptor = MeshDescriptor(name: "day")
            descriptor.positions = MeshBuffers.Positions(outPositions)
            descriptor.normals = MeshBuffers.Normals(outPositions.map { simd_normalize($0) })
            descriptor.textureCoordinates = MeshBuffers.TextureCoordinates(outUVs)
            descriptor.primitives = .triangles((0..<UInt32(outPositions.count)).map { $0 })
            return try? MeshResource.generate(from: [descriptor])
        }
    }
}

/// Day and night maps of the Earth, drawn from the website's land outlines.
@MainActor
enum EarthMaps {
    static func make(land: [[Double]]) -> (day: TextureResource, night: TextureResource)? {
        guard let day = draw(land: land, ocean: "#4f9ff0", ground: "#8cc46a"),
              let night = draw(land: land, ocean: "#17386f", ground: "#2c4a37"),
              let dayTexture = try? TextureResource(image: day, options: .init(semantic: .color)),
              let nightTexture = try? TextureResource(image: night, options: .init(semantic: .color))
        else { return nil }
        return (dayTexture, nightTexture)
    }

    private static func draw(land: [[Double]], ocean: String, ground: String) -> CGImage? {
        let size = CGSize(width: 1024, height: 512)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            cg.setFillColor(UIColor(hex: ocean).cgColor)
            cg.fill(CGRect(origin: .zero, size: size))
            cg.setFillColor(UIColor(hex: ground).cgColor)
            for ring in land where ring.count >= 6 {
                // Rings hold longitude and latitude pairs in half degrees.
                let path = CGMutablePath()
                for i in stride(from: 0, to: ring.count - 1, by: 2) {
                    let point = CGPoint(x: (ring[i] / 2 + 180) / 360 * size.width, y: (90 - ring[i + 1] / 2) / 180 * size.height)
                    if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
                }
                path.closeSubpath()
                cg.addPath(path)
                cg.fillPath()
            }
        }
        return image.cgImage
    }
}
