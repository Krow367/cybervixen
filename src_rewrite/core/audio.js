/**
 * audio.js — foxOS Hardware Synthesizer & Acoustic Feedback Engine
 *
 * Schematics & Circuitry:
 * ┌─────────────────┐     ┌────────────────┐     ┌──────────────┐     ┌─────────────┐
 * │  OscillatorNode │ ──> │  BiquadFilter  │ ──> │   GainNode   │ ──> │ Destination │
 * │ (Square/Saw/Tri)│     │  (Tone Color)  │ ──> │ (ADSR Decay) │ ──> │  (Speakers)  │
 * └─────────────────┘     └────────────────┘     └──────────────┘     └─────────────┘
 *
 * Emulates vintage hardware audio sub-circuits:
 * 1. Solenoid Keyclick Circuit (VT100 / IBM 3270 electronic keyboard relay snap)
 * 2. Teletype Printhead Chitter (subtle mechanical pulse during text streaming)
 * 3. CRT Buffer Relay Thump (heavy relay drop on Return / Window Focus)
 * 4. Bell / Annunciator Tone (750Hz chime on ASCII bell / system alert)
 * 5. Stepper Motor Disk Seek (crunchy track seeking on file access)
 * 6. Serenity POST Diagnostic Chime (retro boot sequence arpeggio)
 */

import { loadSettings, SOUND_PROFILES } from "./settings.js";

let audioCtx = null;
let masterGainNode = null;

// Dedicated Hardware Channel Gain Buses
export const buses = {
    ambience: null,
    keyboard: null,
    drive: null,
    system: null,
    ui: null
};

// Continuous Ambient Sound State
let ambienceOsc = null;
let ambienceFilter = null;
let ambienceGain = null;
let fanNoiseSource = null;

/**
 * Initializes or returns the master AudioContext singleton and creates channel buses.
 */
export function getAudioContext() {
    if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return null;
        audioCtx = new AudioCtxClass();

        // 1. Create Master Output Gain Node
        masterGainNode = audioCtx.createGain();
        masterGainNode.connect(audioCtx.destination);

        // 2. Create Dedicated Hardware Sub-Buses
        buses.ambience = audioCtx.createGain();
        buses.keyboard = audioCtx.createGain();
        buses.drive = audioCtx.createGain();
        buses.system = audioCtx.createGain();
        buses.ui = audioCtx.createGain();

        // Route all sub-buses through the Master Gain
        buses.ambience.connect(masterGainNode);
        buses.keyboard.connect(masterGainNode);
        buses.drive.connect(masterGainNode);
        buses.system.connect(masterGainNode);
        buses.ui.connect(masterGainNode);

        syncVolume();
        startAmbientDrone();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/**
 * Generates continuous authentic 1981 CRT & chassis cooling drone on the Ambience bus.
 */
function startAmbientDrone() {
    if (!audioCtx || ambienceOsc) return;

    try {
        // 1. Subtle 60Hz Cathode Tube Magnetic Hum + 120Hz Full-Wave Rectifier Harmonic
        ambienceOsc = audioCtx.createOscillator();
        const subOsc = audioCtx.createOscillator();
        const humGain = audioCtx.createGain();

        ambienceOsc.type = "sine";
        ambienceOsc.frequency.setValueAtTime(60, audioCtx.currentTime);

        subOsc.type = "triangle";
        subOsc.frequency.setValueAtTime(120, audioCtx.currentTime);

        humGain.gain.setValueAtTime(0.018, audioCtx.currentTime);

        ambienceOsc.connect(humGain);
        subOsc.connect(humGain);

        // 2. Low-pass filtered cooling chassis fan air drone
        const noise = getNoiseBuffer(audioCtx);
        fanNoiseSource = audioCtx.createBufferSource();
        fanNoiseSource.buffer = noise;
        fanNoiseSource.loop = true;

        const fanFilter = audioCtx.createBiquadFilter();
        fanFilter.type = "lowpass";
        fanFilter.frequency.setValueAtTime(240, audioCtx.currentTime);

        const fanGain = audioCtx.createGain();
        fanGain.gain.setValueAtTime(0.012, audioCtx.currentTime);

        fanNoiseSource.connect(fanFilter);
        fanFilter.connect(fanGain);

        // Connect both into the Ambience Channel Bus
        humGain.connect(buses.ambience);
        fanGain.connect(buses.ambience);

        ambienceOsc.start();
        subOsc.start();
        fanNoiseSource.start();
    } catch (e) {
        console.warn("Ambient drone init deferred until user interaction");
    }
}

// Cache for decoded high-fidelity mechanical audio recordings
const sampleCache = new Map();

/**
 * Loads, decodes, and caches a mechanical audio sample using WebAudio decodeAudioData.
 */
export async function loadSample(url) {
    if (sampleCache.has(url)) return sampleCache.get(url);
    const ctx = getAudioContext();
    if (!ctx) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        sampleCache.set(url, decoded);
        return decoded;
    } catch {
        return null;
    }
}

