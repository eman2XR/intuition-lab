"""Splices the Doppler engine into a copy of the site's web files: python3 splice.py <source web dir> <target web dir>."""
import sys
from pathlib import Path
src,dst=Path(sys.argv[1]),Path(sys.argv[2]);here=Path(__file__).parent
def rep(s,a,b):
    assert s.count(a)==1,(s.count(a),a[:80]);return s.replace(a,b)
scene=(src/'scene.js').read_text()
scene=rep(scene,"// Why 23 people are enough for a shared birthday",(here/'doppler-scene.js').read_text()+"\n// Why 23 people are enough for a shared birthday")
scene=rep(scene," 'monty-hall':{draw:drawMonty",(here/'doppler-entry.js').read_text()+" 'monty-hall':{draw:drawMonty")
scene=rep(scene,"""// Sound: only plucked strings make a sound, at the moments an engine plucks one (playback crossing a pluck, or the
// viewer moving a control). Nothing sounds before the viewer presses play.""","""// Sound: plucked strings sound at the moments an engine plucks one (playback crossing a pluck, or the viewer moving a
// control), and a siren sounds a steady tone while its picture asks for one. Nothing sounds before the viewer presses
// play.""")
scene=rep(scene," if(SOUND.ctx||!engineOf(spec).plucks)return SOUND.ctx?.resume?.();"," if(SOUND.ctx||!sounds(engineOf(spec)))return SOUND.ctx?.resume?.();")
scene=rep(scene,"function audioStart(){","const sounds=e=>!!(e&&(e.plucks||e.tone));\nfunction audioStart(){")
scene=rep(scene,"""function voice(){
 if(!SOUND.ctx||!SOUND.on){SOUND.queue.length=0;return;}""","""// A steady tone (a siren) fades out a moment after frames stop asking for it (a pause, another guide, a hidden tab).
function voice(){
 const a=SOUND.ctx, want=SOUND.on?TONE.want:null;TONE.want=null;
 if(a&&(want||SOUND.osc)){
  if(want&&!SOUND.osc){const o=a.createOscillator(), g=a.createGain();o.type='triangle';g.gain.value=0;o.connect(g);g.connect(SOUND.out);o.start();SOUND.osc=o;SOUND.oscGain=g;}
  const now=a.currentTime, g=SOUND.oscGain.gain;g.cancelScheduledValues(now);
  if(want){SOUND.osc.frequency.setTargetAtTime(clamp(want[0],80,4000),now,.03);g.setTargetAtTime(.22*clamp(want[1]),now,.06);g.setTargetAtTime(0,now+.3,.1);}
  else g.setTargetAtTime(0,now,.08);}
 if(!a||!SOUND.on){SOUND.queue.length=0;return;}""")
scene=rep(scene,"function soundButton(){const b=$('sound');b.hidden=!engineOf(spec)?.plucks;","function soundButton(){const b=$('sound');b.hidden=!sounds(engineOf(spec));")
scene=rep(scene,"window.CouncilBench=","""// An engine whose picture sounds (a siren) calls soundTone(freq, loudness) on each frame it sounds; the page's sound
// player picks it up. Declared before the page code, so engines can draw without a page.
const TONE={want:null};
function soundTone(freq,gain){TONE.want=[freq,gain];}
window.CouncilBench=""")
(dst/'scene.js').write_text(scene)
phys=(src/'physics.js').read_text()
phys=rep(phys,"    montyChecks() {",(here/'doppler-physics.js').read_text()+"    montyChecks() {")
phys=rep(phys,"'simpson':this.simpsonChecks,","'simpson':this.simpsonChecks,'doppler':this.dopplerChecks,")
(dst/'physics.js').write_text(phys)
app=(src/'app.js').read_text()
app=rep(app,"'simpson':'Chance and evidence'};","'simpson':'Chance and evidence','doppler':'Waves'};")
(dst/'app.js').write_text(app)
print('spliced into',dst)
