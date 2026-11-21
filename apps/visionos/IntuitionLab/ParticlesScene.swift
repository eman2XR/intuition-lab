import RealityKit
import SwiftUI
import UIKit

/// Draws the website's double-slit bench state in 3D. Bench units: x along the beam (laser at 0), y across, z up;
/// one bench unit is `scale` meters. Entities are created once and then moved, shown or hidden as the state changes.
@MainActor
final class ParticlesScene: GuideScene {
    static let scale: Float = 0.2
    private static let maxDots = 2400
    private static let maxRings = 400
    private static let maxFronts = 16
    private static let maxArcs = 40

    /// Holds the bench turned toward the viewer, so the barrier and screen are seen at an angle, as on the website.
    let root = Entity()
    /// Yaw of the bench in radians; dragging the bench changes it.
    var yaw: Float = .pi * 28 / 180 {
        didSet { orient() }
    }
    /// The bench leans toward the viewer, so the level plane of the waves is seen from a little above.
    private let pitch: Float = .pi * 17 / 180

    private let bench = Entity()
    private var geometry: BenchState.Geometry?

    private var shutter = ModelEntity()
    private var shutterBase = SIMD3<Float>.zero
    private let laserGlow = ModelEntity(mesh: .generateSphere(radius: 0.06), materials: [glow("#ff4d3d", opacity: 0.6)])
    private let sensor = Entity()
    private let clickGlow = ModelEntity(mesh: .generateSphere(radius: 0.13), materials: [glow("#c89bff", opacity: 0.45)])

    private let dotsRoot = Entity()
    private var dots: [ModelEntity] = []
    private var dotIsViolet: [Bool] = []
    private var shownDots = 0
    private var dotsKey = ""
    private var cachedDots: [BenchDot] = []
    private let freshDot = ModelEntity(mesh: .generateSphere(radius: 0.022), materials: [glow("#fff6e8")])
    private let freshGlow = ModelEntity(mesh: .generateSphere(radius: 0.05), materials: [glow("#ffb46b", opacity: 0.5)])

    private let ringsRoot = Entity()
    private var rings: [ModelEntity] = []
    private var placedRings = -1

    private var fronts: [ModelEntity] = []
    private var arcs: [ModelEntity] = []
    private var arcIsMarked: [Bool] = []
    private var arcMeshes: [String: MeshResource] = [:]

    private let photonCore = ModelEntity(mesh: .generateSphere(radius: 0.022), materials: [glow("#fff6e8")])
    private let photonGlow = ModelEntity(mesh: .generateSphere(radius: 0.06), materials: [glow("#ffb46b", opacity: 0.55)])
    private let photonTrail = ModelEntity(mesh: .generateBox(size: [1, 0.012, 0.012]), materials: [glow("#ffb46b", opacity: 0.5)])

    private var labelIDs: Set<String> = []

    private static let dotMesh = MeshResource.generateSphere(radius: 0.0085)
    private static let ringMesh = MeshResource.generateSphere(radius: 0.009)
    private static let orange = glow("#ffb46b")
    private static let violetDot = glow("#c79cff")
    private static let wave = glow("#4c9be8")
    private static let markedWave = glow("#7a3fb2")

    init() {
        root.addChild(bench)
        root.position = [0, 0.05, 0]
        orient()
        bench.scale = .init(repeating: Self.scale)
        root.components.set(InputTargetComponent())
        root.components.set(CollisionComponent(shapes: [.generateBox(size: [0.75, 0.5, 0.5])]))
    }

    /// Decodes the double-slit state and shows it.
    func apply(_ data: Data, player: GuidePlayer, attachments: RealityViewAttachments) {
        guard let state = try? JSONDecoder().decode(BenchState.self, from: data) else { return }
        apply(state, moment: player.moment, engine: player.engine, attachments: attachments)
    }

    /// Shows the bench as the website's engine describes it at `moment`.
    func apply(_ state: BenchState, moment: GuideMoment, engine: GuideEngine, attachments: RealityViewAttachments) {
        if geometry != state.geometry { build(state.geometry) }
        guard let g = geometry else { return }

        // The cover slides up off the second slit as it opens.
        let open = Float(state.openFraction)
        shutter.isEnabled = open < 0.999
        shutter.position = shutterBase + [0, open * 0.45, 0]
        shutter.components.set(OpacityComponent(opacity: 1 - open))

        // The laser's glow swells as each particle leaves.
        let flash = Float(state.flash)
        laserGlow.scale = .init(repeating: 1 + 1.4 * flash)
        laserGlow.components.set(OpacityComponent(opacity: 0.45 + 0.55 * flash))

        updateWaves(state, g)
        sensor.isEnabled = state.sensor
        sensor.position = point(0, 0, state.up)
        clickGlow.isEnabled = state.click > 0.01
        clickGlow.components.set(OpacityComponent(opacity: Float(0.9 * state.click)))
        updateDots(state, moment: moment, engine: engine, g)
        updateRings(state, g)
        updatePhoton(state.photon)
        updateLabels(state.labels, attachments: attachments)
    }

