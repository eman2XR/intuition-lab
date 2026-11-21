import AVFoundation
import RealityKit
import SwiftUI

/// The rope or guitar state from the website's engine (`CouncilBench['standing-waves']`).
struct StringsState: Decodable {
    let mode: String
    let stage: Int
    let y: [Double]?
    let A: Double?
    let rate: Double?
    let inStep: Bool?
    let loops: Int?
    let live: Bool?
    let len: Double?
    let pull: Double?
    let age: Double?
    let p: Double?
    let plucks: [[Double]]?
    let string: [Double]?
    let frets: [Double]?
}

/// Plays a plucked note: the string's in-step patterns, each a whole-number multiple of the note, starting with
/// the heights a pluck at that point gives them (as `Physics.stringMode`) and fading, the faster ones sooner.
@MainActor
final class PluckSynth {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)
    private var running = false

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func pluck(frequency: Double, strength: Double, at point: Double) {
        guard let format else { return }
        if !running {
            do { try engine.start() } catch { return }
            player.play()
            running = true
        }
        let rate = format.sampleRate, count = Int(rate * 2.8)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let samples = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(count)
        let p = min(max(point, 0.05), 0.95)
        let partials = (1...14).map { n -> (Double, Double, Double) in
            let height = 2 * sin(Double(n) * .pi * p) / (Double(n * n) * .pi * .pi * p * (1 - p))
            return (Double(n) * frequency, abs(height) * sqrt(Double(n)), 2.4 / (1 + 0.45 * Double(n - 1)))
        }
        var peak: Float = 0
        for i in 0..<count {
            let t = Double(i) / rate
            var v = 0.0
            for (f, a, tau) in partials where f < 9_000 { v += a * sin(2 * .pi * f * t) * exp(-t / tau) }
            let attack = min(1, t / 0.004)
            samples[i] = Float(v * attack)
            peak = max(peak, abs(samples[i]))
        }
        let gain = Float(0.45 * min(1, max(0.15, strength))) / max(peak, 1e-6)
        for i in 0..<count { samples[i] *= gain }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
    }
}

/// Why a guitar string plays only certain notes, in 3D: a rope shaken at one end and tied to a wall, then a guitar
/// string. During playback both follow the website's engine; afterwards the viewer pulls and lets go of the string
/// or taps a fret (and hears the note), or shakes the rope's end with their own hand.
@MainActor
final class StringsScene: GuideScene {
    let root = Entity()
    var yaw: Float = 0 { didSet { orient() } }

    private let world = Entity()
    private let ropeGroup = Entity()
    private let guitarGroup = Entity()
    private let labels = LabelPlacer()
    private var anchors: [String: SIMD3<Float>] = [:]
    private let synth = PluckSynth()
    /// Labels for live play, made here because the website's live picture has no rope.
    private(set) var ownLabels: [BenchLabel] = []

    // The rope: 0.6 m from the hand to the wall; heights drawn 1.3 times the rope's own scale.
    private let length: Float = 0.6
    private let tall: Float = 1.3
    private let rope = ModelEntity()
    private let hand = ModelEntity(mesh: .generateSphere(radius: 0.018), materials: [Paint.lit("#e0ad86")])
    private let wall = ModelEntity(mesh: .generateBox(size: [0.012, 0.3, 0.12]), materials: [Paint.lit("#2c3039")])
    private var stillPoints: [ModelEntity] = []

    // The guitar: a fretboard 0.6 m long with a string over it.
    private let width: Float = 0.6
    private let string = ModelEntity()
    private let stopped = ModelEntity()
    private let finger = ModelEntity(mesh: .generateSphere(radius: 0.011), materials: [Paint.lit("#e0ad86")])
    private let fingertip = ModelEntity(mesh: .generateSphere(radius: 0.008), materials: [Paint.lit("#e0ad86")])

    private var lastStage = -1
    private var lastSince = -1.0

    // Playing after the guide: the string held or ringing, the rope shaken.
    private var stringLength = 1.0
    private var hold: (p: Double, pull: Double)?
    private var ring: (p: Double, sign: Double, strength: Double, start: Double)?
    private var handHeight = 0.0
    private var ropeReset = true
    private var lastToy = -1
    private var crossings: [Double] = []
    private var lastHand = 0.0
    private var handSwing = 0.0
    private var ropeSwing = 0.0

