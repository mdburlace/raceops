#!/usr/bin/env python3
"""
Voice-over and captions for the training videos (used by tools/training_videos.py).

Each line a video says is turned into speech, placed on the video's timeline, mixed into one audio track and
written out as a WebVTT captions file (docs/guide/video/<name>.vtt), which the guide's video player shows.

Voices (--tts on training_videos.py):

  azure   Azure AI Speech, neural voices including Australian English (default voice en-AU-NatashaNeural).
          Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment (never in the repo).
  polly   Amazon Polly, neural voices including Australian English (default voice Olivia).
          Needs boto3 (pip install boto3) and AWS credentials the usual way: AWS_ACCESS_KEY_ID and
          AWS_SECRET_ACCESS_KEY, or AWS_PROFILE with ~/.aws/credentials (never in the repo). The region is
          AWS_REGION, default ap-southeast-2 (Sydney). The IAM user only needs polly:SynthesizeSpeech.
  piper   Piper, free and offline: pip install piper-tts, plus a voice model (.onnx with its .onnx.json).
          Give the model with --voice /path/to/voice.onnx or PIPER_VOICE.
          Check the voice's licence before you commit videos made with it: each Piper voice has the licence
          of the recordings it was trained on, and some (e.g. the lessac voices, from the Blizzard 2013 data)
          are for research only. RaceOps is a product, so use a voice whose licence allows commercial use.
  none    No voice: just the caption bar in the picture, as before narration.
  auto    azure if AZURE_SPEECH_KEY is set, else polly if AWS credentials or AWS_PROFILE are set,
          else piper if PIPER_VOICE is set, else none.

Speech is cached in tools/.tts-cache (ignored by Git), so re-recording a video only pays for lines that changed.

Check the audio and captions plumbing without a voice service or a server:

    python3 tools/narration.py --self-test
"""
import hashlib, html, os, re, shutil, struct, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, '.tts-cache')
RATE = 24000  # the audio track: 24 kHz mono, encoded to Opus in the WebM

# How the voice should say things the captions write in short. Applied to the spoken text only.
PRONOUNCE = [
    (r'\bRR\b', 'right rear'), (r'\bLR\b', 'left rear'), (r'\bRF\b', 'right front'), (r'\bLF\b', 'left front'),
    (r'\bpsi\b', 'P S I'), (r'\bJ-1001\b', 'job ten oh one'), (r'\bRd (\d+)\b', r'round \1'),
    (r'\bReb\b', 'rebound'), (r'\be\.g\.', 'for example'),
    (r'\s*→\s*', ', then '), (r'\s+—\s+', ', '), (r'…', '... '), (r'\+ ', ''), (r'\s*&\s*', ' and '), (r'’', "'"),
]


def spoken(text):
    """The caption as it should be read aloud."""
    for pat, rep in PRONOUNCE:
        text = re.sub(pat, rep, text)
    return re.sub(r'\s+', ' ', text).strip()


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