    private func orient() {
        root.orientation = simd_quatf(angle: pitch, axis: [1, 0, 0]) * simd_quatf(angle: yaw, axis: [0, 1, 0])
    }

    // MARK: - Building

    private func build(_ g: BenchState.Geometry) {
        geometry = g
        bench.children.removeAll()
        bench.position = [-Float(g.screenX - 0.22) / 2 * Self.scale, 0, 0]
        let xb = g.barrierX, xs = g.screenX, yc = g.slitOffset, sw = g.slitHalfWidth, zs = g.slitHalfHeight
        let t = 0.015

        // The barrier: three full-height slabs, and the pieces above and below each slit.
        let barrier = Self.lit("#7d8796")
        for y in [-1...(-yc - sw), (-yc + sw)...(yc - sw), (yc + sw)...1] {
            bench.addChild(box(x: (xb - t)...(xb + t), y: y, z: -1...1, material: barrier))
        }
        for center in [-yc, yc] {
            for z in [zs...1, -1...(-zs)] {
                bench.addChild(box(x: (xb - t)...(xb + t), y: (center - sw)...(center + sw), z: z, material: barrier))
            }
        }
        shutter = box(x: (xb - t - 0.014)...(xb - t - 0.004), y: (yc - sw - 0.02)...(yc + sw + 0.02),
                      z: (-zs - 0.03)...(zs + 0.03), material: Self.lit("#f2b134"))
        shutterBase = shutter.position
        bench.addChild(shutter)

        // The screen, its face toward the barrier at x = xs.
        bench.addChild(box(x: xs...(xs + 0.03), y: -1...1, z: -1...1, material: Self.lit("#141d2b", roughness: 0.4)))

        // The laser: a small box with a glowing red opening facing the barrier.
        bench.addChild(box(x: -0.22...0, y: -0.07...0.07, z: -0.1...0.1, material: Self.lit("#3a4250", roughness: 0.35, metallic: true)))
        let aperture = ModelEntity(mesh: .generateSphere(radius: 0.028), materials: [Self.glow("#ff6b5a")])
        aperture.position = point(0.004, 0, 0)
        laserGlow.position = point(0.01, 0, 0)
        bench.addChild(aperture)
        bench.addChild(laserGlow)

        // The sensor: a violet frame around the first slit, on a stem rising above the barrier.
        sensor.children.removeAll()
        let violet = Self.lit("#7a3fb2", roughness: 0.5)
        let f = 0.035, sx = (xb - t - 0.02)...(xb - t - 0.008)
        sensor.addChild(box(x: sx, y: (-yc - sw - f)...(-yc - sw), z: (-zs - f)...(zs + f), material: violet))
        sensor.addChild(box(x: sx, y: (-yc + sw)...(-yc + sw + f), z: (-zs - f)...(zs + f), material: violet))
        sensor.addChild(box(x: sx, y: (-yc - sw)...(-yc + sw), z: zs...(zs + f), material: violet))
        sensor.addChild(box(x: sx, y: (-yc - sw)...(-yc + sw), z: (-zs - f)...(-zs), material: violet))
        sensor.addChild(box(x: sx, y: (-yc - 0.012)...(-yc + 0.012), z: (zs + f)...1.3, material: violet))
        bench.addChild(sensor)
        clickGlow.position = point(xb - t - 0.03, -yc, 0)
        bench.addChild(clickGlow)

        // Pools for dots, rings, wavefronts and the photon in flight.
        dotsRoot.children.removeAll()
        dots = (0..<Self.maxDots).map { _ in
            let dot = ModelEntity(mesh: Self.dotMesh, materials: [Self.orange])
            dot.isEnabled = false
            dotsRoot.addChild(dot)
            return dot
        }
        dotIsViolet = Array(repeating: false, count: Self.maxDots)
        shownDots = 0
        dotsKey = ""
        bench.addChild(dotsRoot)
        bench.addChild(freshDot)
        bench.addChild(freshGlow)

        ringsRoot.children.removeAll()
        rings = (0..<Self.maxRings).map { _ in
            let ring = ModelEntity(mesh: Self.ringMesh, materials: [Self.glow("#d6dde8")])
            ring.isEnabled = false
            ringsRoot.addChild(ring)
            return ring
        }
        placedRings = -1
        bench.addChild(ringsRoot)

        fronts = (0..<Self.maxFronts).map { _ in
            let front = ModelEntity(mesh: .generateBox(size: [0.006, 0.004, 1.24]), materials: [Self.wave])
            bench.addChild(front)
            return front
        }
        arcs = (0..<Self.maxArcs).map { _ in
            let arc = ModelEntity()
            bench.addChild(arc)
            return arc
        }
        arcIsMarked = Array(repeating: false, count: Self.maxArcs)
        arcMeshes.removeAll()

        bench.addChild(photonTrail)
        bench.addChild(photonGlow)
        bench.addChild(photonCore)
    }

