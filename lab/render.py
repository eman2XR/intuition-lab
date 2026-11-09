"""Render the actual webpage at deterministic times for agent image review."""
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
import mimetypes
from . import ROOT

ORIGIN = 'http://council.local'


def serve_local(route, folder, prefix='/'):
    """Fulfil a request for a file under folder, or a 404; shared by the capture and build-gate routers."""
    path = unquote(urlparse(route.request.url).path)
    if not path.startswith(prefix) or '\0' in path:
        return route.fulfill(status=404, body='')
    target = (folder / path[len(prefix):]).resolve()
    if target.is_dir():
        target = target / 'index.html'
    if not target.is_relative_to(folder) or not target.is_file():
        return route.fulfill(status=404, body='')
    route.fulfill(status=200, body=target.read_bytes(), headers={'Cache-Control': 'no-store'},
                  content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream')


def route_files(page, folder, prefix='/'):
    """Serve a folder through request interception, so no local socket or server is needed."""
    folder = folder.resolve()
    page.route('**/*', lambda route: route.abort())  # Captures never depend on outside network.
    page.route(ORIGIN + '/**', lambda route: serve_local(route, folder, prefix))


def launch(p):
    """Prefer Chromium (bundled, then installed Chrome); fall back to WebKit where Chromium cannot start.
    Every launch uses a temporary profile, never the user's browser session."""
    options = []
    if Path(p.chromium.executable_path).exists():
        options.append(('chromium', None))
    if Path('/Applications/Google Chrome.app').exists():
        options.append(('chromium', 'chrome'))
    options.append(('webkit', None))
    errors = []
    for name, channel in options:
        try:
            kind = getattr(p, name)
            return kind.launch(headless=True, channel=channel) if channel else kind.launch(headless=True)
        except Exception as error:
            errors.append(f'{name}: {str(error).splitlines()[0]}')
    raise RuntimeError('No browser could start: ' + '; '.join(errors))


# The picture stays calm: a few short names on the stage, never sentences; the subtitles carry the explanation.
LABEL_WORDS_AT_ONCE = 12
LABEL_WORDS_EACH = 5


def label_words(label):
    return len([t for t in str(label).split() if re.search(r'[A-Za-z0-9]', t)])


def label_checks(frames):
    """Checks for the labels drawn on the stage in each sampled frame (lists of strings)."""
    most = max((sum(label_words(x) for x in labels) for labels in frames), default=0)
    longest = max((label_words(x) for labels in frames for x in labels), default=0)
    return [{'name': f'At most {LABEL_WORDS_AT_ONCE} words of labels on the stage at once (most: {most})', 'pass': most <= LABEL_WORDS_AT_ONCE},
            {'name': f'Every stage label is at most {LABEL_WORDS_EACH} words (longest: {longest})', 'pass': longest <= LABEL_WORDS_EACH}]


def capture(scene, directory, research=None, provider='fixture', root=None):
    from playwright.sync_api import sync_playwright
    directory.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = launch(p)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
            route_files(page, (root or ROOT) / 'web')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            # Investigations render on their own page; an unknown id opens the player with the example first.
            page.goto(ORIGIN + '/?guide=capture', wait_until='networkidle')
            page.add_style_tag(content='html {scroll-behavior:auto!important}')
            page.wait_for_function('window.CouncilScene && document.getElementById("beat-title").textContent.length > 0')
            if research:
                page.evaluate('(record)=>show(record)', {'id':'capture', 'scene':scene, 'research':research,
                    'provider':provider, 'status':'running', 'checks':[], 'revisions':[]})
            # The page heading as the site shows it: title, then the why line (the subtitle when there is none).
            page.evaluate('(s)=>{CouncilScene.load(s);const put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v||"";};'
                          'put("title",s.title);put("why",s.why||s.subtitle);put("takeaway",s.takeaway);}', scene)
            checks = page.evaluate('CouncilScene.checks()')
            # Subtitles are timed from their text; verify the result stays comfortably readable.
            lines = [line for chapter in page.evaluate('CouncilScene.timeline()')['chapters'] for line in chapter['lines']]
            fastest = max(len(l['text']) / (l['end'] - l['start']) for l in lines)
            shortest = min(l['end'] - l['start'] for l in lines)
            checks.append({'name': f'Subtitles read at most {fastest:.1f} characters per second (limit 15)', 'pass': fastest <= 15})
            # One idea per chapter: two or three short sentences, never a paragraph.
            most_lines = max(len(chapter['lines']) for chapter in page.evaluate('CouncilScene.timeline()')['chapters'])
            checks.append({'name': f'Each chapter has at most 3 subtitle sentences (most: {most_lines})', 'pass': most_lines <= 3})
            checks.append({'name': f'Each subtitle stays up at least {shortest:.1f} s (minimum 2.5)', 'pass': shortest >= 2.5})
            interaction = page.evaluate('''async () => {
                const slider=document.getElementById('mass'); slider.value='0';
                slider.dispatchEvent(new Event('input'));
                // The modelled effect: the readout's number, or the engine's own measure when its readout is not zero-based.
                const effect=()=>CouncilScene.effect?CouncilScene.effect():parseFloat(document.getElementById('bend-value').textContent);
                const zero=CouncilScene.getState().mass===0 && effect()===0;
                slider.value='1'; slider.dispatchEvent(new Event('input'));
                // Some models respond over time (a shaken rope builds its swing): let the page run for two seconds.
                await new Promise(r=>setTimeout(r,2000));
                const full=CouncilScene.getState().mass===1 && effect()>0;
                // The labels on the stage after playback, when the viewer has the controls.
                const live=CouncilScene.labels?CouncilScene.labels():[];
                CouncilScene.seek(1,0);
                const noMass=slider.disabled && slider.value==='0' && document.getElementById('mass-value').dataset.value==='0';
                CouncilScene.seek(11,1); const first=document.getElementById('universe').toDataURL();
                CouncilScene.seek(2,0); CouncilScene.seek(11,1);
                return {zero,full,live,noMass:noMass && !slider.disabled && slider.value==='1',deterministic:first===document.getElementById('universe').toDataURL()};
            }''')
            checks.extend({'name':name,'pass':value} for name,value in [
                ('Zero-mass control removes the modeled effect',interaction['zero']),
                ('Mass control updates the rendered model',interaction['full']),
                ('No-mass step shows zero and restores the chosen mass afterward',interaction['noMass']),
                ('Seeking reproduces identical canvas pixels',interaction['deterministic'])])
            page.evaluate('(s)=>CouncilScene.load(s)',scene)
            frames = []
            # An early and a late frame in every chapter, timed from the subtitles, so each frame shows what
            # playback shows while that chapter's sentences are on screen (seeking includes the last chapter's demo).
            chapters = page.evaluate('CouncilScene.timeline().chapters.map(c=>[c.start,c.end])')
            samples = [(start + (end - start) * f, i) for i, (start, end) in enumerate(chapters) for f in (.3, .92)]
            stage_labels = [interaction['live']]
            for i, (time, beat) in enumerate(samples):
                page.evaluate('([t,b])=>CouncilScene.seek(t,b)', [time, beat])
                stage_labels.append(page.evaluate('CouncilScene.labels?CouncilScene.labels():[]'))
                path = directory/f'frame-{i+1}.png'
                page.locator('.workspace').screenshot(path=str(path))
                frames.append(path)
                if i % 2:
                    # The late moment of each chapter, the canvas alone, for the reviewer who sees no words.
                    page.locator('#universe').screenshot(path=str(directory/f'canvas-{beat+1}.png'))
            checks.extend(label_checks(stage_labels))
            last = samples[-1]
            page.set_viewport_size({'width':390,'height':844})
            page.evaluate('([t,b])=>CouncilScene.seek(t,b)', [last[0], last[1]])
            # A single viewport avoids Chromium full-page compositor tiling artifacts.
            page.set_viewport_size({'width':390,'height':1800})
            path=directory/'mobile.png'
            page.locator('.workspace').screenshot(path=str(path),animations='disabled')
            frames.append(path)
            page.set_viewport_size({'width':390,'height':844})
            page.evaluate('window.scrollTo(0,0)')
            overview=directory/'mobile-overview.png'
            page.screenshot(path=str(overview),animations='disabled')
            frames.append(overview)
            checks.append({'name':'Mobile page fits viewport', 'pass': page.evaluate('document.documentElement.scrollWidth <= innerWidth')})
            checks.append({'name':'Renderer has no JavaScript errors', 'pass':not errors})
            if errors:
                raise RuntimeError('Renderer errors: '+ '; '.join(errors))
            return frames, checks
        finally:
            browser.close()


# Installed before any page script in the build gate only. It arms, from the very first script and for the whole gate,
# a sandbox that makes a candidate engine fail behaviourally if it reaches for the network, a worker, a socket, a
# beacon or cookies: those always throw and are recorded, at load time, during the seeks and through the wait after,
# and ALL non-local network is also blocked and recorded at the request layer. Local file reads through the served
# origin are delegated so the host page survives. Timers, animation frames, microtasks and Promise.then are left to
# the host (the player uses them) but throw when called from inside the engine-driving window, so engine code cannot
# schedule deferred work; combined with the always-armed network block, deferred exf cannot slip either. The gate runs
# the player WITHOUT the site controller (app.js), so the host makes no network of its own and the baseline is clean.
# Engines get time through the seek API and must need no timer or network at render, like the existing engines.
GATE_SANDBOX = r'''
(() => {
  const g = (window.__gate = {fired: [], engine: false});
  const origin = location.origin;
  const isLocal = (url) => { try { return new URL(url, location.href).origin === origin; } catch (e) { return false; } };
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  const blocked = name => { g.fired.push(name); throw new Error('build gate blocked ' + name); };
  // Network and side-effect APIs: always armed; local reads delegated so the host survives, everything else throws.
  window.fetch = function (input, init) {
    const url = (input && input.url) || input;
    if (realFetch && isLocal(url)) return realFetch(input, init);
    return blocked('fetch:' + url);
  };
  window.XMLHttpRequest = function () { return blocked('XMLHttpRequest'); };
  window.WebSocket = function () { return blocked('WebSocket'); };
  if ('EventSource' in window) window.EventSource = function () { return blocked('EventSource'); };
  if ('Worker' in window) window.Worker = function () { return blocked('Worker'); };
  if (window.importScripts) window.importScripts = function () { return blocked('importScripts'); };
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return blocked('navigator.sendBeacon'); };
  try {
    Object.defineProperty(document, 'cookie', {configurable: true,
      get: () => blocked('document.cookie get'), set: () => blocked('document.cookie set')});
  } catch (e) {}
  // Timers, frames and microtasks belong to the player; let the host use them, but throw for engine code so it cannot
  // defer work past the synchronous driving window. The always-armed network block still catches any deferred exfil.
  const realTimeout = window.setTimeout.bind(window), realInterval = window.setInterval.bind(window);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realQmt = window.queueMicrotask ? window.queueMicrotask.bind(window) : null;
  const realThen = Promise.prototype.then;
  const deferGuard = (name, real) => function (...args) {
    if (g.engine) { g.fired.push(name); throw new Error('build gate blocked ' + name + ' in engine code'); }
    return real.apply(this, args);
  };
  window.setTimeout = deferGuard('setTimeout', realTimeout);
  window.setInterval = deferGuard('setInterval', realInterval);
  window.requestAnimationFrame = deferGuard('requestAnimationFrame', realRaf);
  if (realQmt) window.queueMicrotask = deferGuard('queueMicrotask', realQmt);
  Promise.prototype.then = function (onF, onR) {
    if (g.engine) { g.fired.push('Promise.then'); throw new Error('build gate blocked Promise.then in engine code'); }
    return realThen.call(this, onF, onR);
  };
})();
'''


def _serve_gate_page(route, folder):
    """Serve the gate's page like the normal router, but strip the site controller (app.js) from index.html so the
    sandboxed page runs only the player (scene.js) and its model (physics.js) and makes no network of its own."""
    path = unquote(urlparse(route.request.url).path)
    if path in ('/', '/index.html'):
        html = (folder / 'index.html').read_text(encoding='utf-8')
        html = re.sub(r'<script[^>]*\bsrc="[^"]*\bapp\.js[^"]*"[^>]*></script>', '', html)
        return route.fulfill(status=200, body=html, headers={'Cache-Control': 'no-store'}, content_type='text/html')
    return serve_local(route, folder)


def gate_probe(scene, root, kind, wait_ms=1000):
    """Render a candidate engine in a locked-down sandbox so side-effecting code fails the build gate behaviourally,
    not by pattern matching. The sandbox (GATE_SANDBOX) is armed from the first script and never disarmed: all non-local
    network is blocked and recorded (both at the request layer with page.route and by a throwing fetch/XHR/socket/worker
    stub), cookies, beacons and workers throw, and timers/frames/microtasks throw when called from engine code. The
    page runs without the site controller, so the host makes no network and any recorded network, pageerror or fired
    stub is the engine's. Returns what fired, the page errors, the non-local network attempted and any error the engine
    raised while rendering; the caller rejects the engine if any is non-empty. Load-time engine code is judged too: the
    stubs and the route are live before any page script runs, and nothing is ever cleared."""
    from playwright.sync_api import sync_playwright
    served = (root / 'web').resolve()
    with sync_playwright() as p:
        browser = launch(p)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
            errors, network = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def guard(route):
                url = route.request.url
                if url.startswith(ORIGIN):
                    return _serve_gate_page(route, served)
                network.append(url)
                route.abort()
            page.route('**/*', guard)
            page.add_init_script(GATE_SANDBOX)
            page.goto(ORIGIN + '/', wait_until='load')
            # Drive the engine only if the player loaded; a load-time throw (e.g. an engine IIFE reaching the network)
            # is already recorded in errors/network/fired and fails the gate below without driving.
            ready = page.evaluate('!!(window.CouncilScene && window.__gate)')
            probe = {'error': None, 'fired': []}
            if ready:
                probe = page.evaluate('''(scene) => {
                    const g = window.__gate, out = {error: null};
                    g.engine = true;
                    try {
                      CouncilScene.load(scene);
                      const chapters = CouncilScene.timeline().chapters;
                      for (let i = 0; i < chapters.length; i++) {
                        const c = chapters[i];
                        CouncilScene.seek(c.start + (c.end - c.start) * 0.3, i);
                        CouncilScene.seek(c.start + (c.end - c.start) * 0.92, i);
                      }
                      if (CouncilScene.effect) CouncilScene.effect();
                      if (CouncilScene.labels) CouncilScene.labels();
                      CouncilScene.checks();
                    } catch (e) { out.error = String((e && e.message) || e); }
                    finally { g.engine = false; }
                    out.fired = g.fired.slice();
                    return out;
                }''', scene)
            # Let any asynchronous side effect the engine kicked off (an image load, a resolved request) surface; the
            # network block and stubs stay armed throughout, and nothing is cleared.
            page.wait_for_timeout(wait_ms)
            fired = page.evaluate('window.__gate ? window.__gate.fired.slice() : []')
            return {'fired': fired or probe.get('fired', []), 'error': probe.get('error'),
                    'pageerrors': list(errors), 'network': list(network), 'ready': ready}
        finally:
            browser.close()
