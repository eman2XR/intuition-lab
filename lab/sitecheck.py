"""Browser smoke check for the public site under a project URL prefix."""
import json
import tempfile
from pathlib import Path
from . import ROOT
from .render import ORIGIN, launch, route_files


def main():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
            browser=launch(p)
            page=browser.new_page(viewport={'width':1440,'height':1100})
            route_files(page,ROOT/'web','/web/')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            url=ORIGIN+'/web/'
            page.goto(url,wait_until='networkidle')
            page.wait_for_function("document.getElementById('dashboard-status').textContent!=='Checking status…'")
            index=ROOT/'web'/'published'/'index.json'
            entries=json.loads(index.read_text()) if index.exists() else []
            if entries:
                # Home: the newest investigation is featured; every other one appears once in the grid.
                lead=max(entries,key=lambda e:e.get('created',''))['id']
                page.wait_for_function('n=>document.querySelectorAll("#gallery a[data-guide]").length>=n',arg=len(entries)-1)
                assert page.locator(f'#featured a[data-guide="{lead}"]').count()==1, 'Newest investigation is not featured'
                assert page.locator('#gallery a[data-guide]').count()==len(entries)-1
                assert page.locator(f'#gallery a[data-guide="{lead}"]').count()==0, 'Featured investigation repeated in the grid'
            for entry in entries or [{'id':'example'}]:
                page.goto(url+'?guide='+entry['id'],wait_until='networkidle')
                page.wait_for_function('(id)=>{const r=document.getElementById("record").textContent;return r&&(id==="example"||JSON.parse(r).id===id)}',arg=entry['id'])
                assert page.locator('#run').count()==0, 'Static site must not expose a live run button'
                assert page.evaluate('Array.from(document.querySelectorAll(".revision img")).every(i=>i.complete && i.naturalWidth>0)'), 'Revision images must resolve under a subpath'
                assert page.locator(f'#more-list a[href="?guide={entry["id"]}"]').count()==0, 'An investigation lists itself under More'
            page.goto(url,wait_until='networkidle')
            path=Path(tempfile.gettempdir())/'council-dashboard-desktop.png'
            page.screenshot(path=str(path))
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile overflow'
            mobile=path.with_name('council-dashboard-mobile.png');page.screenshot(path=str(mobile))
            assert not errors, errors
            print(json.dumps({'status':'passed','desktop':str(path),'mobile':str(mobile)}))
            browser.close()

if __name__=='__main__':main()