    init() {
        root.addChild(world)
        world.position = [0, 0.04, 0]
        world.addChild(ropeGroup)
        world.addChild(guitarGroup)
        hand.name = "hand"
        hand.components.set(InputTargetComponent())
        hand.components.set(CollisionComponent(shapes: [.generateSphere(radius: 0.045)]))
        wall.position = [length / 2 + 0.012, 0, 0]
        for child in [rope, hand, wall] { ropeGroup.addChild(child) }
        buildGuitar()
        orient()
    }

    func apply(_ data: Data, player: GuidePlayer, attachments: RealityViewAttachments) {
        guard let state = try? JSONDecoder().decode(StringsState.self, from: data) else { return }
        anchors.removeAll()
        let live = player.hasEnded
        let ropeOnShow = live ? player.toy == 1 : state.mode == "rope"
        ropeGroup.isEnabled = ropeOnShow
        guitarGroup.isEnabled = !ropeOnShow
        var liveLabels: [BenchLabel] = []
        if ropeOnShow {
            if live {
                liveLabels = showLiveRope(player: player)
            } else {
                showRope(y: state.y ?? [], hand: state.y?.first ?? 0, loops: state.loops ?? 0)
            }
        } else if live {
            liveLabels = showLiveString(player: player)
        } else {
            showString(state: state, player: player)
        }
        lastToy = live ? player.toy : -1
        ownLabels = liveLabels
        labels.place(live ? liveLabels : player.labels, attachments: attachments, in: root) { label in
            if let at = label.at, at.count == 2 {
                return world.convert(position: [Float(at[0]) * length - length / 2, Float(at[1]) * length * tall, 0], to: root)
            }
            return label.anchor.flatMap { anchors[$0] }.map { world.convert(position: $0, to: root) }
        }
    }

    func drag(_ value: EntityTargetValue<DragGesture.Value>, player: GuidePlayer) -> Bool {
        guard player.hasEnded else { return false }
        if value.entity === hand && player.toy == 1 {
            let p = value.convert(value.location3D, from: .local, to: ropeGroup)
            handHeight = min(max(Double(p.y / (length * tall)), -0.06), 0.06)
            return true
        }
        if value.entity.name == "string" && player.toy == 0 {
            let p = value.convert(value.location3D, from: .local, to: guitarGroup)
            let x0 = -width / 2, x1 = width / 2, xs = x0 + width * Float(1 - stringLength)
            guard p.x > xs + 0.004 else { return true }
            let along = Double((p.x - xs) / (x1 - xs)), pull = Double(p.y / (0.1 * width))
            hold = (min(max(along, 0.06), 0.94), min(max(pull, -1), 1))
            return true
        }
        return false
    }

    func dragEnded(player: GuidePlayer) {
        handHeight = 0
        if let held = hold {
            hold = nil
            let strength = max(0.08, abs(held.pull))
            ring = (held.p, held.pull < 0 ? -1 : 1, strength, player.time)
            synth.pluck(frequency: 220 / stringLength, strength: strength, at: held.p)
        }
    }

    /// Tapping a fret presses the string there and plucks it; tapping the pressed fret lets it ring open again.
    func tap(_ value: EntityTargetValue<SpatialTapGesture.Value>, player: GuidePlayer) {
        guard player.hasEnded, player.toy == 0, value.entity.name.hasPrefix("fret-"),
              let k = Int(value.entity.name.dropFirst(5)) else { return }
        let now = Int((-12 * log2(stringLength)).rounded())
        stringLength = k == now ? 1 : pow(2, -Double(k) / 12)
        ring = (0.25, 1, 0.7, player.time)
        synth.pluck(frequency: 220 / stringLength, strength: 0.7, at: 0.25)
    }

    // MARK: - Rope

