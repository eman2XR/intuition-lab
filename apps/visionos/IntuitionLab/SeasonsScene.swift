import RealityKit
import SwiftUI

/// The seasons state from the website's engine (`CouncilBench.seasons`).
struct SeasonsState: Decodable {
    let stage: Int
    let live: Bool
    let view: String
    let tilt: Double
    let f: Double?
    let lat: Double
    let perihelion: Double
    let ecc: Double
    let rod: Bool
    let ghost: Double?
    let knob: Bool
    let marks: Bool
    let beam: Bool
    let turn: Double
    let dec: Double
    let noon: Double
    let ring: Bool
    let spin: Double
    let julyMarker: Bool
}

/// One Earth: the night side, the day side cut along the day-night line, the axis as a rod, Paris's daily circle
/// (gold where it is in sunlight) and dots for places, all turning with the Earth's spin. Its local frame has north
/// along +y and longitude 0 along +x.
@MainActor
final class EarthModel {
    let entity = Entity()
    let radius: Float

    private let sphere: MeshKit.Sphere
    private let day = ModelEntity()
    private let rod: ModelEntity
    private let ringLit = ModelEntity()
    private let ringDark = ModelEntity()
    private var dots: [ModelEntity] = []
    private let dayMaterial: any RealityKit.Material
    private var lastSun = SIMD3<Float>.zero
    /// The north end of the axis, to grab for tilting it, and the knob that shows it can be grabbed.
    let tip = Entity()
    private let knob = ModelEntity()
    private var lastRing: Double?

    private static let litDot = Paint.glow("#fff3b0")
    private static let darkDot = Paint.glow("#9aa7c4")
    private static let gold = Paint.glow("#ffd23f")
    private static let night = Paint.glow("#ffffff", opacity: 0.45)

    init(radius: Float, sphere: MeshKit.Sphere, maps: (day: TextureResource, night: TextureResource)?, name: String) {
        self.radius = radius
        self.sphere = sphere
        let nightMaterial: any RealityKit.Material = maps.map { Paint.textured($0.night) } ?? Paint.glow("#1d4f9e")
        dayMaterial = maps.map { Paint.textured($0.day) } ?? Paint.glow("#5aaaff")
        let ball = ModelEntity(mesh: sphere.mesh(radius: radius) ?? .generateSphere(radius: radius), materials: [nightMaterial])
        rod = ModelEntity(mesh: .generateCylinder(height: radius * 3.3, radius: max(0.0014, radius * 0.04)),
                          materials: [Paint.glow("#ffffff")])
        for child in [ball, day, rod, ringLit, ringDark, tip] { entity.addChild(child) }
        entity.name = name
        entity.components.set(InputTargetComponent())
        entity.components.set(CollisionComponent(shapes: [.generateSphere(radius: radius * 1.12)]))
        tip.name = "\(name)-tip"
        tip.position = [0, radius * 1.6, 0]
        tip.components.set(InputTargetComponent())
        tip.components.set(CollisionComponent(shapes: [.generateBox(size: [radius * 0.8, radius * 0.7, radius * 0.8])]))
        knob.model = ModelComponent(mesh: .generateSphere(radius: radius * 0.16), materials: [Paint.glow("#ffffff")])
        knob.isEnabled = false
        tip.addChild(knob)
    }

    /// Shows or hides the knob on the north end of the axis.
    func showKnob(_ on: Bool) {
        knob.isEnabled = on
    }