    // MARK: - Updating

    private func updateWaves(_ state: BenchState, _ g: BenchState.Geometry) {
        for (index, front) in fronts.enumerated() {
            guard index < state.fronts.count else { front.isEnabled = false; continue }
            front.isEnabled = true
            front.position = point(state.fronts[index], 0, 0)
            front.components.set(OpacityComponent(opacity: Float(min(1, state.frontAlpha * 1.8))))
        }
        for (index, entity) in arcs.enumerated() {
            guard index < state.arcs.count, let mesh = arcMesh(state.arcs[index], g) else {
                entity.isEnabled = false
                continue
            }
            let arc = state.arcs[index]
            entity.isEnabled = true
            if entity.model == nil || arcIsMarked[index] != arc.marked {
                entity.model = ModelComponent(mesh: mesh, materials: [arc.marked ? Self.markedWave : Self.wave])
                arcIsMarked[index] = arc.marked
            } else {
                entity.model?.mesh = mesh
            }
            entity.components.set(OpacityComponent(opacity: Float(min(1, arc.alpha * 1.6))))
        }
    }

    private func updateDots(_ state: BenchState, moment: GuideMoment, engine: GuideEngine, _ g: BenchState.Geometry) {
        let landed = min(state.landed, Self.maxDots)
        if state.dotsKey != dotsKey {
            dotsKey = state.dotsKey
            cachedDots = engine.dots(at: moment, count: landed > 200 ? Self.maxDots : landed)
            placeDots(g)
        } else if landed > cachedDots.count {
            cachedDots = engine.dots(at: moment, count: Self.maxDots)
            placeDots(g)
        }
        let shown = min(landed, cachedDots.count)
        if shown != shownDots {
            for index in min(shown, shownDots)..<max(shown, shownDots) { dots[index].isEnabled = index < shown }
            shownDots = shown
        }
        dotsRoot.components.set(OpacityComponent(opacity: Float(state.dim)))

        let showFresh = state.fresh && shown > 0
        freshDot.isEnabled = showFresh
        freshGlow.isEnabled = showFresh
        if showFresh {
            let last = cachedDots[shown - 1]
            freshDot.position = point(g.screenX - 0.01, last.y, last.z)
            freshGlow.position = freshDot.position
            freshGlow.model?.materials = [Self.glow(last.clicked ? "#c79cff" : "#ffb46b", opacity: 0.5)]
        }
    }

    private func placeDots(_ g: BenchState.Geometry) {
        for (index, dot) in cachedDots.enumerated() where index < Self.maxDots {
            dots[index].position = point(g.screenX - 0.006, dot.y, dot.z)
            if dotIsViolet[index] != dot.clicked {
                dots[index].model?.materials = [dot.clicked ? Self.violetDot : Self.orange]
                dotIsViolet[index] = dot.clicked
            }
        }
    }

    private func updateRings(_ state: BenchState, _ g: BenchState.Geometry) {
        guard let set = state.rings else {
            ringsRoot.isEnabled = false
            return
        }
        ringsRoot.isEnabled = true
        ringsRoot.components.set(OpacityComponent(opacity: Float(0.6 * set.fade)))
        guard set.points.count != placedRings else { return }
        placedRings = set.points.count
        for (index, ring) in rings.enumerated() {
            guard index < set.points.count, set.points[index].count == 2 else { ring.isEnabled = false; continue }
            ring.isEnabled = true
            ring.position = point(g.screenX - 0.012, set.points[index][0], set.points[index][1])
        }
    }

    private func updatePhoton(_ photon: BenchState.Photon?) {
        let parts = [photonCore, photonGlow, photonTrail]
        guard let photon, photon.pos.count == 3, photon.prev.count == 3 else {
            parts.forEach { $0.isEnabled = false }
            return
        }
        parts.forEach { $0.isEnabled = true }
        let head = point(photon.pos[0], photon.pos[1], photon.pos[2])
        let tail = point(photon.prev[0], photon.prev[1], photon.prev[2])
        let opacity = Float(photon.a)
        photonCore.position = head
        photonGlow.position = head
        photonGlow.model?.materials = [Self.glow(photon.c, opacity: 0.55)]
        photonCore.components.set(OpacityComponent(opacity: opacity))
        photonGlow.components.set(OpacityComponent(opacity: opacity))

        let span = head - tail
        let length = simd_length(span)
        photonTrail.isEnabled = length > 0.001
        if length > 0.001 {
            photonTrail.position = (head + tail) / 2
            photonTrail.scale = [length, 1, 1]
            photonTrail.orientation = simd_quatf(from: [1, 0, 0], to: span / length)
            photonTrail.model?.materials = [Self.glow(photon.c, opacity: 0.5)]
            photonTrail.components.set(OpacityComponent(opacity: opacity))
        }
    }

