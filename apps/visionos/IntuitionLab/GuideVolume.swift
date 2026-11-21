import RealityKit
import SwiftUI

/// A guide as a volume: its picture in 3D with its labels, and a panel below with the guide picker, the subtitles
/// and the controls.
struct GuideVolume: View {
    let player: GuidePlayer
    @Binding var selection: String

    @State private var scene: any GuideScene
    @State private var dragOwnedByScene: Bool?
    @State private var dragStartYaw: Float?

    private static let panelID = "player-panel"

    init(player: GuidePlayer, selection: Binding<String>) {
        self.player = player
        _selection = selection
        _scene = State(initialValue: GuideScenes.make(for: player))
    }

    var body: some View {
        let state = player.state
        let labels = Self.merged(player.labels, scene.ownLabels)
        RealityView { content, attachments in
            content.add(scene.root)
            if let panel = attachments.entity(for: Self.panelID) {
                panel.position = [0, -0.3, 0.3]
                content.add(panel)
            }
        } update: { _, attachments in
            if let state { scene.apply(state, player: player, attachments: attachments) }
        } attachments: {
            Attachment(id: Self.panelID) {
                PlayerPanel(player: player, selection: $selection)
            }
            ForEach(labels) { label in
                Attachment(id: label.id) {
                    BenchLabelView(label: label)
                }
            }
        }
        .gesture(
            DragGesture(minimumDistance: 2)
                .targetedToAnyEntity()
                .onChanged { value in
                    // The scene decides on the first movement whether this drag plays with the picture or turns it.
                    if dragOwnedByScene == nil {
                        dragOwnedByScene = scene.drag(value, player: player)
                    } else if dragOwnedByScene == true {
                        _ = scene.drag(value, player: player)
                    }
                    if dragOwnedByScene == false {
                        let start = dragStartYaw ?? scene.yaw
                        dragStartYaw = start
                        scene.yaw = start + Float(value.translation.width) * 0.004
                    }
                }
                .onEnded { _ in
                    if dragOwnedByScene == true { scene.dragEnded(player: player) }
                    dragOwnedByScene = nil
                    dragStartYaw = nil
                }
        )
        .simultaneousGesture(
            SpatialTapGesture()
                .targetedToAnyEntity()
                .onEnded { value in scene.tap(value, player: player) }
        )
        .task { await player.run() }
    }

    /// The engine's labels and the scene's own, one per id (the scene's win).
    private static func merged(_ engine: [BenchLabel], _ own: [BenchLabel]) -> [BenchLabel] {
        let ownIDs = Set(own.map(\.id))
        return engine.filter { !ownIDs.contains($0.id) } + own
    }
}

/// One of the picture's short labels, in the website's tones.
struct BenchLabelView: View {
    let label: BenchLabel

    var body: some View {
        Text(label.text)
            .font(.system(size: 14, weight: .bold))
            .tracking(label.tone == "pill" ? 0 : 1)
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(.white.opacity(label.tone == "pill" ? 0.92 : 0.7), in: Capsule())
    }

    private var color: Color {
        switch label.tone {
        case "accent": Color(UIColor(hex: "#b45309"))
        case "warm": Color(UIColor(hex: "#c2410c"))
        case "violet": Color(UIColor(hex: "#7a3fb2"))
        default: Color(white: 0.1).opacity(0.85)
        }
    }
}

/// The guide picker; the title and why line before playback; the chapter, the sentence on screen and the controls
/// while playing; the takeaway and the picture's own controls once it can be played with.
struct PlayerPanel: View {
    let player: GuidePlayer
    @Binding var selection: String

    var body: some View {
        VStack(spacing: 14) {
            Picker("Guide", selection: $selection) {
                ForEach(GuideCatalog.guides) { guide in
                    Text(guide.short).tag(guide.kind)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 520)

            if !player.hasStarted {
                Text(player.spec.title).font(.title2.bold())
                if let why = player.spec.why {
                    Text(why).foregroundStyle(.secondary)
                }
            } else if player.hasEnded {
                if let takeaway = player.spec.takeaway {
                    Text(takeaway).font(.title3)
                }
                liveControls
            } else {
                Text(chapterHeading).font(.callout).foregroundStyle(.secondary)
                Text(player.caption)
                    .font(.title2)
                    .lineLimit(3, reservesSpace: true)
            }
            HStack(spacing: 18) {
                Button("Previous chapter", systemImage: "backward.end.fill") {
                    player.goToChapter(player.chapter - 1)
                }
                .disabled(!player.hasStarted || player.chapter == 0)
                Button(player.isPlaying ? "Pause" : "Play", systemImage: player.isPlaying ? "pause.fill" : "play.fill") {
                    player.togglePlay()
                }
                Button("Next chapter", systemImage: "forward.end.fill") {
                    player.goToChapter(player.chapter + 1)
                }
                .disabled(!player.hasStarted || player.hasEnded || player.chapter >= player.timeline.chapters.count - 1)
                Button("Restart", systemImage: "arrow.counterclockwise") {
                    player.restart()
                }
                .disabled(!player.hasStarted)
                Button("Try it yourself", systemImage: "hand.point.up.left.fill") {
                    player.tryIt()
                }
                .disabled(player.hasEnded)
            }
            .labelStyle(.iconOnly)
        }
        .multilineTextAlignment(.center)
        .padding(28)
        .frame(width: 760)
        .glassBackgroundEffect()
    }

    @ViewBuilder
    private var liveControls: some View {
        switch player.kind {
        case "seasons":
            VStack(spacing: 8) {
                Text("Pinch the top of Earth's axis to tilt it, or drag Earth around the Sun.")
                    .font(.callout).foregroundStyle(.secondary)
                HStack {
                    Text("Tilt")
                    Slider(value: Binding(get: { player.mass }, set: { player.setMass($0) }), in: 0...1)
                    Text("\((player.mass * 23.44).formatted(.number.precision(.fractionLength(1))))°")
                        .monospacedDigit()
                        .frame(width: 60, alignment: .trailing)
                }
                .frame(width: 460)
            }
        case "standing-waves":
            VStack(spacing: 8) {
                Picker("Play with", selection: Binding(get: { player.toy }, set: { player.toy = $0 })) {
                    Text("Guitar string").tag(0)
                    Text("Rope").tag(1)
                }
                .pickerStyle(.segmented)
                .frame(width: 320)
                Text(player.toy == 0 ? "Pinch the string, pull it and let go, or tap a fret."
                                     : "Pinch the hand at the rope's end and shake it up and down.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        default:
            EmptyView()
        }
    }

    private var chapterHeading: String {
        let count = player.timeline.chapters.count
        let title = player.spec.beats.indices.contains(player.chapter) ? player.spec.beats[player.chapter].title : ""
        return "\(player.chapter + 1) of \(count) · \(title)"
    }
}