    /// Places the Earth: where it is, its axis, how far it has spun, and the direction of the Sun from it.
    /// `places` are latitude and longitude pairs in degrees.
    func update(at position: SIMD3<Float>, axis: SIMD3<Float>, spin: Float, sun: SIMD3<Float>, rod showRod: Bool,
                ring: Double?, places: [SIMD2<Float>]) {
        let turn = Self.orientation(axis: axis, spin: spin)
        entity.position = position
        entity.orientation = turn
        rod.isEnabled = showRod
        let local = simd_normalize(turn.inverse.act(sun))
        if simd_dot(local, lastSun) < 0.99999 || ring != lastRing {
            lastSun = local
            lastRing = ring
            if let mesh = sphere.litHalf(sun: local, radius: radius * 1.003) {
                day.model = ModelComponent(mesh: mesh, materials: [dayMaterial])
                day.isEnabled = true
            } else {
                day.isEnabled = false
            }
            updateRing(ring, sun: local)
        }
        while dots.count < places.count {
            let dot = ModelEntity(mesh: .generateSphere(radius: radius * 0.075), materials: [Self.litDot])
            entity.addChild(dot)
            dots.append(dot)
        }
        for (index, dot) in dots.enumerated() {
            guard index < places.count else { dot.isEnabled = false; continue }
            let p = MeshKit.Sphere.point(lat: places[index].x * .pi / 180, lon: places[index].y * .pi / 180)
            dot.isEnabled = true
            dot.position = p * radius * 1.02
            dot.model?.materials = [simd_dot(p, local) > 0 ? Self.litDot : Self.darkDot]
        }
    }

    /// A place on the Earth, in the coordinates of the Earth's parent.
    func point(lat: Float, lon: Float, lift: Float = 1.02) -> SIMD3<Float> {
        entity.position + entity.orientation.act(MeshKit.Sphere.point(lat: lat * .pi / 180, lon: lon * .pi / 180) * radius * lift)
    }

    /// The spin that turns longitude `lon` (degrees) to face `direction` (in the parent's coordinates).
    static func spin(toFace lon: Float, toward direction: SIMD3<Float>, axis: SIMD3<Float>) -> Float {
        let local = simd_quatf(from: [0, 1, 0], to: simd_normalize(axis)).inverse.act(direction)
        return atan2(-local.z, local.x) - lon * .pi / 180
    }

    static func orientation(axis: SIMD3<Float>, spin: Float) -> simd_quatf {
        simd_quatf(from: [0, 1, 0], to: simd_normalize(axis)) * simd_quatf(angle: spin, axis: [0, 1, 0])
    }

    private func updateRing(_ ring: Double?, sun local: SIMD3<Float>) {
        guard let ring else {
            ringLit.isEnabled = false
            ringDark.isEnabled = false
            return
        }
        let lat = Float(ring) * .pi / 180, count = 144
        var lit: [[SIMD3<Float>]] = [], dark: [[SIMD3<Float>]] = [], run: [SIMD3<Float>] = []
        var runLit: Bool?
        for i in 0...count {
            let p = MeshKit.Sphere.point(lat: lat, lon: Float(i) / Float(count) * 2 * .pi) * radius * 1.015
            let isLit = simd_dot(p, local) > 0
            if runLit == nil { runLit = isLit }
            if isLit != runLit {
                run.append(p)
                if runLit == true { lit.append(run) } else { dark.append(run) }
                run = [p]
                runLit = isLit
            } else {
                run.append(p)
            }
        }
        if runLit == true { lit.append(run) } else { dark.append(run) }
        ringLit.model = MeshKit.tubes(lit, radius: radius * 0.028, hint: [0, 1, 0]).map { ModelComponent(mesh: $0, materials: [Self.gold]) }
        ringDark.model = MeshKit.tubes(dark, radius: radius * 0.014, hint: [0, 1, 0]).map { ModelComponent(mesh: $0, materials: [Self.night]) }
        ringLit.isEnabled = ringLit.model != nil
        ringDark.isEnabled = ringDark.model != nil
    }
}

/// Why summer is warmer than winter, in 3D: the Sun and Earth's orbit with the axis as a rod that keeps its
/// direction (drag Earth around the Sun after playback); noon at Paris close up, the Sun's height and one beam's
/// patch on the ground. Paris's daily circle rides on Earth while it is tilted, and after playback the viewer tilts the
/// axis and carries Earth around the Sun.
@MainActor
final class SeasonsScene: GuideScene {
    let root = Entity()
    var yaw: Float = 0 { didSet { orient() } }

    private let world = Entity()
    private let pitch: Float = .pi * 14 / 180
    private let orbitGroup = Entity()
    private let noonGroup = Entity()
    private let labels = LabelPlacer()
    private var anchors: [String: SIMD3<Float>] = [:]

