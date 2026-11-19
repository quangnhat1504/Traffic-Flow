/**
 * TrafficFlow Master Audio Engine (Studio DSP & Haptic Foley v2.0)
 * =================================================================
 * Generates custom 44.1kHz 16-bit Stereo PCM soundtrack with:
 * - 38Hz Sub-Bass Drops on Act transitions
 * - 125 BPM Electronic Pulse & Kick
 * - Haptic Mechanical Switch Clicks for UI clicks
 * - Counting Gate Event Pings
 * - 4-Pole Moog 24dB/octave Analog Filter
 * - True Peak Normalization at -2.0 dBFS (Zero Distortion)
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const CHANNELS = 2;

class MoogFilter {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.y1 = 0; this.y2 = 0; this.y3 = 0; this.y4 = 0;
    this.oldx = 0; this.oldy1 = 0; this.oldy2 = 0; this.oldy3 = 0;
  }

  process(sample, cutoffHz, resonance = 0.25) {
    const f = (2.0 * cutoffHz) / this.sampleRate;
    const k = 3.6 * f - 1.6 * f * f - 1.0;
    const p = (k + 1.0) * 0.5;
    const scale = Math.exp((1.0 - p) * 1.386249);
    const r = resonance * scale;

    const x = sample - r * this.y4;
    this.y1 = x * p + this.oldx * p - k * this.y1;
    this.y2 = this.y1 * p + this.oldy1 * p - k * this.y2;
    this.y3 = this.y2 * p + this.oldy2 * p - k * this.y3;
    this.y4 = this.y3 * p + this.oldy3 * p - k * this.y4;

    this.oldx = x;
    this.oldy1 = this.y1;
    this.oldy2 = this.y2;
    this.oldy3 = this.y3;

    return this.y4;
  }
}

function createWavHeader(dataLength, sampleRate = 44100, numChannels = 2) {
  const buffer = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

class AudioEngine {
  constructor(durationSeconds, bpm = 125) {
    this.duration = durationSeconds;
    this.bpm = bpm;
    this.totalSamples = Math.floor(this.duration * SAMPLE_RATE);
    this.leftChannel = new Float32Array(this.totalSamples);
    this.rightChannel = new Float32Array(this.totalSamples);
    this.duckingEnvelope = new Float32Array(this.totalSamples).fill(1.0);
    this.moogL = new MoogFilter(SAMPLE_RATE);
    this.moogR = new MoogFilter(SAMPLE_RATE);
  }

  secondToSample(sec) {
    return Math.floor(sec * SAMPLE_RATE);
  }

  beatToSecond(beat) {
    return beat * (60 / this.bpm);
  }

  // 1. Visceral 38Hz Sub-Bass Drop
  addSubDrop(timeSec, gain = 0.85, decaySec = 2.4) {
    const startSample = this.secondToSample(timeSec);
    const dropLength = Math.min(this.secondToSample(decaySec), this.totalSamples - startSample);

    for (let i = 0; i < dropLength; i++) {
      const t = i / SAMPLE_RATE;
      const progress = i / dropLength;
      // Quadratic frequency glide: 90Hz -> 38Hz -> 28Hz
      const freq = 28 + (90 - 28) * Math.pow(1.0 - progress, 2.2);
      const phase = 2 * Math.PI * freq * t;
      const env = Math.exp(-progress * 3.8);
      const sample = Math.sin(phase) * gain * env;

      const idx = startSample + i;
      this.leftChannel[idx] += sample;
      this.rightChannel[idx] += sample;

      // Duck background
      const duck = 0.25 + 0.75 * progress;
      if (duck < this.duckingEnvelope[idx]) {
        this.duckingEnvelope[idx] = duck;
      }
    }
  }

  // 2. Tactile Mechanical Click (Haptic Switch 2100Hz + 180Hz body)
  addHapticClick(timeSec, gain = 0.45) {
    const startSample = this.secondToSample(timeSec);
    const clickLength = Math.min(Math.floor(0.04 * SAMPLE_RATE), this.totalSamples - startSample);

    for (let i = 0; i < clickLength; i++) {
      const t = i / SAMPLE_RATE;
      // Sharp contact transient (2100Hz)
      const transient = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 180);
      // Wooden keycap resonance (180Hz)
      const resonance = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 60);
      const val = (transient * 0.7 + resonance * 0.3) * gain;

      const idx = startSample + i;
      this.leftChannel[idx] += val * 0.95;
      this.rightChannel[idx] += val * 1.05;
    }
  }

  // 3. Counting Gate Harmonic Ping (Stereo Shimmer)
  addGatePing(timeSec, gain = 0.4, freq = 880) {
    const startSample = this.secondToSample(timeSec);
    const pingLength = Math.min(Math.floor(0.35 * SAMPLE_RATE), this.totalSamples - startSample);

    for (let i = 0; i < pingLength; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t * 9.0);
      // Fundamental + 2nd Harmonic
      const val = (Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3) * env * gain;

      const idx = startSample + i;
      this.leftChannel[idx] += val * 0.85;
      this.rightChannel[idx] += val * 1.15;
    }
  }

  // 4. Electronic Beat & Synth Bass (125 BPM)
  buildGroove() {
    const beatInterval = 60 / this.bpm;
    const totalBeats = Math.floor(this.duration / beatInterval);

    for (let beat = 0; beat < totalBeats; beat++) {
      const time = beat * beatInterval;
      if (time > this.duration - 2.5) break;

      // Kick on every 1st & 3rd beat after 5.0s
      if (time >= 5.0 && beat % 2 === 0) {
        this.addKick(time, 0.65);
      }

      // Snare/Clap on every 2nd & 4th beat in Act 3 (25s - 50s)
      if (time >= 25.0 && time < 55.0 && beat % 2 === 1) {
        this.addSnare(time, 0.4);
      }

      // Ambient Bass pulse on every beat
      if (time >= 5.0 && time < this.duration - 3.0) {
        const rootFreq = beat % 8 < 4 ? 55 : 65.4; // A1 to C2
        this.addBassPulse(time, 0.35, rootFreq, beatInterval * 0.8);
      }

      // Shimmer Hi-hat on 8th notes
      if (time >= 15.0 && time < 65.0) {
        this.addHiHat(time + beatInterval * 0.5, 0.15);
      }
    }
  }

  addKick(timeSec, gain = 0.7) {
    const start = this.secondToSample(timeSec);
    const len = Math.min(Math.floor(0.22 * SAMPLE_RATE), this.totalSamples - start);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const f = 45 + 110 * Math.exp(-t * 28);
      const val = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 12) * gain;
      this.leftChannel[start + i] += val;
      this.rightChannel[start + i] += val;
    }
  }

  addSnare(timeSec, gain = 0.4) {
    const start = this.secondToSample(timeSec);
    const len = Math.min(Math.floor(0.18 * SAMPLE_RATE), this.totalSamples - start);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 20);
      const body = Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t * 16);
      const val = (noise * 0.7 + body * 0.3) * gain;
      this.leftChannel[start + i] += val;
      this.rightChannel[start + i] += val;
    }
  }

  addBassPulse(timeSec, gain, freq, durationSec) {
    const start = this.secondToSample(timeSec);
    const len = Math.min(Math.floor(durationSec * SAMPLE_RATE), this.totalSamples - start);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin((Math.PI * i) / len);
      // Soft saturation on bass
      const wave = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
      const val = Math.tanh(wave) * env * gain;
      this.leftChannel[start + i] += val;
      this.rightChannel[start + i] += val;
    }
  }

  addHiHat(timeSec, gain = 0.15) {
    const start = this.secondToSample(timeSec);
    const len = Math.min(Math.floor(0.04 * SAMPLE_RATE), this.totalSamples - start);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 80);
      const val = noise * gain;
      this.leftChannel[start + i] += val * 0.9;
      this.rightChannel[start + i] += val * 1.1;
    }
  }

  exportWav(outputPath) {
    console.log('[*] Processing DSP Filter & Normalization...');
    // Apply Moog Warmth & Ducking
    for (let i = 0; i < this.totalSamples; i++) {
      const duck = this.duckingEnvelope[i];
      let l = this.moogL.process(this.leftChannel[i] * duck, 12000, 0.15);
      let r = this.moogR.process(this.rightChannel[i] * duck, 12000, 0.15);

      // Analog Tape Saturation (Soft clipping prevention)
      l = Math.tanh(l);
      r = Math.tanh(r);

      this.leftChannel[i] = l;
      this.rightChannel[i] = r;
    }

    // Measure Peak
    let maxPeak = 0.0;
    for (let i = 0; i < this.totalSamples; i++) {
      const l = Math.abs(this.leftChannel[i]);
      const r = Math.abs(this.rightChannel[i]);
      if (l > maxPeak) maxPeak = l;
      if (r > maxPeak) maxPeak = r;
    }

    // Strict -2.0 dBFS normalization (0.794)
    const targetPeak = 0.7943;
    const scale = maxPeak > 0.001 ? targetPeak / maxPeak : 1.0;
    console.log(`[*] Peak Measured: ${maxPeak.toFixed(4)} | Normalization Scale: ${scale.toFixed(4)} (-2.0 dBFS)`);

    const pcmData = Buffer.alloc(this.totalSamples * 4);
    for (let i = 0; i < this.totalSamples; i++) {
      let l = Math.max(-1.0, Math.min(1.0, this.leftChannel[i] * scale));
      let r = Math.max(-1.0, Math.min(1.0, this.rightChannel[i] * scale));

      const intL = l < 0 ? Math.floor(l * 32768) : Math.floor(l * 32767);
      const intR = r < 0 ? Math.floor(r * 32768) : Math.floor(r * 32767);

      pcmData.writeInt16LE(intL, i * 4);
      pcmData.writeInt16LE(intR, i * 4 + 2);
    }

    const header = createWavHeader(pcmData.length, SAMPLE_RATE, CHANNELS);
    fs.writeFileSync(outputPath, Buffer.concat([header, pcmData]));
    console.log(`[+] Master Audio Rendered: ${outputPath} (${(pcmData.length / 1024 / 1024).toFixed(2)} MB)`);
  }
}

// Generate Soundtrack for 80 seconds showcase
const durationSec = 80;
const engine = new AudioEngine(durationSec, 125);

// Add Act Sub-Drops
engine.addSubDrop(0.0, 0.95, 2.6);   // Act 1 Hook
engine.addSubDrop(5.0, 0.8, 1.8);    // Act 2 Ingest Transition
engine.addSubDrop(25.0, 0.85, 2.0);  // Act 3 Velocity Blitz
engine.addSubDrop(50.0, 0.75, 1.8);  // Act 4 Multi-view Scale
engine.addSubDrop(70.0, 0.8, 2.2);   // Act 5 Hero Lockup

// Build 125 BPM Electronic Rhythm
engine.buildGroove();

// Add UI Haptic Foley Clicks (Simulating user canvas interactions & buttons)
const clickMoments = [
  6.2, 7.5, 9.0, 11.2, 13.0, 14.8, 17.5, 19.2, 22.0, 24.8, // Act 2 Canvas snapping
  26.0, 28.5, 31.0, 34.2, 38.0, 42.5, 47.0,                 // Act 3 Mode switching
  52.0, 56.5, 61.0, 66.2, 71.5                              // Act 4 & 5 Controls
];
clickMoments.forEach((t) => engine.addHapticClick(t, 0.45));

// Add Counting Gate Pings in Act 3 (Crossing events)
const countMoments = [27.0, 29.2, 32.1, 35.5, 37.8, 40.2, 43.6, 46.1, 48.9];
countMoments.forEach((t, i) => engine.addGatePing(t, 0.38, 784 + (i % 4) * 110));

const outWav = path.join(__dirname, 'showcase_audio.wav');
engine.exportWav(outWav);
