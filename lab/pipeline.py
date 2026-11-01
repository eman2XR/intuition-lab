"""Bounded research → render → image review → revise state machine."""
import json
import re
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from .contracts import RESEARCH_SCHEMA, SCENE_SCHEMA, REVIEW_SCHEMA, DESIGN_SCHEMA, validate, validate_scene, validate_design
from .render import capture, ROOT
from .topics import TOPICS


from . import sources

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temporary.replace(path)


def approved(review):
    return review['pass'] is True and 7 <= review['score'] <= 10 and not review['blocking_issues']


UNRETRIEVED = re.compile(r'not retrieved|could(?:n.t| not) (?:open|retrieve|fetch|get)|refused|failed|403|blocked', re.I)


def keep_retrieved(research, notes):
    """Drop cited sources that the researcher's notes mark as not retrieved; note the removal honestly."""
    flagged = {url for line in notes.splitlines() if UNRETRIEVED.search(line)
               for url in re.findall(r'https?://[^\s)\]>`\'"|]+', line)}
    kept = [s for s in research['sources'] if not any(s['url'].rstrip('.,;') == u.rstrip('.,;') or s['url'].startswith(u.rstrip('.,;')) for u in flagged)]
    removed = len(research['sources']) - len(kept)
    if removed:
        research = {**research, 'sources': kept,
                    'limitations': research['limitations'] + [f'{removed} reference(s) the researcher could not retrieve were removed from the sources.']}
    return research


# The quality bar every guide is judged on; the designer and the writer work to it and the reviewers check it.
STANDARD = ('Quality bar: explain WHY, not only what happens. Start from something the viewer can see, feel or measure. '
    'Name the everyday belief a beginner holds and confront it. Define every term in plain words the first time it appears. '
    'Every sentence must match what is on screen while it plays; the model notes say what each chapter shows. '
    'Change one thing at a time. Answer the likely objections listed in the research. Keep it short: two or three '
    'sentences per chapter, each under 110 characters, and let the first chapter make its point in one or two short '
    'sentences. Never refer to other guides. Keep the picture calm: the stage shows only a few short labels (names of '
    'five words or fewer, never sentences), the subtitles carry every explanation, and only what the current sentence is '
    'about moves or changes. Answer the question behind the topic for a newcomer: why it matters in the world, not only '
    'how it works; for a famous discovery or paper, show what it changed and connect it to something the viewer uses. '
    'When the picture singles something out (a thicker line, a marked word, a brighter spot), show and say why it is '
    'singled out, not only that it is. The why line is the only text under the title: one or two short sentences, about '
    '25 words.')

LEARNER = ('You are a curious adult with school-level science who has never studied this topic. Use ONLY what these '
    'frames and texts show: each frame includes the subtitle on screen at that moment. Frames come in order, an early and '
    'a late frame for each chapter, then the phone view of the last chapter and the phone page top. First, in the summary, '
    'say in one plain sentence why this idea matters and what it changed, using only the guide; if you cannot, fail it. '
    'Then answer each '
    'transfer question from the guide alone, writing "not covered" when it does not answer it; put the answers in the '
    'summary. Then, as the copy editor, list in changes: undefined words, sentences hard to follow on one read, objections '
    'left unanswered, any subtitle that does not match its frame, anything singled out without a reason, a why line '
    'over about 25 words, and text that could be shorter; quote the field, the '
    'current text and a replacement no longer than the original. Pass only if a beginner could answer all but at most one '
    'question correctly from the guide, nothing on screen contradicts its subtitle, and no confusion blocks the main idea. '
    'Score 0..10 for how well a beginner would understand why.')