    private let orbitRadius: Float = 0.3
    private let orbitSun = SeasonsScene.sun(radius: 0.055)
    private let earth: EarthModel
    private let ghost: EarthModel
    private let julyMarker = ModelEntity(mesh: .generateSphere(radius: 0.03), materials: [Paint.glow("#ffffff", opacity: 0.22)])

    private let noonEarth: EarthModel
    private let noonSun = SeasonsScene.sun(radius: 0.04)
    private let ray = ModelEntity(mesh: .generateCylinder(height: 1, radius: 0.0016), materials: [Paint.glow("#ffe9a8")])
    private let horizon = ModelEntity(mesh: .generateCylinder(height: 0.002, radius: 0.055), materials: [Paint.lit("#5d9e58")])
    private let tower = ModelEntity(mesh: .generateCone(height: 0.04, radius: 0.007), materials: [Paint.lit("#3a3f4b", roughness: 0.5)])
    private let beam = ModelEntity()
    private let patch = ModelEntity(mesh: .generateBox(size: [1, 0.0016, 1]), materials: [Paint.glow("#ff7a1a")])
    private let junePatch = ModelEntity(mesh: .generateBox(size: [1, 0.0012, 1]), materials: [Paint.glow("#ffffff", opacity: 0.55)])


    private static let paris = SIMD2<Float>(48.86, 2.35)
    private static let australia = SIMD2<Float>(-25, 134)

    init(engine: GuideEngine) {
        let sphere = MeshKit.Sphere()
        let maps = EarthMaps.make(land: engine.land())
        earth = EarthModel(radius: 0.055, sphere: sphere, maps: maps, name: "earth")
        ghost = EarthModel(radius: 0.055, sphere: sphere, maps: maps, name: "ghost")
        noonEarth = EarthModel(radius: 0.15, sphere: sphere, maps: maps, name: "noon-earth")
        root.addChild(world)
        world.position = [0, 0.03, 0]
        for group in [orbitGroup, noonGroup] { world.addChild(group) }

        let circle = (0...128).map { i -> SIMD3<Float> in
            let a = Float(i) / 128 * 2 * .pi
            return [orbitRadius * cos(a), 0, -orbitRadius * sin(a)]
        }
        let orbitLine = ModelEntity(mesh: MeshKit.tubes([circle], radius: 0.0012, hint: [0, 1, 0]) ?? .generateSphere(radius: 0.001),
                                    materials: [Paint.glow("#ffffff", opacity: 0.4)])
        ghost.entity.components.set(OpacityComponent(opacity: 0.4))
        for child in [orbitLine, orbitSun, earth.entity, ghost.entity, julyMarker] { orbitGroup.addChild(child) }

        for child in [noonEarth.entity, noonSun, ray, horizon, tower, beam, patch, junePatch] { noonGroup.addChild(child) }
        orient()
    }

    func apply(_ data: Data, player: GuidePlayer, attachments: RealityViewAttachments) {
        guard let state = try? JSONDecoder().decode(SeasonsState.self, from: data) else { return }
        orbitGroup.isEnabled = state.view != "noon"
        noonGroup.isEnabled = state.view == "noon"
        anchors.removeAll()
        if state.view == "noon" { showNoon(state) } else { showOrbit(state) }
        labels.place(player.labels, attachments: attachments, in: root) { label in
            label.anchor.flatMap { anchors[$0] }.map { world.convert(position: $0, to: root) }
        }
    }

    /// After playback, dragging the axis's tip tilts Earth, and dragging Earth moves it around its orbit, which sets
    /// the time of year.
    func drag(_ value: EntityTargetValue<DragGesture.Value>, player: GuidePlayer) -> Bool {
        guard player.hasEnded else { return false }
        if value.entity === earth.tip {
            // The axis leans toward +x in the orbit's frame, so the hand's sideways and upward offsets give the tilt.
            let p = value.convert(value.location3D, from: .local, to: orbitGroup) - earth.entity.position
            let tilt = Double(atan2(p.x, max(1e-4, p.y))) * 180 / .pi
            player.setMass(min(max(tilt / 23.44, 0), 1))
            return true
        }
        guard value.entity === earth.entity else { return false }
        let p = value.convert(value.location3D, from: .local, to: orbitGroup)
        var f = Double(atan2(-p.z, p.x))
        if f < 0 { f += 2 * .pi }
        player.setDistance(1 + 1.5 * f / (2 * .pi))
        return true
    }