/**
 * Plays a decoded AudioBuffer sample through a specific channel bus.
 * 
 * @param {AudioBuffer} buffer 
 * @param {string} channel - 'keyboard', 'drive', 'system', 'ui', or 'ambience'
 * @param {number} gainMultiplier 
 * @param {number} playbackRate - Speed/pitch multiplier (1.0 = normal)
 */
export function playSampleBuffer(buffer, channel = "system", gainMultiplier = 1.0, playbackRate = 1.0) {
    if (!buffer) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;

    const targetBus = buses[channel] || masterGainNode;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (playbackRate !== 1.0) {
        source.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainMultiplier, ctx.currentTime);

    source.connect(gain);
    gain.connect(targetBus);

    source.start(ctx.currentTime);
}

/**
 * Pre-warms the AudioContext on the earliest user interaction.
 */
function setupAudioPrewarm() {
    const warm = () => {
        getAudioContext();
        loadSample("./audio/spinup.mp3");
        loadSample("./audio/seek.mp3");
        window.removeEventListener("keydown", warm, true);
        window.removeEventListener("pointerdown", warm, true);
    };
    window.addEventListener("keydown", warm, { capture: true, once: true });
    window.addEventListener("pointerdown", warm, { capture: true, once: true });
}
setupAudioPrewarm();

// ─── Acoustic Noise Buffer Generator ──────────────────────────────────────────
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
    if (!noiseBuffer) {
        const bufferSize = ctx.sampleRate * 2; // 2 seconds of pre-rendered noise
        noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }
    }
    return noiseBuffer;
}

/**
 * Synchronizes the hardware master volume and all individual channel buses
 * with current user settings.
 */
export function syncVolume() {
    if (!audioCtx || !masterGainNode) return;
    const settings = loadSettings();

    // 1. Master Volume
    const masterVol = typeof settings.volume === "number" ? Math.max(0, Math.min(100, settings.volume)) : 75;
    const masterGainValue = (masterVol / 100) * 0.35;
    masterGainNode.gain.setValueAtTime(masterGainValue, audioCtx.currentTime);

    // 2. Individual Channel Gain Buses
    if (buses.ambience) {
        const ambVol = typeof settings.ambienceVolume === "number" ? settings.ambienceVolume : 25;
        buses.ambience.gain.setValueAtTime(ambVol / 100, audioCtx.currentTime);
    }
    if (buses.keyboard) {
        const kbVol = typeof settings.keyboardVolume === "number" ? settings.keyboardVolume : 40;
        buses.keyboard.gain.setValueAtTime(kbVol / 100, audioCtx.currentTime);
    }
    if (buses.drive) {
        const drvVol = typeof settings.driveVolume === "number" ? settings.driveVolume : 65;
        buses.drive.gain.setValueAtTime(drvVol / 100, audioCtx.currentTime);
    }
    if (buses.system) {
        const sysVol = typeof settings.systemVolume === "number" ? settings.systemVolume : 75;
        buses.system.gain.setValueAtTime(sysVol / 100, audioCtx.currentTime);
    }
    if (buses.ui) {
        const uiVol = typeof settings.uiVolume === "number" ? settings.uiVolume : 50;
        buses.ui.gain.setValueAtTime(uiVol / 100, audioCtx.currentTime);
    }
}

// ─── Pre-warm and Cache Final Keyboard Acoustic Samples ────────────────────────
const KEY_SAMPLE_COUNT = 11;
let lastKeySampleIndex = -1;

/**
 * Generates a non-repeating random index for organic typing cadence.
 */
function getNextKeySampleIndex() {
    let next;
    do {
        next = Math.floor(Math.random() * KEY_SAMPLE_COUNT) + 1;
    } while (next === lastKeySampleIndex && KEY_SAMPLE_COUNT > 1);

    lastKeySampleIndex = next;
    return next;
}

/**
 * Pre-loads the selected keyboard acoustic recordings into zero-latency memory.
 */
export async function preloadKeyboardSamples() {
    const promises = [];
    for (let i = 1; i <= KEY_SAMPLE_COUNT; i++) {
        promises.push(loadSample(`./audio/final_keyboard/key_${String(i).padStart(2, '0')}.ogg`));
    }
    promises.push(loadSample("./audio/final_keyboard/space.ogg"));
    promises.push(loadSample("./audio/final_keyboard/enter.ogg"));
    await Promise.all(promises);
}