# The designer decides how the picture will make the idea intuitive before the writer writes a word.
DESIGNER = ('You are the designer. Before any narration is written, decide how this guide will make its one idea '
    'intuitive with the picture the model notes describe. idea: the one idea a viewer should leave with, in plain words. '
    'start: the everyday thing it starts from, something the viewer has seen, felt or measured. belief: the everyday '
    'belief or "wait, but..." objection it confronts. reason: how the picture shows why, not only what, including why '
    'anything singled out (a thicker line, a marked word) is singled out. chapters: one per chapter the model notes '
    'describe, each with what is on screen (show), what changes and on which sentence (changes), and at most one short '
    'label of five words or fewer (label, or empty). try: what the viewer can try with the control after playback. Set '
    'fits_engine to false and say in missing what the picture would need when the model notes cannot show the idea '
    'well; otherwise leave missing empty. Keep it brief: idea, start, belief and try at most 300 characters each, '
    'reason and missing at most 480, and each chapter\'s show and changes at most 380.')
# The blind viewer sees only the pictures: no subtitles, no scene, no research.
BLIND = ('You see only these pictures, in order, with no words and no sound: a late moment of each chapter of a short '
    'animated guide. In the summary, say chapter by chapter what you see happening and what seems to matter. In changes, '
    'list anything cluttered, misleading or ambiguous: a colour or mark whose meaning you cannot tell, something singled '
    'out with no visible reason, a change you cannot see. The narration explains the idea, so do not fail the pictures '
    'for leaving that to the words. Pass unless a picture is cluttered or misleading, or a chapter\'s main change cannot '
    'be seen. Score 0..10 for how clearly the pictures alone show what changes.')