    private func updateLabels(_ labels: [BenchLabel], attachments: RealityViewAttachments) {
        var present: Set<String> = []
        for label in labels {
            guard let at = label.at, at.count == 3 else { continue }
            guard let entity = attachments.entity(for: label.id) else { continue }
            present.insert(label.id)
            if entity.parent == nil {
                entity.components.set(BillboardComponent())
                root.addChild(entity)
            }
            entity.isEnabled = true
            entity.position = bench.convert(position: point(at[0], at[1], at[2]), to: root)
        }
        for id in labelIDs.subtracting(present) { attachments.entity(for: id)?.isEnabled = false }
        labelIDs.formUnion(present)
    }

    // MARK: - Geometry helpers

    /// Bench coordinates (x beam, y across, z up) to RealityKit's (x right, y up, z toward the viewer).
    private func point(_ x: Double, _ y: Double, _ z: Double) -> SIMD3<Float> {
        [Float(x), Float(z), Float(y)]
    }

    private func box(x: ClosedRange<Double>, y: ClosedRange<Double>, z: ClosedRange<Double>, material: any RealityKit.Material) -> ModelEntity {
        let size = SIMD3<Float>(Float(x.upperBound - x.lowerBound), Float(z.upperBound - z.lowerBound),
                                Float(y.upperBound - y.lowerBound))
        let entity = ModelEntity(mesh: .generateBox(size: size), materials: [material])
        entity.position = point((x.lowerBound + x.upperBound) / 2, (y.lowerBound + y.upperBound) / 2,
                                (z.lowerBound + z.upperBound) / 2)
        return entity
    }

    /// A ripple from a slit as a thin ribbon on the level plane through the slits' middle, cut to the space between
    /// the barrier and the screen, as the website draws it.
    private func arcMesh(_ arc: BenchState.Arc, _ g: BenchState.Geometry) -> MeshResource? {
        let key = "\(arc.y > 0 ? 1 : 0)-\(Int((arc.r * 500).rounded()))"
        if let cached = arcMeshes[key] { return cached }
        let half = 0.007
        var positions: [SIMD3<Float>] = []
        var indices: [UInt32] = []
        var run: [(Double, Double)] = []
        func flush() {
            defer { run.removeAll() }
            guard run.count > 1 else { return }
            let base = UInt32(positions.count)
            for (c, s) in run {
                positions.append(point(g.barrierX + (arc.r - half) * c, arc.y + (arc.r - half) * s, 0))
                positions.append(point(g.barrierX + (arc.r + half) * c, arc.y + (arc.r + half) * s, 0))
            }
            for j in 0..<UInt32(run.count - 1) {
                let a = base + 2 * j, b = a + 1, c = a + 2, d = a + 3
                indices += [a, b, c, b, d, c, a, c, b, b, c, d]
            }
        }
        for k in 0...64 {
            let angle = -Double.pi / 2 + Double.pi * Double(k) / 64
            let c = cos(angle), s = sin(angle)
            let x = g.barrierX + arc.r * c, y = arc.y + arc.r * s
            if x > g.barrierX + 0.005, x < g.screenX - 0.01, abs(y) <= 1 { run.append((c, s)) } else { flush() }
        }
        flush()
        guard !indices.isEmpty else { return nil }
        var descriptor = MeshDescriptor(name: "ripple")
        descriptor.positions = MeshBuffers.Positions(positions)
        descriptor.primitives = .triangles(indices)
        let mesh = try? MeshResource.generate(from: [descriptor])
        arcMeshes[key] = mesh
        return mesh
    }

    // MARK: - Materials

    private static func lit(_ hex: String, roughness: Float = 0.7, metallic: Bool = false) -> SimpleMaterial {
        SimpleMaterial(color: UIColor(hex: hex), roughness: .float(roughness), isMetallic: metallic)
    }

    private static func glow(_ hex: String, opacity: Float = 1) -> UnlitMaterial {
        var material = UnlitMaterial(color: UIColor(hex: hex))
        if opacity < 1 { material.blending = .transparent(opacity: .init(floatLiteral: opacity)) }
        return material
    }
}