    private func showRope(y: [Double], hand height: Double, loops: Int) {
        let n = max(1, y.count - 1)
        let points = y.enumerated().map { i, v -> SIMD3<Float> in [Float(i) / Float(n) * length - length / 2, Float(v) * length * tall, 0] }
        rope.model = MeshKit.tubes([points], radius: 0.004).map { ModelComponent(mesh: $0, materials: [Paint.glow("#e8a33a")]) }
        hand.position = [-length / 2 - 0.012, Float(height) * length * tall, 0]
        while stillPoints.count < 3 {
            let dot = ModelEntity(mesh: .generateSphere(radius: 0.006), materials: [Paint.glow("#c2410c")])
            ropeGroup.addChild(dot)
            stillPoints.append(dot)
        }
        for (index, dot) in stillPoints.enumerated() {
            let m = index + 1
            dot.isEnabled = loops > 1 && m < loops
            dot.position = [Float(m) / Float(max(loops, 1)) * length - length / 2, 0, 0.004]
        }
    }

    private func showLiveRope(player: GuidePlayer) -> [BenchLabel] {
        if lastToy != 1 { ropeReset = true }
        let y = player.engine.call("ropeLive", [ropeReset, player.time, handHeight], as: [Double].self) ?? []
        ropeReset = false
        // How fast the hand shakes, from the times it passes upward through the middle.
        if lastHand < 0, handHeight >= 0, abs(handHeight - lastHand) > 0.0005 { crossings.append(player.time) }
        crossings = crossings.filter { player.time - $0 < 4 }
        lastHand = handHeight
        handSwing = max(abs(handHeight), handSwing * 0.995)
        ropeSwing = max(y.map(abs).max() ?? 0, ropeSwing * 0.995)
        var rate = 0.0
        if crossings.count >= 3, let first = crossings.first, let last = crossings.last, last > first {
            rate = Double(crossings.count - 1) / (last - first)
        }
        let n = Int(rate.rounded()), ratio = handSwing > 0.004 ? ropeSwing / handSwing : 0
        let inStep = n >= 1 && abs(rate - Double(n)) < 0.12 && ratio > 3
        showRope(y: y, hand: handHeight, loops: inStep ? n : 0)
        var out: [BenchLabel] = []
        if rate > 0.3 {
            let shakes = (rate * 10).rounded() / 10
            out.append(BenchLabel(id: "rate", text: "\(shakes.formatted()) shakes a second", at: [0, -0.2], anchor: nil, tone: "ink"))
        } else {
            out.append(BenchLabel(id: "rate", text: "pinch the hand and shake it", at: [0, -0.2], anchor: nil, tone: "ink"))
        }
        if inStep {
            out.append(BenchLabel(id: "step", text: "in step: \(n) loop\(n > 1 ? "s" : "")", at: [0.5, -0.2], anchor: nil, tone: "accent"))
        } else if ratio > 0.5 {
            out.append(BenchLabel(id: "step", text: "swing: \(Int(ratio.rounded()))× your hand", at: [0.5, -0.2], anchor: nil, tone: "ink"))
        }
        return out
    }

    // MARK: - Guitar

    private func buildGuitar() {
        let board = ModelEntity(mesh: .generateBox(size: [width + 0.03, 0.075, 0.02]), materials: [Paint.lit("#8a5a3b")])
        board.position = [0, 0, -0.016]
        guitarGroup.addChild(board)
        let nut = ModelEntity(mesh: .generateBox(size: [0.008, 0.08, 0.024]), materials: [Paint.lit("#efe6d4")])
        nut.position = [-width / 2 - 0.004, 0, -0.012]
        let bridge = ModelEntity(mesh: .generateBox(size: [0.01, 0.08, 0.026]), materials: [Paint.lit("#2a2a2e")])
        bridge.position = [width / 2 + 0.005, 0, -0.011]
        for child in [nut, bridge] { guitarGroup.addChild(child) }
        for k in 1...12 {
            let x = -width / 2 + width * (1 - pow(2, -Float(k) / 12))
            let fret = ModelEntity(mesh: .generateBox(size: [0.0025, 0.075, 0.004]), materials: [Paint.lit("#ebe1d2", roughness: 0.3, metallic: true)])
            fret.position = [x, 0, -0.005]
            // A wide, invisible target over each fret, for tapping.
            let target = Entity()
            target.name = "fret-\(k)"
            target.position = [x - 0.008, -0.025, 0]
            target.components.set(InputTargetComponent())
            target.components.set(CollisionComponent(shapes: [.generateBox(size: [0.018, 0.025, 0.03])]))
            guitarGroup.addChild(fret)
            guitarGroup.addChild(target)
        }
        let grab = Entity()
        grab.name = "string"
        grab.position = [0, 0.02, 0]
        grab.components.set(InputTargetComponent())
        grab.components.set(CollisionComponent(shapes: [.generateBox(size: [width, 0.05, 0.04])]))
        for child in [string, stopped, finger, fingertip, grab] { guitarGroup.addChild(child) }
    }