    // MARK: - Views

    private func showOrbit(_ s: SeasonsState) {
        let axis = Self.axis(s.tilt)
        let position = { (f: Double) -> SIMD3<Float> in [self.orbitRadius * Float(cos(f)), 0, -self.orbitRadius * Float(sin(f))] }
        let sunPosition = position(s.perihelion) * Float(s.ecc)
        orbitSun.position = sunPosition
        let f = s.f ?? .pi, at = position(f), toSun = simd_normalize(sunPosition - at)
        let viewer = simd_normalize(SIMD3<Float>(0, 0.35, 1))
        let spin: Float
        if s.live || s.ring {
            spin = Float(s.spin)
        } else if s.marks {
            // Between the Sun and the viewer, so both Paris and Australia can be seen.
            spin = EarthModel.spin(toFace: 68, toward: simd_normalize(toSun + viewer), axis: axis)
        } else {
            spin = EarthModel.spin(toFace: 15, toward: viewer, axis: axis)
        }
        let places: [SIMD2<Float>] = s.marks ? [Self.paris, Self.australia] : s.ring ? [Self.paris] : []
        earth.update(at: at, axis: axis, spin: spin, sun: toSun, rod: s.rod, ring: s.ring ? s.lat : nil, places: places)
        earth.showKnob(s.knob)
        ghost.entity.isEnabled = s.ghost != nil
        let up: SIMD3<Float> = [0, 1, 0]
        if let left = s.ghost {
            let place = position(left)
            anchors["ghost"] = place - up * 0.11
            ghost.update(at: place, axis: axis, spin: EarthModel.spin(toFace: 15, toward: viewer, axis: axis),
                         sun: simd_normalize(sunPosition - place), rod: true, ring: nil, places: [])
        }
        julyMarker.isEnabled = s.julyMarker
        julyMarker.position = position(.pi + 0.22)

        anchors["sun"] = sunPosition - up * 0.09
        anchors["earth"] = at + up * (s.rod ? 0.13 : 0.09)
        anchors["above-earth"] = at + up * (s.rod ? 0.18 : 0.14)
        anchors["below-earth"] = at - up * 0.11
        anchors["january"] = position(s.perihelion) + up * 0.08
        anchors["july"] = position(.pi + 0.22) + up * 0.07
        anchors["june"] = position(.pi) - up * 0.11
        anchors["december"] = position(0) - up * 0.11
        anchors["paris"] = earth.point(lat: Self.paris.x, lon: Self.paris.y) + up * 0.035
        anchors["australia"] = earth.point(lat: Self.australia.x, lon: Self.australia.y) - up * 0.035
    }

