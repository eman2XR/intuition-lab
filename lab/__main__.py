import argparse
import json
import os
import math
from functools import partial
from . import ROOT
from .pipeline import run, calls_needed
from .providers import OpenAIProvider
from .fixtures import FixtureProvider
from .cli_providers import CLIProvider
from .contracts import obj, STR
from .topics import TOPICS

def main():
    parser=argparse.ArgumentParser(description='Intuition Lab: visual research and review')
    parser.add_argument('command',choices=['run','check','daily','schedule','export','push','approve-engine','archive','unarchive'])
    parser.add_argument('push_args',nargs='*',metavar='push-arg',help="For push: keys | add '<code>' | test | announce <guide-id>. For approve-engine: the candidate branch name. For archive/unarchive: a published guide id.")
    parser.add_argument('--run-dir',help='For export: folder of an accepted run, e.g. from a batch snapshot.')
    parser.add_argument('--provider',choices=['codex','claude','openai','fixture'],default=os.environ.get('COUNCIL_PROVIDER','codex'))
    parser.add_argument('--model',help='Optional CLI model override; required for the direct OpenAI API.')
    parser.add_argument('--rounds',type=int,default=3)
    parser.add_argument('--timeout',type=float,default=300,help='Maximum seconds per CLI worker (default: 300).')
    parser.add_argument('--minutes',type=float,default=30,help='Total CLI model-work deadline in minutes (default: 30).')
    parser.add_argument('--hour',type=int,default=9,help='Local hour for generated macOS schedule.')
    parser.add_argument('--count',type=int,choices=[1,2],default=1,help='Maximum investigations per local calendar day.')
    parser.add_argument('--publish',action='store_true',help='Commit accepted public guides and push to origin/main.')
    parser.add_argument('--topic',choices=list(TOPICS),default='light-bending')
    parser.add_argument('--question',help='Optional question for a single run; defaults to the topic question.')
    args=parser.parse_args()
    if args.push_args and args.command not in ('push','approve-engine','archive','unarchive'):
        parser.error('unexpected arguments: '+' '.join(args.push_args))
    if not 1<=args.rounds<=4:
        parser.error('--rounds must be 1–4')
    if not math.isfinite(args.timeout) or not math.isfinite(args.minutes) or args.timeout<=0 or args.minutes<=0:
        parser.error('--timeout and --minutes must be positive')
    budget=calls_needed(args.rounds,planner=args.command=='daily')
    def provider():
        if args.provider=='fixture':
            return FixtureProvider()
        if args.provider=='openai':
            return OpenAIProvider(args.model or os.environ.get('OPENAI_MODEL'),max_calls=budget)
        return CLIProvider(args.provider,args.model or os.environ.get(f'COUNCIL_{args.provider.upper()}_MODEL'),
                           max_calls=budget,timeout=args.timeout,minutes=args.minutes)
    if args.command=='push':
        # Owner-only notifications; keys and subscriptions stay in this checkout's ignored .council-state folder.
        from . import push
        from .daily import SITE
        action,rest=(args.push_args or [''])[0],args.push_args[1:]
        if action=='keys' and not rest:
            print(f'Public key (put it in web/push.json): {push.keys()}')
        elif action=='add' and len(rest)==1:
            try:
                print('Subscription added.' if push.add(rest[0]) else 'Subscription updated.')
            except ValueError as error:
                parser.exit(2,f'Not a valid notification code: {error}\n')
        elif action=='test' and not rest:
            raise SystemExit(0 if push.notify('Intuition Lab','Notifications are working',SITE) else 1)
        elif action=='announce' and len(rest)==1:
            # Notify about a guide published by hand, with the same title, line and link a daily run would send.
            record=ROOT/'web'/'published'/rest[0]/'record.json'
            if not rest[0].replace('-','').isalnum() or not record.is_file():
                parser.exit(2,f'No published guide {rest[0]!r} in this checkout.\n')
            scene=json.loads(record.read_text()).get('scene') or {}
            raise SystemExit(0 if push.notify(scene.get('title','New guide').replace('\n',' '),scene.get('subtitle',''),
                                              f'{SITE}?guide={rest[0]}') else 1)
        else:
            parser.error("push needs: keys | add '<code>' | test | announce <guide-id>")
        return
    if args.command=='schedule':
        from .schedule import write_schedule
        print(write_schedule(args.hour,args.count,args.provider))
        return
    if args.command=='approve-engine':
        # A reviewer's explicit, local step: re-run the build gates on a candidate branch and fast-forward main into
        # it. Nothing here is automated by the daily run, and it never pushes; push main yourself to go live.
        from .build_engine import approve_engine
        if len(args.push_args)!=1:
            parser.error('approve-engine needs exactly one candidate branch name, e.g. approve-engine engine-candidate/2026-11-08-demo-bars')
        try:
            print(f'Merged candidate into main at {approve_engine(ROOT,args.push_args[0])}.')
        except ValueError as error:
            parser.exit(2,f'Cannot approve this engine: {error}\n')
        return
    if args.command in ('archive','unarchive'):
        # Hide a published guide from the home page, or list it again. The guide folder stays in place; only the index
        # flag changes. This commits and pushes just the index, so the owner runs it from a checkout on main.
        from .daily import set_archived
        if len(args.push_args)!=1:
            parser.error(f'{args.command} needs exactly one published guide id, e.g. {args.command} 20261102T170016-a02e7bd6')
        want=args.command=='archive'
        try:
            set_archived(ROOT,args.push_args[0],want)
        except ValueError as error:
            parser.exit(2,f'Cannot {args.command} this guide: {error}\n')
        except RuntimeError as error:
            parser.exit(1,f'Recorded the change locally, but publication is pending: {error}\nPush main yourself when ready.\n')
        print(f'{"Archived" if want else "Restored"} {args.push_args[0]}. The site now '
              +('hides it in the Archived section.' if want else 'lists it on the home page again.'))
        return
    if args.command=='export':
        from .daily import export_run, publish
        if not args.run_dir:
            parser.error('export needs --run-dir')
        target=export_run(args.run_dir)
        print(target)
        if args.publish:
            publish(ROOT,[target.name])
        return
    if args.command=='daily':
        from .daily import daily, paused
        daily(provider,args.count,args.rounds,args.publish,blueprints=args.publish)
        if args.publish and not paused():
            # The scheduled worker also reviews the project once a day; proposals wait for owner approval.
            from .improve import daily_review
            from .daily import publish
            if daily_review(provider):
                try:
                    publish()
                except Exception as error:
                    print(f'Proposal publication pending ({type(error).__name__}: {str(error)[:160]}).',flush=True)
        return
    if args.command=='check':
        if args.provider not in ('codex','claude'):
            parser.error('check supports codex or claude; it makes one live model call.')
        try:
            adapter=provider()
            value=adapter.generate('connection_check',
                'Inspect the attached image. Describe the actual scene and quote a visible label. '
                'Return image_description and visible_label. This tests image input and structured output.',
                obj({'image_description':STR,'visible_label':STR}),
                images=[ROOT/'web'/'example-frames'/'revision-2'/'frame-4.png'])
            print(json.dumps(value,indent=2))
        except (ValueError, RuntimeError) as error:
            parser.exit(2,f'Check failed: {error}\n')
        return
    if args.command=='run':
        try:
            adapter=provider()
        except ValueError as error:
            parser.exit(2, f'Setup needed: {error}\nSee README.md → Run locally.\n')
        from .dashboard import Dashboard
        from .daily import export_accepted, publish
        exported=[]
        dashboard=Dashboard(ROOT,partial(publish,runs=exported) if args.publish else None)
        callback=dashboard.update if args.provider!='fixture' else None
        state=run(adapter,args.rounds,on_update=callback,topic=args.topic,question=args.question)
        if args.publish and state['status']=='reviewed':
            export_accepted(state)
            exported.append(state['id'])
        if callback:
            dashboard.update(state,force=True)
        print(f'Record: web/runs/{state["id"]}/record.json')
        raise SystemExit(1 if state['status']=='failed' else 0)

if __name__=='__main__':
    main()
