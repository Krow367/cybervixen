import wave
import struct
import math
import os
import subprocess

wav_path = '/home/cybervixen/Documents/sites/cybervixen/src_rewrite/audio/135872__crz1990__keyboard-typing-sounds-27-november-2011-121152-am.wav'
output_dir = '/home/cybervixen/Documents/sites/cybervixen/src_rewrite/audio/keyboard'
os.makedirs(output_dir, exist_ok=True)

with wave.open(wav_path, 'rb') as w:
    n_channels = w.getnchannels()
    sampwidth = w.getsampwidth()
    framerate = w.getframerate()
    n_frames = w.getnframes()
    raw_data = w.readframes(n_frames)

# Read 24-bit stereo samples
samples = []
bytes_per_sample = sampwidth * n_channels

for i in range(0, len(raw_data), bytes_per_sample):
    frame_bytes = raw_data[i : i + bytes_per_sample]
    # Extract left channel 24-bit signed
    b = frame_bytes[0:3]
    # sign extend 24-bit to 32-bit
    val = int.from_bytes(b, byteorder='little', signed=True) / 8388608.0
    samples.append(val)

print(f"Loaded {len(samples)} samples ({len(samples)/framerate:.2f}s) at {framerate}Hz")

# Calculate absolute amplitude envelope (moving average window 4ms)
win = int(framerate * 0.004)
env = [0.0] * len(samples)
running_sum = 0.0
for i in range(len(samples)):
    running_sum += abs(samples[i])
    if i >= win:
        running_sum -= abs(samples[i - win])
        env[i] = running_sum / win
    else:
        env[i] = running_sum / (i + 1)

max_energy = max(env)
threshold = max_energy * 0.07

peaks = []
min_dist = int(framerate * 0.075) # 75ms min separation
i = 0
while i < len(env):
    if env[i] > threshold:
        # find peak in next 35ms
        w_end = min(len(env), i + int(framerate * 0.035))
        local_max_val = -1
        local_max_idx = i
        for j in range(i, w_end):
            if env[j] > local_max_val:
                local_max_val = env[j]
                local_max_idx = j
        
        # look back 10ms for true onset
        onset_idx = local_max_idx
        while onset_idx > max(0, local_max_idx - int(framerate * 0.012)) and env[onset_idx] > threshold * 0.2:
            onset_idx -= 1
            
        peaks.append((onset_idx, local_max_idx, local_max_val))
        i = local_max_idx + min_dist
    else:
        i += 1

print(f"Found {len(peaks)} keystroke events.")

key_num = 1
space_num = 1
enter_num = 1

for idx, (onset, peak, amp) in enumerate(peaks):
    time_sec = onset / framerate
    # slice duration ~170ms
    duration = int(framerate * 0.17)
    if idx < len(peaks) - 1:
        duration = min(duration, peaks[idx+1][0] - onset)
    
    end = min(len(samples), onset + duration)
    slice_samples = samples[onset:end]
    
    # Peak normalize
    max_s = max(abs(s) for s in slice_samples) if slice_samples else 1.0
    if max_s == 0: max_s = 1.0
    scale = 0.90 / max_s

    # End fade out (8ms)
    fade_len = int(framerate * 0.008)
    processed = []
    for s_i, s in enumerate(slice_samples):
        val = s * scale
        if s_i >= len(slice_samples) - fade_len:
            factor = (len(slice_samples) - 1 - s_i) / fade_len
            val *= factor
        processed.append(val)

    # Heuristic: spacebar / enter typically have longer duration / higher energy or distinct timing
    # Slices around pauses or with distinct volume
    if amp > max_energy * 0.75:
        filename = f"enter_{enter_num:02d}.wav"
        kind = "ENTER/RETURN"
        enter_num += 1
    elif amp < max_energy * 0.28 and (idx == len(peaks) - 1 or (peaks[idx+1][0] - onset) > framerate * 0.18):
        filename = f"space_{space_num:02d}.wav"
        kind = "SPACEBAR"
        space_num += 1
    else:
        filename = f"key_{key_num:02d}.wav"
        kind = "KEY"
        key_num += 1

    wav_out = os.path.join(output_dir, filename)
    
    # Write 16-bit 44.1kHz WAV via ffmpeg (resample from 96kHz to standard 44.1kHz)
    temp_raw = os.path.join(output_dir, "temp.raw")
    with open(temp_raw, "wb") as f:
        for val in processed:
            ival = int(max(-1.0, min(1.0, val)) * 32767)
            f.write(struct.pack("<h", ival))
            
    # Use ffmpeg to convert to clean 44.1kHz mono WAV
    ogg_out = os.path.join(output_dir, filename.replace(".wav", ".ogg"))
    subprocess.run([
        "ffmpeg", "-y", "-f", "s16le", "-ar", str(framerate), "-ac", "1", "-i", temp_raw,
        "-ar", "44100", "-ac", "1", wav_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Also export pristine tiny OGG version!
    subprocess.run([
        "ffmpeg", "-y", "-i", wav_out, "-c:a", "libvorbis", "-qscale:a", "5", ogg_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f"[{kind:12s}] -> {filename} & {os.path.basename(ogg_out)} (at {time_sec:.3f}s, amp: {amp/max_energy:.2f})")

if os.path.exists(os.path.join(output_dir, "temp.raw")):
    os.remove(os.path.join(output_dir, "temp.raw"))

print("\nDone! All keystrokes cleanly trimmed, normalized, and exported as WAV + OGG.")
