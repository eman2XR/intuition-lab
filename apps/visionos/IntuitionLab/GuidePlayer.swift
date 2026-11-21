import Foundation
import Observation

/// Plays a guide: advances time, tracks the chapter and the sentence on screen, holds the two controls the website's
/// sliders set, and asks the engine for the bench. After the guide ends, or when the viewer chooses to try it, it is
/// live, as the web player is, and a live clock keeps running for things that move.
@Observable
@MainActor
final class GuidePlayer {
    let engine: GuideEngine

    private(set) var time: Double = 0
    private(set) var isPlaying = false
    private(set) var hasStarted = false
    private(set) var hasEnded = false
    private(set) var chapter = 0
    private(set) var caption = ""
    private(set) var moment: GuideMoment
    private(set) var state: Data?
    private(set) var labels: [BenchLabel] = []
    /// The two controls, in the website's slider units.
    private(set) var mass: Double
    private(set) var distance: Double
    /// Which toy a live picture with more than one shows (for the guitar guide: the string or the rope).
    var toy = 0

    var spec: GuideSpec { engine.spec }
    var timeline: GuideTimeline { engine.timeline }
    var kind: String { engine.spec.kind }

    init(engine: GuideEngine) {
        self.engine = engine
        mass = engine.spec.mass ?? 1
        distance = engine.spec.distance ?? 1
        moment = .preview(mass: engine.spec.mass ?? 1, distance: engine.spec.distance ?? 1)
        refresh()
    }

    func togglePlay() {
        if isPlaying {
            isPlaying = false
        } else {
            if hasEnded { restart() }
            hasStarted = true
            isPlaying = true
            refresh()
        }
    }

    func restart() {
        time = 0
        hasEnded = false
        hasStarted = true
        isPlaying = true
        mass = spec.mass ?? 1
        distance = spec.distance ?? 1
        refresh()
    }

    /// Jumps to the start of a chapter, as the web player's chapter ticks do.
    func goToChapter(_ index: Int) {
        let index = min(max(0, index), timeline.chapters.count - 1)
        time = timeline.chapters[index].start + 0.001
        hasStarted = true
        hasEnded = false
        refresh()
    }

    /// Sets the first control (for seasons, the tilt as a share of Earth's real 23.44 degrees).
    func setMass(_ value: Double) {
        guard value != mass else { return }
        mass = value
        refresh()
    }

    /// Sets the second control (for seasons, the time of year: 1 to 2.5 runs once around the orbit).
    func setDistance(_ value: Double) {
        guard value != distance else { return }
        distance = value
        refresh()
    }

    /// Skips to the end, where the viewer can play with the picture.
    func tryIt() {
        time = timeline.total
        hasStarted = true
        hasEnded = true
        isPlaying = false
        refresh()
    }

    /// Shows a moment, paused: `chapter` and seconds into it. Used by the `-chapter` and `-seconds` launch arguments
    /// (chapter numbers start at 1).
    func show(chapter index: Int, seconds: Double) {
        let index = min(max(0, index), timeline.chapters.count - 1)
        time = min(timeline.total, timeline.chapters[index].start + max(0, seconds))
        hasStarted = true
        hasEnded = false
        isPlaying = false
        refresh()
    }

    /// Advances playback, or the live clock after the end, in real time while the view is on screen.
    func run() async {
        let clock = ContinuousClock()
        var last = clock.now
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(16))
            let now = clock.now
            let elapsed = min((now - last) / .seconds(1), 0.1)
            last = now
            if isPlaying {
                advance(by: elapsed)
            } else if hasEnded {
                time += elapsed
                refresh()
            }
        }
    }

    private func advance(by seconds: Double) {
        time += seconds
        if time >= timeline.total {
            time = timeline.total
            isPlaying = false
            hasEnded = true
        }
        refresh()
    }

    private func refresh() {
        let index = hasEnded ? timeline.chapters.count - 1 : timeline.chapterIndex(at: time)
        if index != chapter { chapter = index }
        let line = hasStarted && !hasEnded ? timeline.line(at: time, in: index) : ""
        if line != caption { caption = line }
        let next: GuideMoment
        if !hasStarted {
            next = .preview(mass: mass, distance: distance)
        } else {
            next = GuideMoment(stage: index, since: max(0, time - timeline.chapters[index].start), time: time,
                               isLive: hasEnded, mass: mass, distance: distance)
        }
        if next != moment || state == nil {
            moment = next
            state = engine.state(at: next)
            labels = state.flatMap { try? JSONDecoder().decode(BenchLabels.self, from: $0).labels } ?? []
        }
    }
}
