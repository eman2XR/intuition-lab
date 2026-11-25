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
                # Home: the newest investigation that is not archived is featured; every other listed one appears once
                # in the grid, and archived ones only in the closed Archived section.
                shown=[e for e in entries if not e.get('archived')]
                archived=[e for e in entries if e.get('archived')]
                # Ranked like the site: the later of when each was published and last featured.
                lead=max(shown,key=lambda e:max(e.get('created',''),(e.get('featured') or '').replace('Z','+00:00')))['id'] if shown else None
                page.wait_for_function('n=>document.querySelectorAll("#gallery a[data-guide]").length>=n',arg=len(entries)-(1 if lead else 0))
                if lead:
                    assert page.locator(f'#featured a[data-guide="{lead}"]').count()==1, 'Newest investigation is not featured'
                    assert page.locator(f'#gallery a[data-guide="{lead}"]').count()==0, 'Featured investigation repeated in the grid'
                assert page.locator('#gallery > .thumbs a[data-guide]').count()==max(0,len(shown)-1), 'Grid does not list every other investigation once'
                assert page.locator('#gallery .archived-shelf a[data-guide]').count()==len(archived), 'Archived investigations are not in the Archived section'
                # Every listed guide has its baked poster, and every card picture has loaded.
                missing=[e['id'] for e in entries if not e.get('poster') or not (ROOT/'web'/e['poster']).exists()]
                assert not missing, f'Guides without a poster: {missing}'
                page.evaluate('()=>Promise.all([...document.querySelectorAll("img.thumb")].map(i=>{i.loading="eager";return i.decode().catch(()=>{});}))')
                assert page.evaluate('[...document.querySelectorAll("img.thumb")].every(i=>i.complete&&i.naturalWidth>0)'), 'A card poster did not load'
            for entry in entries or [{'id':'example'}]:
                page.goto(url+'?guide='+entry['id'],wait_until='networkidle')
                page.wait_for_function('(id)=>{const r=document.getElementById("record").textContent;return r&&(id==="example"||JSON.parse(r).id===id)}',arg=entry['id'])
                assert page.locator('#run').count()==0, 'Static site must not expose a live run button'
                assert page.evaluate('Array.from(document.querySelectorAll(".revision img")).every(i=>i.complete && i.naturalWidth>0)'), 'Revision images must resolve under a subpath'
                assert page.locator(f'#more-list a[href="?guide={entry["id"]}"]').count()==0, 'An investigation lists itself under More'
                if entry.get('poster'):
                    page.wait_for_function('()=>{const i=document.getElementById("stage-poster");return i&&i.complete&&i.naturalWidth>0}')
            if entries:talk_check(browser,url,[e for e in entries if not e.get('archived')][0]['id'])
            page.goto(url,wait_until='networkidle')
            path=Path(tempfile.gettempdir())/'council-dashboard-desktop.png'
            page.screenshot(path=str(path))
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile overflow'
            mobile=path.with_name('council-dashboard-mobile.png');page.screenshot(path=str(mobile))
            assert not errors, errors
            print(json.dumps({'status':'passed','desktop':str(path),'mobile':str(mobile)}))
            browser.close()


# Talk, without the network: a stand-in Gemini socket answers a typed piece of feedback, and the conversation is kept
# with its chapter, tagged as feedback, and ready to send as a council:talk issue.
FAKE_GEMINI = """
window.__sent=[];
localStorage.setItem('council-gemini-key','test');localStorage.setItem('council-gemini-model','test-model');
localStorage.removeItem('council-github-token');localStorage.removeItem('council-talks');
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>Promise.reject(new Error('no microphone'))}});
class FakeSocket{constructor(url){this.url=url;this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen();},10);}
 reply(m){this.onmessage&&this.onmessage({data:JSON.stringify(m)});}
 send(d){const m=JSON.parse(d);window.__sent.push(m);
  if(m.setup)setTimeout(()=>this.reply({setupComplete:{}}),10);
  if(m.clientContent&&m.clientContent.turnComplete)setTimeout(()=>{this.reply({serverContent:{outputTranscription:{text:'Noted: the lab will look at that chapter.'}}});this.reply({serverContent:{turnComplete:true}});},10);}
 close(){this.readyState=3;}}
window.WebSocket=FakeSocket;
"""


def talk_check(browser, url, guide):
    page = browser.new_page(viewport={'width': 1200, 'height': 900})
    route_files(page, ROOT/'web', '/web/')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(FAKE_GEMINI)
    page.goto(url+'?guide='+guide, wait_until='networkidle')
    page.wait_for_function('()=>window.CouncilScene&&CouncilScene.timeline()')
    page.evaluate('()=>{const c=CouncilScene.timeline().chapters[1];CouncilScene.seek(c.start+.5,1);}')
    page.wait_for_function('()=>!document.getElementById("talk-chapter").hidden')
    page.click('#talk-chapter')
    page.wait_for_function('()=>document.querySelector(".voice-status")?.textContent==="Type your question"')
    page.fill('.voice-form input', 'The arrows in this chapter confused me.')
    page.press('.voice-form input', 'Enter')
    page.wait_for_selector('.voice-line.editor')
    page.click('.voice-end')
    page.wait_for_selector('.voice-send')
    state = page.evaluate('()=>({href:document.querySelector(".voice-send").href,talks:JSON.parse(localStorage.getItem("council-talks")),setup:__sent[0].setup})')
    talk = state['talks'][-1]
    title = page.evaluate('()=>current.scene.beats[1].title')
    assert 'council%3Atalk' in state['href'], 'Talk does not offer a council:talk issue'
    assert talk['kind'] == 'feedback' and talk['section']['index'] == 1 and talk['pinned'], f'Talk kept the wrong kind or chapter: {talk}'
    assert [t['who'] for t in talk['turns']] == ['you', 'editor'], 'Talk transcript is incomplete'
    assert title in state['setup']['systemInstruction']['parts'][0]['text'], 'Talk did not tell the model about the chapter on screen'
    assert state['setup']['inputAudioTranscription'] == {} and state['setup']['generationConfig']['responseModalities'] == ['AUDIO']
    # Ask a question opens the same conversation on this device, which has a key.
    page.click('.voice-close')
    page.click('#ask')
    page.wait_for_selector('.voice-sheet')
    assert page.evaluate('()=>!document.querySelector(".voice-sheet .voice-about").textContent.startsWith("Chapter")'), 'Ask a question opened a chapter conversation'
    page.click('.voice-end')
    assert not errors, errors
    page.close()

if __name__=='__main__':main()