# ---------------------------------------------------------------- voices
def _azure(text, voice, out):
    key, region = os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION')
    if not key or not region:
        sys.exit('Azure voice: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. australiaeast).')
    lang = '-'.join(voice.split('-')[:2])
    ssml = (f"<speak version='1.0' xml:lang='{lang}'><voice name='{voice}'>"
            f"<prosody rate='-5%'>{html.escape(text)}</prosody></voice></speak>")
    req = urllib.request.Request(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode(), method='POST',
                                 headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                                          'X-Microsoft-OutputFormat': 'ogg-24khz-16bit-mono-opus', 'User-Agent': 'raceops-training-videos'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(out, 'wb') as f:
                f.write(r.read())
            return
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(2 * (attempt + 1)); continue
            sys.exit(f'Azure voice failed ({e.code}): {e.read()[:300]!r}')


def _polly_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        sys.exit('Amazon Polly voice: install boto3 first (pip install boto3).')
    region = os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION') or 'ap-southeast-2'
    return boto3.client('polly', region_name=region, config=Config(retries={'max_attempts': 5, 'mode': 'adaptive'}))


_POLLY = None


def _polly(text, voice, out):
    global _POLLY
    from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
    try:
        _POLLY = _POLLY or _polly_client()
        r = _POLLY.synthesize_speech(Text=text, TextType='text', Engine='neural', VoiceId=voice,
                                     OutputFormat='mp3', SampleRate=str(RATE))
        with open(out, 'wb') as f:
            f.write(r['AudioStream'].read())
    except NoCredentialsError:
        sys.exit('Amazon Polly voice: no AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS_PROFILE).')
    except (ClientError, BotoCoreError) as e:
        sys.exit(f'Amazon Polly voice failed: {e}')


RESEARCH_ONLY = ('lessac', 'blizzard')  # Piper voices trained on data licensed for research only


def _piper(text, voice, out):
    if not voice or not os.path.exists(voice):
        sys.exit('Piper voice: give the voice model with --voice /path/to/voice.onnx (or PIPER_VOICE).')
    if any(k in os.path.basename(voice).lower() for k in RESEARCH_ONLY) and not os.environ.get('NARRATION_RESEARCH_VOICE_OK'):
        sys.exit(f'{os.path.basename(voice)} is trained on recordings licensed for research only, so its videos can\'t be committed. '
                 'Use a voice that allows commercial use, or set NARRATION_RESEARCH_VOICE_OK=1 for a local test you won\'t commit.')
    subprocess.run([sys.executable, '-m', 'piper', '-m', voice, '-f', out, '--', text], check=True, capture_output=True)


PROVIDERS = {
    'azure': (_azure, 'en-AU-NatashaNeural', 'ogg'),
    'polly': (_polly, 'Olivia', 'mp3'),
    'piper': (_piper, None, 'wav'),
}


def choose(provider, voice):
    """Resolve --tts auto and the default voice. Returns (provider, voice), provider 'none' for no narration."""
    if provider == 'auto':
        aws = os.environ.get('AWS_ACCESS_KEY_ID') or os.environ.get('AWS_PROFILE')
        provider = ('azure' if os.environ.get('AZURE_SPEECH_KEY') else 'polly' if aws
                    else 'piper' if (voice or os.environ.get('PIPER_VOICE')) else 'none')
    if provider == 'none':
        return 'none', None
    if provider not in PROVIDERS:
        sys.exit(f'Unknown voice provider "{provider}" (use azure, polly, piper, none or auto).')
    if provider == 'piper':
        voice = voice or os.environ.get('PIPER_VOICE')
    return provider, voice or PROVIDERS[provider][1]


class Narrator:
    """Makes (and caches) a speech clip for a line of text."""

    def __init__(self, provider, voice, cache_dir=CACHE_DIR):
        self.provider, self.voice, self.cache_dir = provider, voice, cache_dir
        os.makedirs(cache_dir, exist_ok=True)

    def speak(self, text):
        """Speech for the text: (path, seconds)."""
        fn, _, ext = PROVIDERS[self.provider]
        key = hashlib.sha256(f'{self.provider}|{self.voice}|{text}'.encode()).hexdigest()[:20]
        out = os.path.join(self.cache_dir, f'{key}.{ext}')
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            tmp = out + '.part'
            fn(text, self.voice, tmp)
            os.replace(tmp, out)
        return out, duration(out)


# ---------------------------------------------------------------- the timeline of one video
class Timeline:
    """What was said and shown, and when, measured on the wall clock while the video records."""

    def __init__(self):
        self.t0 = time.monotonic()
        self.cues = []   # [start, end, caption, seconds of speech]
        self.clips = []  # (start, path, seconds)
        self.end = None

    def now(self):
        return time.monotonic() - self.t0

    def caption(self, text):
        t = self.now()
        if self.cues and self.cues[-1][1] is None:
            self.cues[-1][1] = t
        if text:
            self.cues.append([t, None, text, 0.0])

    def clip(self, path, seconds):
        self.clips.append((self.now(), path, seconds))
        if self.cues:
            self.cues[-1][3] = seconds

    def stop(self):
        self.end = self.now()
        if self.cues and self.cues[-1][1] is None:
            self.cues[-1][1] = self.end

    def shifted(self, video_seconds):
        """Line the wall clock up with the recording. The recording stops when the page closes (stop()), so any
        difference in length is time the recording started early or late."""
        off = video_seconds - (self.end if self.end is not None else self.now())
        cues = []
        for a, b, text, speech in self.cues:
            for x, y, part in split_cue(a, b, text, speech):
                if y + off > 0:
                    cues.append((max(0.0, x + off), max(0.0, y + off), part))
        clips = [(max(0.0, a + off), p, s) for a, p, s in self.clips]
        return cues, clips


def split_cue(start, end, text, speech, width=70):
    """A long line, shown a sentence at a time while it's being said. The last part stays up until the next line."""
    parts = [p for p in re.split(r'(?<=[.?!])\s+', text) if p]
    if len(text) <= width or len(parts) < 2 or speech <= 0:
        return [(start, end, text)]
    total = sum(len(p) for p in parts)
    out, t = [], start
    for i, p in enumerate(parts):
        nxt = end if i == len(parts) - 1 else t + speech * len(p) / total
        out.append((t, nxt, p)); t = nxt
    return out


def _ts(s):
    ms = int(round(s * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}'


def write_vtt(cues, path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('WEBVTT\n\n')
        for i, (a, b, text) in enumerate(cues, 1):
            if b - a < 0.3:
                continue
            f.write(f'{i}\n{_ts(a)} --> {_ts(b)}\n{text}\n\n')


def audio_track(clips, seconds, out_wav):
    """One mono WAV as long as the video, with each clip at its start time (clips that overlap are mixed)."""
    total = int(seconds * RATE)
    buf = [0] * total
    for start, path, _ in clips:
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'],
                             capture_output=True, check=True).stdout
        samples = struct.unpack(f'<{len(pcm) // 2}h', pcm[:len(pcm) // 2 * 2])
        at = int(start * RATE)
        for i, s in enumerate(samples[:max(0, total - at)]):
            buf[at + i] += s
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(struct.pack(f'<{total}h', *(max(-32768, min(32767, v)) for v in buf)))


def encode(raw, out_webm, timeline=None):
    """Re-encode the raw recording to the guide's VP9 WebM (1280 wide). With a timeline, add the voice track
    (Opus) and write the captions next to it as <name>.vtt. Without one, any old captions file is removed."""
    vtt = re.sub(r'\.webm$', '.vtt', out_webm)
    video = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-vf', 'scale=1280:-2']
    if not timeline or not timeline.clips:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, *video, '-an', out_webm], check=True)
        if os.path.exists(vtt):
            os.remove(vtt)
        return
    secs = duration(raw)
    cues, clips = timeline.shifted(secs)
    tmp = tempfile.mkdtemp()
    try:
        wav = os.path.join(tmp, 'voice.wav')
        audio_track(clips, secs, wav)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-i', wav, '-map', '0:v', '-map', '1:a', *video,
                        '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-shortest', out_webm], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    write_vtt(cues, vtt)


# ---------------------------------------------------------------- self-test
def _polly_test(tmp, tone):
    """Polly with a stubbed AWS client: the request it sends, and the speech it saves."""
    global _POLLY
    import io
    from botocore.stub import Stubber
    os.environ.setdefault('AWS_ACCESS_KEY_ID', 'test'); os.environ.setdefault('AWS_SECRET_ACCESS_KEY', 'test')
    mp3 = os.path.join(tmp, 'tone.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tone, '-ar', str(RATE), mp3], check=True)
    _POLLY = _polly_client()
    with Stubber(_POLLY) as st:
        st.add_response('synthesize_speech', {'AudioStream': io.BytesIO(open(mp3, 'rb').read()), 'ContentType': 'audio/mpeg'},
                        {'Text': 'right rear', 'TextType': 'text', 'Engine': 'neural', 'VoiceId': 'Olivia',
                         'OutputFormat': 'mp3', 'SampleRate': str(RATE)})
        n = Narrator('polly', 'Olivia', cache_dir=os.path.join(tmp, 'cache'))
        path, secs = n.speak('right rear')
        assert path.endswith('.mp3') and abs(secs - 1.0) < 0.15, (path, secs)
        assert n.speak('right rear')[0] == path  # second time from the cache: no second request (the stubber would fail)
    _POLLY = None
    assert choose('polly', None) == ('polly', 'Olivia')


def self_test():
    """Builds a 6-second video with two tones as 'speech' and checks the audio track and captions."""
    tmp = tempfile.mkdtemp()
    try:
        raw = os.path.join(tmp, 'raw.webm')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=6',
                        '-c:v', 'libvpx', raw], check=True)
        tones = []
        for i, f in enumerate((440, 660)):
            p = os.path.join(tmp, f'tone{i}.wav')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'sine=frequency={f}:duration=1', p], check=True)
            tones.append(p)
        tl = Timeline()
        tl.end = 5.5  # as if the page closed 5.5 s after it opened: the recording started 0.5 s early
        tl.cues = [[0.5, 2.5, 'One click of rebound out of the RR shock', 1.0], [2.5, 5.0, 'Save — it’s on the phone straight away', 1.0]]
        tl.clips = [(0.5, tones[0], 1.0), (2.5, tones[1], 1.0)]
        out = os.path.join(tmp, 'out.webm')
        encode(raw, out, tl)
        streams = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out],
                                 capture_output=True, text=True, check=True).stdout.split()
        assert streams == ['vp9', 'opus'], streams
        assert abs(duration(out) - 6) < 0.2, duration(out)
        vtt = open(out[:-5] + '.vtt', encoding='utf-8').read()
        assert vtt.startswith('WEBVTT') and '00:00:01.000 --> 00:00:03.000' in vtt and '00:00:03.000 --> 00:00:05.500' in vtt, vtt
        # the second tone should start about 3 s in (2.5 s + 0.5 s early start)
        lvl = subprocess.run(['ffmpeg', '-v', 'info', '-ss', '3.1', '-t', '0.5', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'],
                             capture_output=True, text=True).stderr
        quiet = subprocess.run(['ffmpeg', '-v', 'info', '-ss', '4.3', '-t', '0.5', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'],
                               capture_output=True, text=True).stderr
        mean = lambda s: float(re.search(r'mean_volume: (-?[\d.]+|-inf) dB', s).group(1).replace('-inf', '-200'))
        assert mean(lvl) > -40 and mean(quiet) < -60, (mean(lvl), mean(quiet))
        long = split_cue(10.0, 20.0, 'Press Save. It’s on the phone straight away, and syncs to the rest of the team when there’s signal.', 6.0)
        assert [p for _, _, p in long] == ['Press Save.', 'It’s on the phone straight away, and syncs to the rest of the team when there’s signal.'], long
        assert long[0][0] == 10.0 and 10.3 < long[0][1] < 10.7 and long[1][1] == 20.0, long
        assert spoken('Half a psi more in the RR → J-1001 — done') == 'Half a P S I more in the right rear, then job ten oh one, done'
        try:
            import boto3  # noqa: F401
        except ImportError:
            print('  (boto3 not installed: Amazon Polly not tested)')
        else:
            _polly_test(tmp, tones[0])
        encode(raw, out, None)  # silent again: the old captions file goes
        assert not os.path.exists(out[:-5] + '.vtt')
        print('Narration self-test: OK')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        self_test()
    else:
        print(__doc__)