    private func showString(state: StringsState, player: GuidePlayer) {
        let since = player.moment.since ?? 0
        if state.stage != lastStage || since < lastSince { lastStage = state.stage; lastSince = -1 }
        if player.isPlaying {
            for pluck in state.plucks ?? [] where pluck.count == 2 && lastSince < pluck[0] && since >= pluck[0] {
                synth.pluck(frequency: 220 / pluck[1], strength: 1, at: 0.25)
            }
        }
        lastSince = since
        drawString(shape: state.string ?? [], len: state.len ?? 1, strength: 1, pull: state.pull ?? 0, p: state.p ?? 0.25)
        anchors["above"] = [0, 0.1, 0]
        anchors["below"] = [0, -0.085, 0]
        let x0 = -width / 2, xs = x0 + width * Float(1 - (state.len ?? 1))
        anchors["pluck"] = [xs + Float(state.p ?? 0.25) * (width / 2 - xs), 0.1, 0]
    }

    private func showLiveString(player: GuidePlayer) -> [BenchLabel] {
        var shape: [Double] = [], strength = 1.0, pull = 0.0, p = 0.25
        if let hold {
            p = hold.p
            pull = hold.pull
            shape = player.engine.call("string", [stringLength, p, 1, -1, pull], as: [Double].self) ?? []
        } else if let ring {
            p = ring.p
            strength = ring.strength
            shape = player.engine.call("string", [stringLength, p, ring.sign, player.time - ring.start, 0], as: [Double].self) ?? []
        }
        drawString(shape: shape, len: stringLength, strength: strength, pull: pull, p: p)
        anchors["above"] = [0, 0.1, 0]
        anchors["below"] = [0, -0.085, 0]
        let text = stringLength < 0.999 ? (stringLength > 0.51 ? "\(Int((stringLength * 100).rounded()))% of it rings" : "pressed at the middle") : "open string"
        return [BenchLabel(id: "title", text: "a guitar string", at: nil, anchor: "above", tone: "ink"),
                BenchLabel(id: "length", text: text, at: nil, anchor: "below", tone: stringLength < 0.999 ? "warm" : "accent")]
    }

    private func drawString(shape: [Double], len: Double, strength: Double, pull: Double, p: Double) {
        let x0 = -width / 2, x1 = width / 2, xs = x0 + width * Float(1 - len), amp = 0.1 * width * Float(strength)
        let count = max(1, shape.count - 1)
        let points: [SIMD3<Float>] = shape.isEmpty ? [[xs, 0, 0], [x1, 0, 0]] : shape.enumerated().map { i, v in
            [xs + Float(i) / Float(count) * (x1 - xs), Float(v) * amp, 0]
        }
        string.model = MeshKit.tubes([points], radius: 0.0018).map { ModelComponent(mesh: $0, materials: [Paint.glow("#f5f0e6")]) }
        stopped.isEnabled = len < 0.999
        if len < 0.999 {
            stopped.model = MeshKit.tubes([[[x0, 0, 0], [xs, 0, 0]]], radius: 0.0016).map { ModelComponent(mesh: $0, materials: [Paint.glow("#e1e1e6")]) }
        }
        finger.isEnabled = len < 0.999
        finger.position = [xs, 0, 0.012]
        fingertip.isEnabled = pull != 0
        fingertip.position = [xs + Float(p) * (x1 - xs), Float(pull) * 0.1 * width + (pull > 0 ? 0.009 : -0.009), 0]
    }

    private func orient() {
        root.orientation = simd_quatf(angle: .pi * 8 / 180, axis: [1, 0, 0]) * simd_quatf(angle: yaw, axis: [0, 1, 0])
    }
}