/**
 * Plays physical mechanical keyboard feedback on keystroke.
 * 
 * @param {string} keyType - 'key' (default), 'space', or 'enter'
 */
export async function playKeyClick(keyType = "key") {
    if (document.hidden) return;
    const settings = loadSettings();
    if (settings.volume <= 0 || settings.keyboardVolume <= 0) return;

    // Unified 11-sample organic shuffle bag for all keys and spacebar
    const num = getNextKeySampleIndex();
    const sampleUrl = `./audio/final_keyboard/key_${String(num).padStart(2, '0')}.ogg`;

    let gainScale = 0.90;
    // Microscopic +/- 2.5% physical pitch jitter on each finger strike
    let pitchJitter = 1.0 + (Math.random() * 0.05 - 0.025);

    if (keyType === "space") {
        gainScale = 0.95;
    } else if (keyType === "enter") {
        gainScale = 1.05;
    }

    const buffer = await loadSample(sampleUrl);
    if (buffer) {
        playSampleBuffer(buffer, "keyboard", gainScale, pitchJitter);
    }
}

/**
 * Plays character output feedback during typewriter streaming:
 * - Cinema Mode: Soft sci-fi serial UART data blips (Alien / WarGames style).
 * - VT100 Mode: SILENT (authentic CRT phosphor drawing has no mechanical printhead).
 * - Silent Mode: SILENT.
 */
let lastTeletypeTime = 0;
export function playTeletypeClick() {
    if (document.hidden) return;
    const settings = loadSettings();
    const profile = settings.soundProfile || SOUND_PROFILES.CINEMA;
    // Only Cinema profile plays serial data blips
    if (settings.volume <= 0 || profile !== SOUND_PROFILES.CINEMA) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (now - lastTeletypeTime < 0.032) return;
    lastTeletypeTime = now;

    // High-tech sci-fi serial carrier blip (MU-TH-UR 6000 / WOPR data pulse)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    const freq = 1900 + (Math.random() * 500 - 250);
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.007);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.007);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);

    osc.start(now);
    osc.stop(now + 0.008);
}

/**
 * Plays a solenoid relay thump (triggered on Enter, Window Focus, or Paging).
 * Active in Cinema and VT100 modes; muted in Silent mode.
 */
export function playRelayThump() {
    if (document.hidden) return;
    const settings = loadSettings();
    const profile = settings.soundProfile || SOUND_PROFILES.CINEMA;
    if (settings.volume <= 0 || profile === SOUND_PROFILES.SILENT) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 24ms low-end physical solenoid impact
    osc.type = "square";
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.024);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);

    osc.connect(gain);
    gain.connect(masterGainNode);

    osc.start(now);
    osc.stop(now + 0.026);
}

/**
 * Plays the iconic DEC VT100 787Hz terminal bell tone.
 * Essential feedback: plays in all sound profiles when master volume > 0.
 * 
 * @param {number} freq - Pitch in Hz (default: 787 - DEC VT100 standard)
 * @param {number} duration - Duration in seconds (default: 0.10)
 */
export function playBell(freq = 787, duration = 0.10) {
    const settings = loadSettings();
    if (settings.volume <= 0) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(buses.system || masterGainNode);

    osc.start(now);
    osc.stop(now + duration + 0.01);
}

/**
 * Plays an error / reject low buzzer.
 * Essential feedback: plays in all sound profiles when master volume > 0.
 */
