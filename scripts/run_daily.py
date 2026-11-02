#!/usr/bin/env python3
"""Launchd entry point with an explicit project import path.

Before a publishing run the checkout catches up with GitHub, so the run uses the latest pushed code and its own
publication is not refused. It only fast-forwards, or replays its own unpushed publication commits on top; it never
touches local edits, and when anything fails the run continues on the code it has.

A run fired just after the Mac wakes can find the network (or the VPN) not yet up, and its first model call then
stalls until the time limit. So a publishing run first waits for GitHub to answer, for up to 20 minutes; if it never
does, nothing starts and the day's attempt is not used."""
import os
from datetime import datetime
from pathlib import Path
import runpy
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
# Nothing from the lab package loads before the update: a broken commit there must not stop the next fix arriving.
# These match lab.ROOT and lab.PUBLICATION (a test keeps them in step).
PUBLICATION=('web/published/','web/dashboard.json','web/proposals.json')
sys.path.insert(0,str(ROOT))


class Stamped:
    """Starts every line of the daily log with the local time, so the log shows when each step happened."""
    def __init__(self,stream,clock=lambda: datetime.now().astimezone()):
        self.stream,self.clock,self.fresh=stream,clock,True

    def write(self,text):
        for line in text.splitlines(keepends=True):
            if self.fresh:
                self.stream.write(self.clock().isoformat(timespec='seconds')+' ')
            self.stream.write(line)
            self.fresh=line.endswith('\n')
        return len(text)

    def flush(self):
        self.stream.flush()

    def __getattr__(self,name):
        return getattr(self.stream,name)


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
    # launchd may start Python without a UTF-8 locale; the log keeps every character either way.
    for stream in (sys.stdout,sys.stderr):
        if hasattr(stream,'reconfigure'):
            stream.reconfigure(encoding='utf-8',errors='backslashreplace',line_buffering=True)
    if sys.stdout:
        sys.stdout=Stamped(sys.stdout)
    root=ROOT
    os.chdir(root)
    if '--publish' in sys.argv:
        waited=online(root)
        if waited is None:
            print('Network unavailable for 20 minutes (GitHub did not answer); nothing started, and the day\'s attempt is unused.',flush=True)
            sys.exit(0)
        if waited:
            print(f'Network ready after {waited} s.',flush=True)
        print(f'Worker checkout: {update(root)}.',flush=True)
    sys.argv=['lab','daily',*sys.argv[1:]]
    runpy.run_module('lab',run_name='__main__')
