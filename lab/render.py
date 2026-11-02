"""Render the actual webpage at deterministic times for agent image review."""
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
import mimetypes
from . import ROOT

ORIGIN = 'http://council.local'


def route_files(page, folder, prefix='/'):
    """Serve a folder through request interception, so no local socket or server is needed."""
    folder = folder.resolve()
    page.route('**/*', lambda route: route.abort())  # Captures never depend on outside network.
    def handle(route):
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
    page.route(ORIGIN + '/**', handle)


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


def capture(scene, directory, research=None, provider='fixture'):
    from playwright.sync_api import sync_playwright
    directory.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = launch(p)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
            route_files(page, ROOT / 'web')
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
