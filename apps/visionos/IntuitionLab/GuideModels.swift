import Foundation

/// The guide's text, as published on the website (`record.json`, field `scene`).
struct GuideSpec: Decodable {
    struct Beat: Decodable {
        let title: String
        let body: String
    }

    let title: String
    let subtitle: String?
    let why: String?
    let opening: String?
    let takeaway: String?
    let kind: String
    let beats: [Beat]
    let mass: Double?
    let distance: Double?
}

/// Chapter and sentence timing, computed by the website's `timelineOf`.
struct GuideTimeline: Decodable {
    struct Line: Decodable {
        let text: String
        let start: Double
        let end: Double
    }

    struct Chapter: Decodable {
        let start: Double
        let end: Double
        let lines: [Line]
    }

    let chapters: [Chapter]
    let total: Double

    /// The chapter playing at `time`, matching the web player's rule.
    func chapterIndex(at time: Double) -> Int {
        chapters.firstIndex { time < $0.end } ?? max(0, chapters.count - 1)
    }

    /// The sentence shown at `time` within a chapter.
    func line(at time: Double, in chapter: Int) -> String {
        guard chapters.indices.contains(chapter) else { return "" }
        let lines = chapters[chapter].lines
        return (lines.last { $0.start <= time } ?? lines.first)?.text ?? ""
    }
}

/// A moment of playback, passed to the website's engine as its drawing state.
struct GuideMoment: Equatable {
    var stage: Int
    /// Seconds since the chapter started; nil shows the still preview the website shows before playback.
    var since: Double?
    var time: Double
    /// True once the guide has ended or the viewer chose to try it, as in the web player's live mode.
    var isLive: Bool
    /// The guide's two controls, as the website's sliders set them.
    var mass: Double
    var distance: Double

    static func preview(mass: Double, distance: Double) -> GuideMoment {
        GuideMoment(stage: 0, since: nil, time: 0, isLive: false, mass: mass, distance: distance)
    }
}

/// One of a picture's short labels: either at a point in the scene's own coordinates (`at`) or at a named place
/// the scene knows how to find (`anchor`).
struct BenchLabel: Decodable, Identifiable {
    let id: String
    let text: String
    let at: [Double]?
    let anchor: String?
    let tone: String
}

/// The labels of any bench state.
struct BenchLabels: Decodable {
    let labels: [BenchLabel]
}

/// The double-slit bench at one moment, in bench units: x along the beam (laser at 0), y across, z up.
struct BenchState: Decodable {
    struct Geometry: Decodable, Equatable {
        let barrierX: Double
        let screenX: Double
        let slitOffset: Double
        let slitHalfWidth: Double
        let slitHalfHeight: Double

        enum CodingKeys: String, CodingKey {
            case barrierX = "XB", screenX = "XS", slitOffset = "yc", slitHalfWidth = "sw", slitHalfHeight = "zs"
        }
    }

    struct Arc: Decodable {
        let y: Double
        let r: Double
        let alpha: Double
        let marked: Bool
    }

    struct Photon: Decodable {
        let pos: [Double]
        let prev: [Double]
        let a: Double
        let c: String
    }

    struct Rings: Decodable {
        let fade: Double
        let points: [[Double]]
    }

    let stage: Int
    let openFraction: Double
    let landed: Int
    let geometry: Geometry
    let dotsKey: String
    let fresh: Bool
    let flash: Double
    let fronts: [Double]
    let frontAlpha: Double
    let arcs: [Arc]
    let photon: Photon?
    let sensor: Bool
    let up: Double
    let click: Double
    let dim: Double
    let rings: Rings?
    let labels: [BenchLabel]

    enum CodingKeys: String, CodingKey {
        case stage, geometry, fresh, flash, fronts, frontAlpha, arcs, photon, sensor, up, click, dim, rings, labels
        case openFraction = "A", landed = "n", dotsKey = "dots"
    }
}

/// One landed dot: where it is on the screen and whether it passed the sensor's slit.
struct BenchDot {
    let y: Double
    let z: Double
    let clicked: Bool
}
