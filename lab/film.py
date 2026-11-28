"""Render a film-look guide to video: lab/film.py <scene.json> <out dir> [--size 1280x720] [--fps 24] [--samples 5]
[--frames t1,t2,...] [--poster].

The guide's timeline (chapter and subtitle timing at reading pace) comes from the site's own scene engine, so the
video lines up with the live subtitles. Each frame is rendered by film/engine.js in a headless browser, read back as
JPEG and piped into ffmpeg (H.264). The captions are sampled at 10 per second into captions.json, for the page to lay
out as HTML over the video. With --frames, only those times are rendered, as stills, for checking."""
import argparse, base64, json, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lab.render import launch, route_files, ORIGIN  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def timeline(p, scene):
    b = launch(p)
    pg = b.new_page()
    route_files(pg, ROOT / 'web')
    pg.goto(ORIGIN + '/?guide=capture', wait_until='networkidle')
    pg.wait_for_function('window.CouncilScene')
    pg.evaluate('(s)=>CouncilScene.load(s)', scene)
    tl = pg.evaluate('CouncilScene.timeline()')
    b.close()
    return tl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('out')
    ap.add_argument('--size', default='1280x720'); ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--samples', type=int, default=5); ap.add_argument('--frames', default='')
    ap.add_argument('--poster', action='store_true'); ap.add_argument('--crf', type=int, default=23)
    ap.add_argument('--captions-only', action='store_true')
    a = ap.parse_args()
    W, H = map(int, a.size.split('x'))
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    scene = json.loads(Path(a.scene).read_text())
    with sync_playwright() as p:
        tl = timeline(p, scene)
        chapters = [{'start': c['start'], 'end': c['end'], 'lines': [{'start': l['start'], 'end': l.get('end'), 'text': l['text']} for l in c['lines']]} for c in tl['chapters']]
        b = launch(p)
        pg = b.new_page(viewport={'width': W, 'height': H})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' or 'ERROR' in m.text else None)
        route_files(pg, ROOT / 'film')
        pg.goto(ORIGIN + '/index.html', wait_until='networkidle')
        duration = pg.evaluate('([c,w,h])=>setup(c,w,h)', [chapters, W, H])
        if errors:
            raise SystemExit('\n'.join(errors[:3]))
        write = lambda path, url: path.write_bytes(base64.b64decode(url.split(',', 1)[1]))
        if a.poster:
            write(out / 'poster.jpg', pg.evaluate('(s)=>poster(s)', 10))
        if a.frames:
            for t in [float(x) for x in a.frames.split(',')]:
                t0 = time.time()
                write(out / f'still-{t:07.2f}.jpg', pg.evaluate('([t,s])=>frame(t,s)', [t, a.samples]))
                print(f'{t:7.2f}s rendered in {time.time() - t0:.2f}s', flush=True)
            b.close()
            return
        if a.captions_only:
            caps = [{'t': k / 10, 'items': [{**c, 'x': round(c['x'], 4), 'y': round(c['y'], 4), 'alpha': round(c['alpha'], 3)} for c in pg.evaluate('(t)=>captions(t)', k / 10)]} for k in range(int(duration * 10) + 1)]
            (out / 'captions.json').write_text(json.dumps({'duration': duration, 'size': [W, H], 'fps': a.fps, 'frames': caps}, separators=(',', ':')))
            b.close()
            return
        n = int(duration * a.fps) + 1
        enc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(a.fps), '-c:v', 'mjpeg', '-i', '-',
                                '-c:v', 'libx264', '-preset', 'slow', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                                str(out / 'film.mp4')], stdin=subprocess.PIPE)
        caps, t0 = [], time.time()
        for f in range(n):
            t = f / a.fps
            url = pg.evaluate('([t,s])=>frame(t,s)', [t, a.samples])
            enc.stdin.write(base64.b64decode(url.split(',', 1)[1]))
            if f % 100 == 0:
                print(f'frame {f}/{n} ({(time.time() - t0) / max(1, f):.2f}s a frame)', flush=True)
        for k in range(int(duration * 10) + 1):
            t = k / 10
            caps.append({'t': t, 'items': [{**c, 'x': round(c['x'], 4), 'y': round(c['y'], 4), 'alpha': round(c['alpha'], 3)} for c in pg.evaluate('(t)=>captions(t)', t)]})
        enc.stdin.close(); enc.wait()
        (out / 'captions.json').write_text(json.dumps({'duration': duration, 'size': [W, H], 'fps': a.fps, 'frames': caps}, separators=(',', ':')))
        b.close()
        if errors:
            print('\n'.join(errors[:5]))
        print(json.dumps({'frames': n, 'seconds': round(time.time() - t0), 'mp4': (out / 'film.mp4').stat().st_size}))


if __name__ == '__main__':
    main()
