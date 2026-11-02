"""Generate a macOS launch agent; installation is an explicit user action."""
import os
import plistlib
import sys
from . import ROOT

LABEL='org.the-council.daily'

def write_schedule(hour=9, count=1, provider='claude', root=ROOT):
    if not 0<=hour<=23 or count not in (1,2) or provider not in ('claude','codex'):
        raise ValueError('Invalid daily schedule.')
    folder=root/'.council-state'
    folder.mkdir(exist_ok=True)
    path=folder/f'{LABEL}.plist'
    config={
        'Label':LABEL,
        'ProgramArguments':['/usr/bin/caffeinate','-i',sys.executable,str(root/'scripts'/'run_daily.py'),
                            '--provider',provider,'--count',str(count),'--rounds','3','--publish'],
        'WorkingDirectory':str(root),
        'StartCalendarInterval':{'Hour':hour,'Minute':0},
        'EnvironmentVariables':{'PATH':os.environ.get('PATH','/opt/homebrew/bin:/usr/bin:/bin')},
        'StandardOutPath':str(folder/'daily.log'),
        'StandardErrorPath':str(folder/'daily-error.log'),
        'ProcessType':'Background',
    }
    path.write_bytes(plistlib.dumps(config))
    return path
