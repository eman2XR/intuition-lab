"""Whole-site visual QA: every page and key state at desktop and phone sizes, plus error and overflow checks."""
import argparse
import json
import tempfile
from pathlib import Path
from . import ROOT
from .render import ORIGIN, launch, route_files


def main():
    parser = argparse.ArgumentParser(description='Capture every page and state for visual QA.')
    parser.add_argument('--out', default=str(Path(tempfile.gettempdir()) / 'council-qa'))
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.png'):
        old.unlink()
    entries = json.loads((ROOT / 'web' / 'published' / 'index.json').read_text())
    problems = []
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = launch(p)
        try:
            for size, viewport in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
                page = browser.new_page(viewport=viewport, device_scale_factor=1)
                route_files(page, ROOT / 'web', '/web/')
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                shot = lambda name, full=False: page.screenshot(path=str(out / f'{size}-{name}.png'), full_page=full)
                overflow = lambda where: page.evaluate('document.documentElement.scrollWidth > innerWidth') and problems.append(f'{size} {where}: horizontal overflow')
                page.goto(ORIGIN + '/web/', wait_until='networkidle'); page.wait_for_timeout(600)
                shot('home', True); overflow('home')
                page.click('#lab summary'); page.wait_for_timeout(200); shot('home-status'); page.click('#lab summary')
                page.locator('#home').screenshot(path=str(out / f'{size}-guides.png'))
                page.goto(ORIGIN + '/web/', wait_until='networkidle'); page.wait_for_timeout(300)
                if page.locator('#proposals-open').is_visible():
                    page.click('#proposals-open'); page.wait_for_timeout(300); shot('proposals'); page.keyboard.press('Escape')
                for n, entry in enumerate(entries, 1):
                    page.goto(ORIGIN + '/web/?guide=' + entry['id'], wait_until='networkidle'); page.wait_for_timeout(500)
                    tag = f'guide{n}'
                    shot(f'{tag}-top'); shot(f'{tag}-full', True); overflow(entry['id'])
                    page.evaluate('CouncilScene.play()'); page.wait_for_timeout(2500); shot(f'{tag}-play-early')
                    total = page.evaluate('CouncilScene.timeline().total')
                    box = page.locator('#scrub').bounding_box()
                    for label, frac in (('middle', .55), ('late', .9)):
                        page.mouse.click(box['x'] + box['width'] * frac, box['y'] + box['height'] / 2); page.wait_for_timeout(1800)
                        shot(f'{tag}-play-{label}')
                    page.evaluate('CouncilScene.pause()')
                    page.mouse.click(box['x'] + box['width'] * .999, box['y'] + box['height'] / 2)
                    page.evaluate('CouncilScene.play()'); page.wait_for_timeout(1500); shot(f'{tag}-end')
                    if total > 120:
                        problems.append(f'{size} {entry["id"]}: playback is {total:.0f} s long')
                problems.extend(f'{size}: {e}' for e in errors)
                page.close()
        finally:
            browser.close()
    print(json.dumps({'screenshots': str(out), 'count': len(list(out.glob('*.png'))), 'problems': problems}, indent=1))


if __name__ == '__main__':
    main()
