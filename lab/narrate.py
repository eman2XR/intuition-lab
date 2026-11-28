"""Narrate a film guide with a Gemini voice: lab/narrate.py <scene.json> <out dir> [--voice Algenib] [--batch 10].

The subtitle lines are spoken by Gemini's text-to-speech model a few sections at a time (one request per batch, so the
reading flows from line to line and a whole film fits the free tier's few requests a day), cached by text and voice in
.council-state/narration/. Each batch is cut back into its lines at the longest pauses, and a text model transcribes the
cut clips so a wrong cut, a skipped line or a spoken stage direction is caught before anything is written. Each line's
spoken length then goes into the scene as `spoken`, so the site's timeline keeps every line on screen at least as long
as it is spoken (scene.js timelineOf), and the clips are laid at their lines' start times into one narration.wav for
lab/film.py to put under the picture.

The key is read from GEMINI_API_KEY or .council-state/gemini-key (never from the repository). Gemini returns 16-bit
mono PCM at 24 kHz."""
import argparse, array, base64, difflib, hashlib, io, json, os, re, subprocess, sys, tempfile, time, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lab.film import timeline  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

API = 'https://generativelanguage.googleapis.com/v1beta'
CACHE = ROOT / '.council-state' / 'narration'
RATE = 24000
# Directions in the layout Gemini's speech models read as notes rather than as text to speak.
DIRECTION = """# AUDIO PROFILE: the narrator of a calm science documentary
### DIRECTOR'S NOTES
Style: warm, clear and unhurried, like explaining something wonderful to a curious friend.
Pacing: steady and relaxed, with a clear pause after every line.
#### TRANSCRIPT
"""


def key():
    k = os.environ.get('GEMINI_API_KEY') or (ROOT / '.council-state' / 'gemini-key').read_text().strip()
    if not k:
        raise SystemExit('No Gemini key: set GEMINI_API_KEY or write it to .council-state/gemini-key')
    return k


def call(url, body=None):
    """One request through curl, which trusts the system's certificates (the sandbox proxy's among them). The key goes
    in a header file readable only by this user, never on the command line."""
    with tempfile.NamedTemporaryFile('w', delete=False) as hf:
        os.chmod(hf.name, 0o600); hf.write(f'x-goog-api-key: {key()}\nContent-Type: application/json\n')
    try:
        cmd = ['curl', '-s', '-m', '300', '-H', f'@{hf.name}', url] + (['--data-binary', '@-'] if body is not None else [])
        r = subprocess.run(cmd, input=json.dumps(body).encode() if body is not None else None, capture_output=True, check=True)
    finally:
        os.unlink(hf.name)
    d = json.loads(r.stdout)
    if 'error' in d:
        raise RuntimeError(d['error'].get('message', 'Gemini error'))
    return d


def models():
    return [m['name'].split('/', 1)[1] for m in call(f'{API}/models?pageSize=200').get('models', [])]


def version(n):
    return tuple(float(x) for x in re.findall(r'\d+(?:\.\d+)?', n)[:1])


def newest(names):
    return max(names, key=lambda n: (version(n), 'preview' not in n)) if names else None


def tts_model(names):
    """The newest full flash speech model (the lite one sounds flatter)."""
    pick = newest([n for n in names if n.endswith('flash-tts') or n.endswith('flash-tts-preview')])
    if not pick:
        raise SystemExit('This key has no text-to-speech model.')
    return pick


def check_model(names):
    return newest([n for n in names if re.fullmatch(r'gemini-[\d.]+-flash', n)]) or 'gemini-flash-latest'


