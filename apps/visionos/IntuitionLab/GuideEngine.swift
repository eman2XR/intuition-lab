import Foundation
import JavaScriptCore

/// Runs the website's own `physics.js` and `scene.js` in JavaScriptCore for one guide, so the app follows the same
/// text, timeline, choreography and physics as the web guide. Only the drawing is native.
@MainActor
final class GuideEngine {
    enum LoadError: Error, CustomStringConvertible {
        case missingResource(String)
        case script(String)
        case unsupportedKind(String)

        var description: String {
            switch self {
            case .missingResource(let name): "Missing bundled file \(name)."
            case .script(let message): "The guide's script failed: \(message)"
            case .unsupportedKind(let kind): "The picture '\(kind)' has no 3D bench yet."
            }
        }
    }

    private final class ScriptErrors {
        var messages: [String] = []
    }

    let spec: GuideSpec
    let timeline: GuideTimeline

    private let context: JSContext
    private let errors = ScriptErrors()
    private let stateFunction: JSValue
    private let dotsFunction: JSValue
    private let callFunction: JSValue
    private let decoder = JSONDecoder()

    /// Glue between the app and the website's `CouncilBench` export. `since < 0` stands for the website's preview.
    private static let bridge = """
    var __spec = JSON.parse(__recordText).scene;
    var __timeline = CouncilBench.timeline(__spec);
    function __moment(stage, since, t, live, mass, distance) {
      var st = { t: t, stage: stage, live: live, labels: true, chapters: __timeline.chapters, mass: mass, distance: distance };
      if (since >= 0) { st.since = since; }
      return st;
    }
    function __state(stage, since, t, live, mass, distance) {
      return JSON.stringify(CouncilBench.state(__spec.kind, __spec, __moment(stage, since, t, live, mass, distance)));
    }
    function __dots(stage, since, t, live, mass, distance, count) {
      var st = __moment(stage, since, t, live, mass, distance);
      var dots = CouncilBench.dots(__spec.kind, __spec, st, count);
      return JSON.stringify(dots.map(function (d) { return [d[0], d[1], d[2] ? 1 : 0]; }));
    }
    function __call(name, argsJSON) {
      var args = JSON.parse(argsJSON);
      return JSON.stringify(CouncilBench.call.apply(null, [__spec.kind, name].concat(args)));
    }
    """

    /// Loads the guide bundled as `guides/<kind>.json`.
    init(kind: String, bundle: Bundle = .main) throws {
        guard let context = JSContext() else { throw LoadError.script("JavaScriptCore is unavailable.") }
        self.context = context
        let errors = errors
        context.exceptionHandler = { _, exception in
            errors.messages.append(exception?.toString() ?? "Unknown error")
        }

        // The website's files expect a browser; these two names are all they touch outside one.
        context.evaluateScript("var window = globalThis; var document = { getElementById: function () { return null; } };")
        for name in ["physics", "scene"] {
            let source = try Self.text(named: name, extension: "js", subdirectory: nil, in: bundle)
            context.evaluateScript(source, withSourceURL: URL(string: "intuition-lab://web/\(name).js"))
            try Self.check(errors)
        }
        context.setObject(try Self.text(named: kind, extension: "json", subdirectory: "guides", in: bundle),
                          forKeyedSubscript: "__recordText" as NSString)
        context.evaluateScript(Self.bridge)
        try Self.check(errors)

        let kinds = context.evaluateScript("JSON.stringify(CouncilBench.kinds())")?.toString() ?? "[]"
        guard let specJSON = context.evaluateScript("JSON.stringify(__spec)")?.toString(),
              let timelineJSON = context.evaluateScript("JSON.stringify(__timeline)")?.toString(),
              let state = context.objectForKeyedSubscript("__state"),
              let dots = context.objectForKeyedSubscript("__dots"),
              let call = context.objectForKeyedSubscript("__call")
        else { throw LoadError.script("The bridge did not load.") }

        spec = try decoder.decode(GuideSpec.self, from: Data(specJSON.utf8))
        timeline = try decoder.decode(GuideTimeline.self, from: Data(timelineJSON.utf8))
        guard (try? decoder.decode([String].self, from: Data(kinds.utf8)))?.contains(spec.kind) == true else {
            throw LoadError.unsupportedKind(spec.kind)
        }
        stateFunction = state
        dotsFunction = dots
        callFunction = call
    }

    /// The bench at a moment as JSON, exactly as the website computes it.
    func state(at moment: GuideMoment) -> Data? {
        guard let json = stateFunction.call(withArguments: arguments(for: moment))?.toString(), json != "null" else {
            return nil
        }
        return Data(json.utf8)
    }

    /// The first `count` landed dots of the double-slit bench for a moment, in landing order.
    func dots(at moment: GuideMoment, count: Int) -> [BenchDot] {
        let call = dotsFunction.call(withArguments: arguments(for: moment) + [count])
        guard let json = call?.toString(),
              let rows = try? decoder.decode([[Double]].self, from: Data(json.utf8))
        else { return [] }
        return rows.compactMap { row in
            row.count == 3 ? BenchDot(y: row[0], z: row[1], clicked: row[2] > 0.5) : nil
        }
    }

    /// Calls one of the bench's own functions, such as the string's shape or the rope the viewer shakes.
    func call<Result: Decodable>(_ name: String, _ arguments: [Any], as type: Result.Type) -> Result? {
        guard let argsData = try? JSONSerialization.data(withJSONObject: arguments),
              let argsJSON = String(data: argsData, encoding: .utf8),
              let json = callFunction.call(withArguments: [name, argsJSON])?.toString()
        else { return nil }
        return try? decoder.decode(Result.self, from: Data(json.utf8))
    }

    /// The website's land outlines (Natural Earth, public domain): rings of longitude and latitude in half degrees.
    func land() -> [[Double]] {
        guard let json = context.evaluateScript("JSON.stringify(CouncilBench.land())")?.toString(),
              let rings = try? decoder.decode([[Double]].self, from: Data(json.utf8))
        else { return [] }
        return rings
    }

    private func arguments(for moment: GuideMoment) -> [Any] {
        [moment.stage, moment.since ?? -1, moment.time, moment.isLive, moment.mass, moment.distance]
    }

    private static func text(named name: String, extension ext: String, subdirectory: String?,
                             in bundle: Bundle) throws -> String {
        guard let url = bundle.url(forResource: name, withExtension: ext, subdirectory: subdirectory) else {
            throw LoadError.missingResource("\(subdirectory.map { "\($0)/" } ?? "")\(name).\(ext)")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static func check(_ errors: ScriptErrors) throws {
        if let first = errors.messages.first { throw LoadError.script(first) }
    }
}