export function playErrorBuzz() {
    const settings = loadSettings();
    if (settings.volume <= 0) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(130, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(buses.system || masterGainNode);

    osc.start(now);
    osc.stop(now + 0.16);
}

/**
 * Plays the full Winchester / MFM physical magnetic hard drive spin-up and calibration sequence:
 * Spindle motor accelerates to 3,600 RPM + head actuator unparks and aligns with track 0.
 */
export async function playDiskSpinUp() {
    const buffer = await loadSample("./audio/spinup.mp3");
    if (buffer) {
        playSampleBuffer(buffer, "drive", 0.38);
    }
}

/**
 * Plays floppy / magnetic disk seek:
 * Uses the authentic recorded physical head-stepping sample with zero-latency buffer playback.
 * 
 * @param {number} clicks - Number of track seek steps
 */
export async function playDiskSeek(clicks = 4) {
    const buffer = await loadSample("./audio/seek.mp3");
    if (buffer) {
        playSampleBuffer(buffer, "drive", 0.55);
        return;
    }
}

/**
 * Simulates physical disk controller chatter / sector reading sound:
 * Multiple rapid head seeks interspersed with acoustic noise bursts.
 * 
 * @param {number} durationMs - How long the drive reads/writes
 */
export async function playDiskActivity(durationMs = 450) {
    const settings = loadSettings();
    if (settings.volume <= 0 || settings.floppyDrive === false) return;

    playDiskSeek();
    const bursts = Math.max(1, Math.floor(durationMs / 180));
    for (let i = 1; i < bursts; i++) {
        setTimeout(() => {
            playDiskSeek();
        }, i * 180);
    }
}

/**
 * Plays a multi-tone rising boot / victory arpeggio:
 * SGI / Commodore / DEC VAX style warm multi-octave harmonic chime.
 */
export async function playBootChime() {
    const settings = loadSettings();
    if (settings.volume <= 0 || settings.systemBeeps === false) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Classic 4-note ascending workstation boot arpeggio (C4 -> E4 -> G4 -> C5)
    const notes = [261.63, 329.63, 392.00, 523.25];
    const baseNow = ctx.currentTime;

    for (let i = 0; i < notes.length; i++) {
        const noteTime = baseNow + (i * 0.11);
        const osc = ctx.createOscillator();
        const subOsc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(notes[i], noteTime);

        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(notes[i] * 0.5, noteTime); // Warm sub-octave fundamental

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2800, noteTime);
        filter.frequency.exponentialRampToValueAtTime(600, noteTime + 0.38);

        gain.gain.setValueAtTime(0.38, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.42);

        osc.connect(filter);
        subOsc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGainNode);

        osc.start(noteTime);
        osc.stop(noteTime + 0.45);
        subOsc.start(noteTime);
        subOsc.stop(noteTime + 0.45);
    }
    await new Promise(r => setTimeout(r, 520));
}

// ─── Bespoke foxHound Retro Arcade Sound Synthesizer ──────────────────────────

export const foxhoundAudio = {
    paddleHit() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.035);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        osc.connect(gain);
        gain.connect(masterGainNode);

        osc.start(now);
        osc.stop(now + 0.05);
    },

    wallHit() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        osc.connect(gain);
        gain.connect(masterGainNode);

        osc.start(now);
        osc.stop(now + 0.025);
    },

    brickHit(row = 0, isSpecial = false) {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const basePitches = [880, 784, 659.25, 587.33, 523.25, 440, 392, 349.23, 329.63];
        const pitch = basePitches[Math.min(row, basePitches.length - 1)] || 523.25;

        osc.type = isSpecial ? "sawtooth" : "square";
        if (isSpecial) {
            osc.frequency.setValueAtTime(pitch * 1.5, now);
            osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, now + 0.06);
        } else {
            osc.frequency.setValueAtTime(pitch, now);
        }

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(masterGainNode);

        osc.start(now);
        osc.stop(now + 0.06);
    },

    ballLaunch() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(masterGainNode);

        osc.start(now);
        osc.stop(now + 0.08);
    },

    lifeLost() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(masterGainNode);

        osc.start(now);
        osc.stop(now + 0.32);
    },

    glitchCollapse() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [1200, 950, 750, 500, 350];
        notes.forEach((freq, i) => {
            const time = ctx.currentTime + i * 0.035;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.18, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

            osc.connect(gain);
            gain.connect(masterGainNode);

            osc.start(time);
            osc.stop(time + 0.045);
        });
    },

    victory() {
        if (document.hidden) return;
        const settings = loadSettings();
        if (settings.volume <= 0) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5 to G6
        notes.forEach((freq, i) => {
            const time = ctx.currentTime + i * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "square";
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.22, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

            osc.connect(gain);
            gain.connect(masterGainNode);

            osc.start(time);
            osc.stop(time + 0.09);
        });
    }
};

/**
 * Synthesizes the mechanical friction of a motorized glass microfiche carrier
 * sliding rapidly across the optical lamp + the detent lock clack.
 */
export function playMicroficheSlide() {
    if (document.hidden) return;
    const settings = loadSettings();
    if (settings.volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;

    const now = ctx.currentTime;

    // 1. Friction Glass Slide Noise (Filtered White Noise Burst)
    const noise = getNoiseBuffer(ctx);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noise;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1400, now);
    bandpass.frequency.linearRampToValueAtTime(600, now + 0.16);
    bandpass.Q.setValueAtTime(2.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noiseSrc.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(masterGainNode);

    noiseSrc.start(now);
    noiseSrc.stop(now + 0.18);

    // 2. Mechanical Solenoid Detent Lock (Clack)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(280, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.19);

    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.setValueAtTime(0.25, now + 0.12);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(oscGain);
    oscGain.connect(masterGainNode);

    osc.start(now + 0.12);
    osc.stop(now + 0.24);
}

