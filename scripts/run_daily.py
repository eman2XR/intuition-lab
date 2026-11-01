#!/usr/bin/env python3
"""Launchd entry point with an explicit project import path.

Before a publishing run the checkout catches up with GitHub, so the run uses the latest pushed code and its own
publication is not refused. It only fast-forwards, or replays its own unpushed publication commits on top; it never
touches local edits, and when anything fails the run continues on the code it has.

A run fired just after the Mac wakes can find the network (or the VPN) not yet up, and its first model call then
stalls until the time limit. So a publishing run first waits for GitHub to answer, for up to 20 minutes; if it never
does, nothing starts and the day's attempt is not used."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
import time

PUBLICATION=('web/published/','web/dashboard.json','web/proposals.json')


def update(root):
    """Bring the checkout up to date with origin/main and say what happened."""
    git=lambda *args: subprocess.run(['git',*args],cwd=root,text=True,capture_output=True,timeout=120)
    try:
        if git('branch','--show-current').stdout.strip()!='main':
            return 'not on main, not updated'
        if git('status','--porcelain','--untracked-files=no').stdout.strip():
            return 'local edits present, not updated'
        if git('fetch','origin','main').returncode:
            return 'could not reach GitHub, not updated'
        ahead,behind=map(int,git('rev-list','--left-right','--count','HEAD...origin/main').stdout.split())
        if not behind:
            return 'up to date'
        if not ahead:
            return 'updated' if not git('merge','--ff-only','origin/main').returncode else 'fast-forward failed, not updated'
        # Commits a failed push left behind: replay them on top only when they hold nothing but the publication.
        unpushed=git('diff','--name-only','origin/main...HEAD').stdout.split()
        if any(not path.startswith(PUBLICATION) for path in unpushed):
            return 'unpushed commits outside the publication, not updated'
        if git('rebase','origin/main').returncode:
            git('rebase','--abort')
            return 'unpushed publication conflicts with GitHub, not updated'
        return 'updated, unpushed publication replayed on top'
    except (OSError,ValueError,subprocess.SubprocessError) as error:
        return f'not updated ({error})'


def online(root,minutes=20,every=30,clock=time.monotonic,sleep=time.sleep):
    """Wait until GitHub answers; return the seconds waited, or None if it never did."""
    start=clock()
    while True:
        try:
            if not subprocess.run(['git','ls-remote','--exit-code','origin','HEAD'],cwd=root,capture_output=True,timeout=60).returncode:
                return round(clock()-start)
        except (OSError,subprocess.SubprocessError):
            pass
        if clock()-start+every>minutes*60:
            return None
        sleep(every)


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    os.chdir(root)
    if '--publish' in sys.argv:
        waited=online(root)
        if waited is None:
            print('Network unavailable for 20 minutes (GitHub did not answer); nothing started, and the day\'s attempt is unused.',flush=True)
            sys.exit(0)
        if waited:
            print(f'Network ready after {waited} s.',flush=True)
        print(f'Worker checkout: {update(root)}.',flush=True)
    sys.path.insert(0,str(root))
    sys.argv=['lab','daily',*sys.argv[1:]]
    runpy.run_module('lab',run_name='__main__')
