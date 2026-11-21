"""Publish today's Doppler guide from the round folder, once every check and review passed: publish-dp.py <root> <scene> <frames dir> <reviews>."""
import json,shutil,sys
from datetime import datetime,timezone
from pathlib import Path
root=Path(sys.argv[1]);R=root/'.council-state/round/2026-11-21/dp';load=lambda p:json.load(open(p));now=datetime.now(timezone.utc)
scene=load(R/sys.argv[2]);frames_dir=R/sys.argv[3];rv=load(R/sys.argv[4]);research=load(R/'dp-research.json');checks=load(frames_dir/'checks.json')
assert all(rv[k]['pass'] and not rv[k]['blocking_issues'] for k in ('physics','visual','learner','blind'))
assert all(c['pass'] for c in checks)
idx_path=root/'web/published/index.json';idx=load(idx_path)
rid=now.strftime('%Y%m%dT%H%M%S')+'-doppler';d=root/'web/published'/rid;d.mkdir()
n=len(list(frames_dir.glob('frame-*.png')));frames=[]
for i in range(n):shutil.copy(frames_dir/f'frame-{i+1}.png',d/f'revision-1-{i}.png');frames.append(f'published/{rid}/revision-1-{i}.png')
rec={'id':rid,'status':'reviewed','question':scene['title'],'topic':scene['kind'],'created':now.isoformat(),'research':research,'scene':scene,'checks':checks,
 'provider':'reviewed-agents','provenance':{'sources_retrieved':True,'retrieved_by':'coordinator','intro_note':'This investigation was made in a coding session, not by the daily run: an AI coding agent built the picture and wrote the guide from sources retrieved in that session, and AI reviewers checked it with the render checks, an accuracy review, a visual review, a first-time-reader test with a subtitle edit, and a blind-viewer test. The owner approved publishing guides made this way. The reviews below are from that session’s final review.'},
 'revisions':[{'number':1,'scene':{k:v for k,v in scene.items() if k!='theme'},'checks':checks,'accepted':True,'physics_review':rv['physics'],'visual_review':rv['visual'],'learner_review':rv['learner'],'blind_review':rv['blind'],'frames':frames}]}
json.dump(rec,open(d/'record.json','w'),indent=2,ensure_ascii=False)
idx.insert(0,{'id':rid,'question':scene['title'],'topic':'doppler','created':now.isoformat(),'curriculum':'3.5','title':scene['title'],'theme':scene['theme']})
open(idx_path,'w').write(json.dumps(idx,indent=2)+'\n')
cur=root/'web/curriculum.json';t=cur.read_text()
a='''          "id": "3.4",
          "question": "Why do waves spread out after passing a narrow gap?",
          "model": "diffraction",
          "ready": true
        }
      ]'''
b='''          "id": "3.4",
          "question": "Why do waves spread out after passing a narrow gap?",
          "model": "diffraction",
          "ready": true
        },
        {
          "id": "3.5",
          "question": "Why does a passing siren drop in pitch?",
          "model": "doppler"
        }
      ]'''
assert t.count(a)==1;cur.write_text(t.replace(a,b))
print(rid)
