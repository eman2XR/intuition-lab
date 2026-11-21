import SwiftUI

@main
struct IntuitionLabApp: App {
    var body: some Scene {
        WindowGroup(id: StartWindow.labID) {
            GuideRoot()
        }
        .windowStyle(.volumetric)
        .defaultSize(width: 1.0, height: 0.8, depth: 0.8, in: .meters)

        // Opening the app from Home can hand it an ordinary window instead of the volume; this one opens the lab's
        // volume and closes itself.
        WindowGroup(id: StartWindow.id) {
            StartWindow()
        }
        .defaultSize(width: 420, height: 240)
    }
}

/// A small ordinary window that opens the lab's volume as soon as it appears; the volume closes it once it is open.
struct StartWindow: View {
    static let id = "start"
    static let labID = "lab"

    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 18) {
            Text("Intuition Lab").font(.title.bold())
            Button("Open the lab") { open() }
        }
        .padding(40)
        .task { open() }
    }

    private func open() {
        openWindow(id: Self.labID)
    }
}

/// A guide the app can show in 3D, by its picture kind.
struct GuideEntry: Identifiable {
    let kind: String
    let short: String
    var id: String { kind }
}

enum GuideCatalog {
    static let guides = [
        GuideEntry(kind: "seasons", short: "Seasons"),
        GuideEntry(kind: "standing-waves", short: "Guitar string"),
        GuideEntry(kind: "two-slit-particles", short: "Double slit"),
    ]
}

/// The guides, loaded once each, and the one on show.
struct GuideRoot: View {
    @State private var selection: String
    @State private var guides: [String: LoadedGuide]
    @Environment(\.dismissWindow) private var dismissWindow

    init() {
        let defaults = UserDefaults.standard
        let chosen = defaults.string(forKey: "guide").flatMap { kind in GuideCatalog.guides.first { $0.kind == kind }?.kind }
            ?? GuideCatalog.guides[0].kind
        var loaded: [String: LoadedGuide] = [:]
        for guide in GuideCatalog.guides {
            loaded[guide.kind] = LoadedGuide.load(kind: guide.kind, launchArguments: guide.kind == chosen)
        }
        _selection = State(initialValue: chosen)
        _guides = State(initialValue: loaded)
    }

    var body: some View {
        content
            .onAppear { dismissWindow(id: StartWindow.id) }
    }

    @ViewBuilder
    private var content: some View {
        switch guides[selection] ?? .failed("Unknown guide.") {
        case .ready(let player):
            GuideVolume(player: player, selection: $selection)
                .id(selection)
        case .failed(let message):
            Text(message)
                .padding(40)
                .glassBackgroundEffect()
        }
    }
}

/// A bundled guide, or why it could not be loaded.
enum LoadedGuide {
    case ready(GuidePlayer)
    case failed(String)

    /// Launch arguments for checking a moment without tapping: `-guide`, `-chapter N -seconds S` (paused),
    /// `-autoplay YES`, `-tryit YES`, `-mass`, `-distance` and `-toy`.
    @MainActor
    static func load(kind: String, launchArguments: Bool) -> LoadedGuide {
        do {
            let player = GuidePlayer(engine: try GuideEngine(kind: kind))
            guard launchArguments else { return .ready(player) }
            let defaults = UserDefaults.standard
            if defaults.object(forKey: "chapter") != nil {
                player.show(chapter: defaults.integer(forKey: "chapter") - 1, seconds: defaults.double(forKey: "seconds"))
            }
            if defaults.bool(forKey: "tryit") { player.tryIt() }
            if defaults.object(forKey: "mass") != nil { player.setMass(defaults.double(forKey: "mass")) }
            if defaults.object(forKey: "distance") != nil { player.setDistance(defaults.double(forKey: "distance")) }
            if defaults.object(forKey: "toy") != nil { player.toy = defaults.integer(forKey: "toy") }
            if defaults.bool(forKey: "autoplay") { player.togglePlay() }
            return .ready(player)
        } catch {
            return .failed(String(describing: error))
        }
    }
}
