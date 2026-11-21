# Intuition Lab for Apple Vision Pro

A volumetric visionOS app that shows three of the site's guides in 3D: why summer is warmer than winter (Earth's
tilt, which you can change yourself), a guitar string and a rope you can pluck and shake, and the double-slit
experiment as a bench you can walk around.

## How it stays compatible with the website

The app does not re-implement the guides. It runs the website's own code and text:

- `web/physics.js` and `web/scene.js` run in JavaScriptCore (`GuideEngine.swift`). Each guide's engine in `scene.js`
  is split into a pure plan (`seasonsPlan`, `guitarMoment`, `particlesBench`) and the website's 2D drawing of it. The
  app reads the same state through `window.CouncilBench` (`state`, `timeline`, `call`, `land`) and draws it with
  RealityKit (`SeasonsScene.swift`, `StringsScene.swift`, `ParticlesScene.swift`).
- The chapter and sentence timing comes from the same `timelineOf` the web player uses.
- The words come from the published records, copied into the app as `guides/<kind>.json` when it builds.

`physics.js` and `scene.js` are bundle resources referenced in place by `project.yml`, and the records are copied at
build time, so there are no copies to keep in sync: a fix to a guide on the website reaches the app on its next build.
Only the drawing is native.

When changing a plan function or a `BENCHES` entry, keep it free of drawing and browser APIs, and check that the
website still renders byte-identical frames.

## Build and run

```sh
cd apps/visionos
xcodegen generate
xcodebuild -project IntuitionLab.xcodeproj -scheme IntuitionLab \
  -destination 'platform=visionOS Simulator,name=Apple Vision Pro' -derivedDataPath build build
```

On a headset (Sign to Run Locally, no team needed):

```sh
xcodebuild -project IntuitionLab.xcodeproj -scheme IntuitionLab -destination 'generic/platform=visionOS' -derivedDataPath build build
xcrun devicectl device install app --device <udid> build/Build/Products/Debug-xros/IntuitionLab.app
xcrun devicectl device process launch --device <udid> org.intuitionlab.vision
```

Or open `IntuitionLab.xcodeproj` in Xcode after `xcodegen generate` and run on a Vision Pro or its simulator. The
project and `Info.plist` are generated and not checked in.

Launch arguments for checking a moment without tapping: `-guide seasons` (or `standing-waves`, `two-slit-particles`)
picks the guide; `-chapter 3 -seconds 9.9` shows that moment paused (chapters start at 1); `-autoplay YES` plays from
there; `-tryit YES` skips to the end, where `-mass` (the tilt, 0 to 1), `-distance` (the time of year) and `-toy`
(0 string, 1 rope) set the picture.

## Windows

The app opens as a volume. When visionOS hands it an ordinary window instead (opening it from Home on visionOS 27
does), a small start window opens the volume and the volume closes it, so either kind of launch ends in the lab.

## Controls

The panel under the picture has the guide picker; the guide's title and why line, then the chapter and the sentence
being spoken, and the takeaway at the end. Buttons: previous chapter, play or pause, next chapter, restart, and try it
yourself (skips to the end). Dragging the picture where it does nothing else turns it.

After playback:

- Seasons: pinch the top of Earth's axis to tilt it (or use the Tilt slider), and drag Earth around the Sun to change
  the time of year. Paris's daily circle shows how long its day is.
- Guitar string: pinch the string, pull it and let go, or tap a fret to shorten it; switch to the rope and shake the
  hand at its end.
