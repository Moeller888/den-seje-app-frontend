"""
Generate unequip.wav from cloth foley.
Segment: 3545–3660ms (natural decay tail of grab at ~3530ms)
Processing: 3kHz zero-phase LP, 12ms cosine fade-in, 20ms cosine fade-out, normalize 0.45 peak
"""

import numpy as np
from scipy.signal import lfilter
import struct, wave, miniaudio

SRC  = r"C:\Users\Bruger\Downloads\soundque-cloth-grab-foley-soundque-foley-recording-445581.mp3"
DST  = r"C:\Users\Bruger\Documents\DEN SEJE APP\DEN SEJE APP\den-seje-app-frontend\assets\audio\unequip.wav"

START_MS  = 3545
END_MS    = 3660
FADE_IN   = 0.012   # 12ms
FADE_OUT  = 0.020   # 20ms
LP_CUTOFF = 3000    # Hz
NORM_PEAK = 0.45
OUT_SR    = 44100

# ── Decode MP3 ──────────────────────────────────────────────────────────────
stream = miniaudio.decode_file(SRC, output_format=miniaudio.SampleFormat.FLOAT32,
                               nchannels=1, sample_rate=OUT_SR)
samples = np.frombuffer(stream.samples, dtype=np.float32).copy()
sr = OUT_SR
print(f"Decoded: {len(samples)/sr:.3f}s @ {sr}Hz, peak={np.max(np.abs(samples)):.4f}")

# ── Extract segment ──────────────────────────────────────────────────────────
s0 = int(START_MS / 1000 * sr)
s1 = int(END_MS   / 1000 * sr)
seg = samples[s0:s1].copy()
dur = len(seg) / sr
print(f"Segment: {START_MS}-{END_MS}ms, {len(seg)} samples ({dur*1000:.1f}ms), peak={np.max(np.abs(seg)):.4f}")

# ── Zero-phase 1-pole IIR low-pass (filtfilt equivalent) ────────────────────
alpha = 1.0 / (1.0 + sr / (2 * np.pi * LP_CUTOFF))
b = [alpha]
a = [1.0, -(1.0 - alpha)]
# Forward pass
fwd = lfilter(b, a, seg)
# Backward pass (zero-phase)
seg_lp = lfilter(b, a, fwd[::-1])[::-1]
print(f"After 3kHz LP: peak={np.max(np.abs(seg_lp)):.4f}")

# ── Cosine fades ─────────────────────────────────────────────────────────────
fi = int(FADE_IN  * sr)
fo = int(FADE_OUT * sr)
# Fade in
t_in = np.arange(fi) / fi
env_in = 0.5 * (1 - np.cos(np.pi * t_in))
seg_lp[:fi] *= env_in
# Fade out
t_out = np.arange(fo) / fo
env_out = 0.5 * (1 + np.cos(np.pi * t_out))
seg_lp[-fo:] *= env_out

# ── Normalize to target peak ──────────────────────────────────────────────────
peak = np.max(np.abs(seg_lp))
print(f"Pre-norm peak={peak:.4f}, factor={NORM_PEAK/peak:.2f}x")
seg_lp *= (NORM_PEAK / peak)
print(f"Post-norm peak={np.max(np.abs(seg_lp)):.4f}")

# ── Write 16-bit mono WAV ────────────────────────────────────────────────────
pcm = np.clip(seg_lp, -1.0, 1.0)
pcm_int = (pcm * 32767).astype(np.int16)

with wave.open(DST, 'w') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(OUT_SR)
    wf.writeframes(pcm_int.tobytes())

print(f"Written: {DST} ({len(pcm_int)} samples, {len(pcm_int)/OUT_SR*1000:.1f}ms)")