    private func showNoon(_ s: SeasonsState) {
        let tilt = Float(s.tilt) * .pi / 180, axis = Self.axis(s.tilt)
        // The noon Sun's direction for this declination, seen from a little in front of Paris.
        let across = SIMD3<Float>(cos(tilt), -sin(tilt), 0), forward = SIMD3<Float>(0, 0, 1), turn: Float = .pi * 50 / 180
        let level = cos(turn) * across + sin(turn) * forward
        let dec = Float(s.dec) * .pi / 180, lat = Float(s.lat) * .pi / 180
        let sunDirection = simd_normalize(cos(dec) * level + sin(dec) * axis)
        let up = simd_normalize(cos(lat) * level + sin(lat) * axis)
        let radius = noonEarth.radius, center = SIMD3<Float>(0, -0.02, 0)
        noonEarth.update(at: center, axis: axis, spin: EarthModel.spin(toFace: Self.paris.y, toward: level, axis: axis),
                         sun: sunDirection, rod: true, ring: nil, places: [])
        noonSun.position = center + sunDirection * 0.42
        let paris = center + up * radius
        horizon.position = paris + up * 0.001
        horizon.orientation = simd_quatf(from: [0, 1, 0], to: up)
        tower.position = paris + up * 0.022
        tower.orientation = simd_quatf(from: [0, 1, 0], to: up)

        // Toward the Sun along the ground, and the height of the Sun above it.
        let ahead = simd_normalize(sunDirection - simd_dot(sunDirection, up) * up), height = simd_dot(sunDirection, up)
        let rayLength: Float = 0.42 - radius
        ray.isEnabled = !s.beam
        ray.position = paris + sunDirection * rayLength / 2
        ray.orientation = simd_quatf(from: [0, 1, 0], to: sunDirection)
        ray.scale = [1, rayLength, 1]

        let width: Float = 0.022, length = width / max(0.05, height), spot = paris + ahead * 0.032 + up * 0.0025
        let east = simd_normalize(simd_cross(ahead, up))
        let frame = simd_quatf(simd_float3x3(columns: (ahead, up, simd_cross(ahead, up))))
        beam.isEnabled = s.beam
        patch.isEnabled = s.beam
        junePatch.isEnabled = s.beam && s.turn > 0.02
        if s.beam {
            let brightness = height / sin(Float(65.0) * .pi / 180)
            patch.position = spot
            patch.orientation = frame
            patch.scale = [length, 1, width]
            patch.components.set(OpacityComponent(opacity: 0.3 + 0.7 * min(1, brightness)))
            let juneLength = width / sin((90 - Float(s.lat) + Float(s.tilt)) * .pi / 180)
            junePatch.position = spot + up * 0.0012
            junePatch.orientation = frame
            junePatch.scale = [juneLength, 1, width]
            let corners = [spot - ahead * length / 2 - east * width / 2, spot + ahead * length / 2 - east * width / 2,
                           spot + ahead * length / 2 + east * width / 2, spot - ahead * length / 2 + east * width / 2]
            beam.model = Self.prism(corners: corners, along: sunDirection * 0.3).map {
                ModelComponent(mesh: $0, materials: [Paint.glow("#ffe25a", opacity: 0.18 + 0.3 * min(1, brightness))])
            }
        }

        anchors["paris"] = paris + up * 0.065
        anchors["angle"] = paris + ahead * 0.07 + up * 0.03
        anchors["season"] = center + SIMD3<Float>(0, radius + 0.1, 0)
        anchors["patch"] = paris + up * 0.03 + SIMD3<Float>(0.09, -0.02, 0.02)
        anchors["below-patch"] = paris + up * 0.03 + SIMD3<Float>(0.09, -0.055, 0.02)
    }

    // MARK: - Helpers

    private func orient() {
        root.orientation = simd_quatf(angle: pitch, axis: [1, 0, 0]) * simd_quatf(angle: yaw, axis: [0, 1, 0])
    }

    /// Earth's axis for a tilt in degrees, leaning toward +x, the way it points all year (as `seasonAxis` does).
    private static func axis(_ tilt: Double) -> SIMD3<Float> {
        let t = Float(tilt) * .pi / 180
        return [sin(t), cos(t), 0]
    }

    private static func sun(radius: Float) -> ModelEntity {
        let sun = ModelEntity(mesh: .generateSphere(radius: radius), materials: [Paint.glow("#ffd84a")])
        let halo = ModelEntity(mesh: .generateSphere(radius: radius * 1.35), materials: [Paint.glow("#fff2b0", opacity: 0.1)])
        sun.addChild(halo)
        return sun
    }

    /// A slanted box of light from a patch on the ground (four corners in order) up along `along`.
    private static func prism(corners: [SIMD3<Float>], along: SIMD3<Float>) -> MeshResource? {
        let top = corners.map { $0 + along }
        let quads: [[SIMD3<Float>]] = [[corners[0], corners[1], top[1], top[0]], [corners[1], corners[2], top[2], top[1]],
                                       [corners[2], corners[3], top[3], top[2]], [corners[3], corners[0], top[0], top[3]],
                                       [top[0], top[1], top[2], top[3]]]
        var positions: [SIMD3<Float>] = []
        for quad in quads {
            for tri in [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]] { positions += tri.map { quad[$0] } }
        }
        var descriptor = MeshDescriptor(name: "beam")
        descriptor.positions = MeshBuffers.Positions(positions)
        descriptor.primitives = .triangles((0..<UInt32(positions.count)).map { $0 })
        return try? MeshResource.generate(from: [descriptor])
    }
}