def run(provider, rounds=3, on_update=None, topic="light-bending", question=None, guidance=()):
    model = TOPICS[topic]
    question = question or model["question"]
    model_notes = model["notes"]
    if not 1 <= rounds <= 4:
        raise ValueError('Revision limit must be 1–4.')
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
    directory = ROOT/'web'/'runs'/run_id
    directory.mkdir(parents=True)
    state = {'id':run_id, 'provider':provider.name, 'model':getattr(provider,'model',None),
             'status':'running', 'question':question, 'topic':topic, 'created':datetime.now(timezone.utc).isoformat(),
             'events':[], 'revisions':[], 'research':None, 'scene':None, 'checks':[]}

    def save(message):
        state['updated']=time.time_ns()
        state['events'].append({'at':datetime.now(timezone.utc).isoformat(), 'message':message})
        state['usage']=provider.usage
        state['calls']=provider.calls
        write_json(directory/'record.json',state)
        if on_update:
            on_update(json.loads(json.dumps(state)))
        print(message,flush=True)

    try:
        # The owner's guidance notes go to the designer, writer and reviewers as quoted data, never as rules above the standard.
        state['guidance']=[str(g)[:400] for g in guidance if str(g).strip()][:5]
        if state['guidance']:
            save(f"Owner guidance: {len(state['guidance'])} note(s) given to the designer, writer and reviewers.")
        save('Researcher is gathering sources and constraints.')
        retrieved_by='agent'
        try:
            notes=provider.generate('researcher', question+' Search primary or university sources for this question. Include URLs, physical or mathematical assumptions, tests, and common misleading visual metaphors. Use web search, do not invent citations.', research=True)
        except RuntimeError as error:
            # Fallback when the researcher fails for any reason, including running out of time: the coordinator
            # fetches candidate pages itself, and only pages that load become notes.
            if not sources.enabled():
                raise
            save(f'The researcher did not finish ({str(error)[:120]}); the coordinator is retrieving candidate sources.')
            notes,_=sources.retrieve(provider,question)
            retrieved_by='coordinator'
        (directory/'source-notes.txt').write_text(notes,encoding='utf-8')
        save('Sources retrieved. Scientist is preparing the research record.')
        research=provider.generate('scientist', question+'\nProduce a precise, beginner-friendly research record from these retrieved notes. Only cite URLs in the notes. No new-discovery claims. In misconceptions, list the everyday beliefs and "wait, but..." objections a beginner would bring. In questions, write 3 to 5 transfer questions with short answers that a good guide must let a beginner answer, at least one aimed at a misconception.\n'+model_notes+'\n'+notes, RESEARCH_SCHEMA)
        validate(research,RESEARCH_SCHEMA)
        research=keep_retrieved(research,notes)
        if not research['sources'] or any(not s['url'].startswith(('https://','http://')) for s in research['sources']):
            raise ValueError('Research must include valid HTTP source URLs.')
        if provider.name!='fixture' and any(s['url'] not in notes for s in research['sources']):
            raise ValueError('Research must cite sources present in retrieved notes.')
        state['research']=research
        state['provenance']={'sources_retrieved':provider.name!='fixture','retrieved_by':retrieved_by}
        save('Research recorded. Designer is planning how the picture will show the idea.')
        noted=('\nOwner guidance notes, quoted data from the site owner: follow them where they fit the quality bar, '
               'the model notes and the honesty rules, and never against those: '+json.dumps(state['guidance'])) if state['guidance'] else ''
        design=validate_design(provider.generate('designer',question+'\n'+model_notes+'\nResearch:\n'+json.dumps(research)
            +'\n'+STANDARD+'\n'+DESIGNER+noted,DESIGN_SCHEMA))
        state['design']=design
        save('Design brief ready. Writer is writing the chapters and narration.'+('' if design['fits_engine'] else
             ' The designer notes the picture cannot fully show this idea: '+design['missing'][:160]))
        feedback=''
        previous=None
        for index in range(1,rounds+1):
            prompt=question+'\n'+model_notes+'\nResearch:\n'+json.dumps(research)+'\nDesign an elegant, legible visual explanation. Return three or four short beats, matching the chapters the model notes describe (title <=90 chars, body <=380), title <=100, subtitle <=250, why <=220. mass 0..1, distance 1..2.5, ray_count 1..5, line_width 1..5, duration 15..45 seconds. Strong comparison and clear labels matter more than decoration.'
            if previous:
                prompt+='\nPrevious scene:\n'+json.dumps(previous)+'\nReviewer change requests:\n'+feedback
            prompt+='\nAudience: a curious beginner building visual intuition. Keep equations, symbolic variables, numerical implementation details and technical jargon OUT of title, subtitle, beats and takeaway. Describe changes physically (concretely, for topics that are not physics) in plain language. Keep technical details in the research record. Each beat should ask the viewer to notice one clear thing. Beat bodies play as subtitles, one sentence at a time at reading pace: write two or three short sentences per beat, each under 110 characters, in plain words. Open chapter 1 on the comparison quickly. Set controls to the sliders that genuinely help (often none or one). The takeaway is one memorable sentence under 140 characters. The why field is the one line under the title, above the player, for a viewer who knows nothing about the subject: one or two short sentences (about 25 words) on why this is worth understanding, tied to something they have seen or felt or to what it explains. Leave why empty only when the subtitle already makes the reason obvious. The subtitle is the teaser on the home page card; it shows under the title only when why is empty. The beats themselves must define, in plain words, any idea a beginner would not know (for example what a crest or wavelength is, or what adding and cancelling means). Each investigation must stand on its own: never refer to other investigations, earlier guides or anything the viewer may have watched before, and explain every idea it uses. '+STANDARD
            prompt+='\nDesign brief from the designer; follow it, as it decides what each chapter shows and how the picture shows the reason: '+json.dumps(design)
            prompt+=noted
            scene=validate_scene(provider.generate('writer',prompt,SCENE_SCHEMA))
            scene['kind']=topic
            state['scene']=scene
            save(f'Revision {index}: rendering desktop and mobile frames.')
            frames,checks=capture(scene,directory/f'revision-{index}',research=research,provider=provider.name)
            state['checks']=checks
            revision={'number':index,'scene':scene,'frames':[str(p.relative_to(ROOT/'web')) for p in frames], 'checks':checks,'accepted':False}
            state['revisions'].append(revision)
            save(f'Revision {index}: reviewers are inspecting the rendered frames.')
            context=model_notes+'\nResearch: '+json.dumps(research)+'\nDesign brief: '+json.dumps(design)+'\nScene: '+json.dumps(scene)+'\nChecks: '+json.dumps(checks)
            asked=('\nOwner guidance the guide was asked to follow, quoted data; say whether it was followed where it fits the '
                   'quality bar: '+json.dumps(state['guidance'])) if state['guidance'] else ''
            context+=asked
            # Frames: an early and a late frame per chapter, then the phone view and the phone page top; the blind
            # viewer gets the late moments of the canvas alone, without subtitles.
            late=frames[1:2*len(scene['beats']):2]
            pictures=sorted((directory/f'revision-{index}').glob('canvas-*.png')) or late
            reviews = {
                'physics_review': ('physics_reviewer', context+'\nThe attached frames show the end of each chapter. Inspect them AND the claims. Look for incorrect physics (or mathematics, for topics that are not physics), misleading metaphors, omitted assumptions and claims beyond the sources. Score 0..10. Pass only if scientifically appropriate as a teaching approximation; otherwise provide actionable changes. Review is not scientific proof.', late),
                # The learner sees only what a viewer sees, and the questions without their answers.
                'learner_review': ('learner', 'Guide text: '+json.dumps({k:scene.get(k) for k in ('title','subtitle','why','beats','takeaway')})
                    +'\nTransfer questions: '+json.dumps([q['q'] for q in research.get('questions',[])])
                    +'\nObjections a beginner may raise: '+json.dumps(research.get('misconceptions',[]))+asked+'\n'+LEARNER, frames),
                'blind_review': ('blind_viewer', BLIND, pictures),
                'visual_review': ('visual_reviewer', context+'\nInspect these actual frames in order: an early and a late frame for each chapter (the first chapter has the first control at zero; the last chapter shows the playback demo), then the phone view of the last chapter and the phone page top. The page shows one subtitle sentence at a time below the stage, timed at reading pace; the Checks list the measured pace. Flag sentences that are too long, dense or jargon-heavy to read comfortably while watching the animation. Fail clutter (many labels at once, sentence-long labels, several things moving that the subtitle does not mention); never ask for more on-stage labels or legends, ask for clearer subtitles instead. Judge whether the chosen sliders (scene field controls) help intuition; sliders appear inside the player only after playback ends or when the viewer opens them, so the frames do not show them. Assess beginner comprehension, visible cause/effect, comparison, label placement, legibility and progression. Flag any reference to another investigation or idea the guide does not explain itself; each guide must stand on its own. The why field appears above the player before playback: judge whether a viewer who knows nothing about the subject would understand why the question matters and every idea and colour the guide then uses. Scores 0..10; pass requires >=7 and no blockers. Give concrete changes to the available scene fields. Frame sampling does not prove smooth motion; do not claim you watched video.', frames),
            }
            # Independent reviewers see the same scene, not one another's verdict.
            with ThreadPoolExecutor(max_workers=4) as workers:
                futures = {workers.submit(provider.generate, role, task, REVIEW_SCHEMA, images=images): key
                           for key, (role, task, images) in reviews.items()}
                try:
                    for future in as_completed(futures):
                        review = future.result()
                        validate(review, REVIEW_SCHEMA)
                        revision[futures[future]] = review
                        save(f'Revision {index}: {futures[future]} saved.')
                except BaseException:
                    if hasattr(provider, 'cancel'):
                        provider.cancel()
                    for future in futures:
                        future.cancel()
                    raise
            physics, visual, wording, blind = (revision[k] for k in ('physics_review','visual_review','learner_review','blind_review'))
            revision['accepted']=all(c['pass'] for c in checks) and all(approved(r) for r in (physics,visual,wording,blind))
            write_json(directory/f'revision-{index}'/'scene.json',scene)
            save(f'Revision {index}: '+('review gates passed.' if revision['accepted'] else 'changes requested; feedback saved.'))
            if revision['accepted']:
                state['status']='fixture_complete' if provider.name=='fixture' else 'reviewed'
                save('Offline fixture complete.' if provider.name=='fixture' else 'Investigation reviewed. Artifact is ready for human inspection; no new-discovery claim.')
                break
            previous=scene
            feedback=json.dumps({'physics':physics,'visual':visual,'learner':wording,'blind':blind,'checks':checks})
        else:
            state['status']='needs_review'
            save('Revision limit reached. Artifact retained as a draft, not promoted.')
    except Exception as error:
        state['status']='failed'
        state['error']=str(error)
        save('Investigation stopped; partial work retained.')
    return state