def speak(lines, voice, model):
    """Speaks a batch of lines in one request; the result is cached by model, voice, directions and text."""
    CACHE.mkdir(parents=True, exist_ok=True)
    text = DIRECTION + '\n\n'.join(lines)
    h = hashlib.sha1(f'{model}|{voice}|{text}'.encode()).hexdigest()[:16]
    path = CACHE / f'batch-{h}.pcm'
    if path.exists():
        return path.read_bytes()
    body = {'contents': [{'parts': [{'text': text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    for attempt in range(3):
        try:
            d = call(f'{API}/models/{model}:generateContent', body)
            pcm = base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])
            path.write_bytes(pcm)
            return pcm
        except Exception as e:
            if attempt == 2 or 'quota' in str(e).lower():
                raise
            print(f'retrying after {e}', flush=True)
            time.sleep(10 * (attempt + 1))


def trim(pcm):
    """Cuts silence from both ends (16-bit samples below about -50 dB), leaving a short natural margin."""
    a = array.array('h', pcm)
    loud = [i for i in range(0, len(a), 120) if abs(a[i]) > 100]
    if not loud:
        return pcm
    s, e = max(0, loud[0] - int(.05 * RATE)), min(len(a), loud[-1] + int(.12 * RATE))
    return a[s:e].tobytes()


def split(pcm, k):
    """Cuts one spoken batch into k clips at its k-1 longest pauses (silence measured in 20 ms windows)."""
    a = array.array('h', pcm)
    w = int(.02 * RATE)
    env = [max(map(abs, a[i:i + w]), default=0) for i in range(0, len(a), w)]
    loud = sorted(env)[int(len(env) * .9)] or 1
    quiet = [e < .04 * loud for e in env]
    voiced = [i for i, q in enumerate(quiet) if not q]
    gaps, i = [], voiced[0]
    while i <= voiced[-1]:
        if quiet[i]:
            j = i
            while quiet[j]:
                j += 1
            gaps.append((j - i, i, j))
            i = j
        else:
            i += 1
    cuts = sorted((s + e) // 2 * w for _, s, e in sorted(gaps, reverse=True)[:k - 1])
    if len(cuts) < k - 1:
        raise RuntimeError(f'found {len(cuts) + 1} spoken lines where {k} were expected')
    bounds = [0] + cuts + [len(a)]
    return [trim(a[bounds[n]:bounds[n + 1]].tobytes()) for n in range(k)], sorted(g[0] * .02 for g in gaps)[::-1][:k]


def wav_bytes(pcm):
    b = io.BytesIO()
    with wave.open(b, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm)
    return b.getvalue()


def transcribe(clips, model):
    """Asks a text model what each clip says, in order."""
    parts = [{'text': f'Here are {len(clips)} short audio clips. Transcribe each one exactly, word for word, including '
                      'anything that is not part of a normal sentence. Reply with a JSON array of strings, one per clip, in order.'}]
    parts += [{'inlineData': {'mimeType': 'audio/wav', 'data': base64.b64encode(wav_bytes(c)).decode()}} for c in clips]
    body = {'contents': [{'parts': parts}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0}}
    for attempt, m in enumerate([model, model, 'gemini-3.5-flash', 'gemini-2.5-flash']):
        try:
            d = call(f'{API}/models/{m}:generateContent', body)
            return json.loads(d['candidates'][0]['content']['parts'][0]['text'])
        except Exception as e:  # a busy model: wait, then try an older one
            if attempt == 3:
                raise
            print(f'  transcript retry after {e}', flush=True)
            time.sleep(8)


def norm(s):
    return re.sub(r'[^a-z0-9 ]', '', s.lower().replace('-', ' ')).split()


def same(said, line):
    return difflib.SequenceMatcher(None, norm(said), norm(line)).ratio()


def batches(scene_lines, size):
    """Groups whole sections into batches of at most `size` lines."""
    out, cur = [], []
    for sec in scene_lines:
        if cur and len(cur) + len(sec) > size:
            out.append(cur); cur = []
        cur += sec
    return out + ([cur] if cur else [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('out')
    ap.add_argument('--voice', default='Algenib')
    ap.add_argument('--batch', type=int, default=10, help='most lines spoken in one request (whole sections)')
    ap.add_argument('--model', help='speech model (default: the newest flash TTS model)')
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    scene = json.loads(Path(a.scene).read_text())
    scene.pop('spoken', None)
    names = models()
    model, checker = a.model or tts_model(names), check_model(names)
    print('speech', model, 'voice', a.voice, 'check', checker, flush=True)
    with sync_playwright() as p:
        tl = timeline(p, scene)
    sections = [[l['text'] for l in c['lines']] for c in tl['chapters']]
    lines = [l for s in sections for l in s]
    clips = []
    for b in batches(sections, a.batch):
        pcm = speak(b, a.voice, model)
        cut, pauses = split(pcm, len(b))
        heard = transcribe(cut, checker)
        scores = [same(h, l) for h, l in zip(heard, b)] if len(heard) == len(b) else []
        for n, l in enumerate(b):
            print(f'  {len(cut[n]) / 2 / RATE:5.2f}s  {scores[n] if scores else 0:.2f}  {l[:60]}', flush=True)
        if len(scores) != len(b) or min(scores) < .85:
            print(json.dumps({'expected': b, 'heard': heard, 'pauses': pauses}, indent=1), flush=True)
            raise SystemExit('The spoken batch does not match its lines; nothing was written.')
        clips += cut
    # The spoken lengths go into the scene; the timeline is rebuilt from them, and each clip laid at its line's start.
    scene['spoken'] = [round(len(c) / 2 / RATE, 3) for c in clips]
    scene['narration'] = {'voice': a.voice, 'model': model}
    Path(a.scene).write_text(json.dumps(scene, indent=1, ensure_ascii=False))
    with sync_playwright() as p:
        tl = timeline(p, scene)
    starts = [l['start'] for c in tl['chapters'] for l in c['lines']]
    total = int((tl['total'] + 1) * RATE)
    mix = array.array('h', bytes(total * 2))
    for st, c in zip(starts, clips):
        s = array.array('h', c); o = int(st * RATE)
        n = min(len(s), total - o)
        mix[o:o + n] = s[:n]
    (out / 'narration.wav').write_bytes(wav_bytes(mix.tobytes()))
    print(json.dumps({'lines': len(lines), 'seconds': round(tl['total'], 1), 'wav': str(out / 'narration.wav')}))


if __name__ == '__main__':
    main()
