import type { WeatherType } from './types';

export class WorldAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private acousticFilter: BiquadFilterNode | null = null;
  private oceanGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private trafficGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private volume = 0.65;
  private muted = false;
  private initialized = false;
  private nextChirpTime = 0;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      // Outdoor-to-indoor acoustic attenuation filter for ambient environmental beds
      this.acousticFilter = this.ctx.createBiquadFilter();
      this.acousticFilter.type = 'lowpass';
      this.acousticFilter.frequency.value = 18000;
      this.acousticFilter.connect(this.masterGain);

      // Filtered brown/pink noise buffer for ocean surf, wind & rain ambience
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = data[i];
      }

      // Ocean waves bed
      const oceanSrc = this.ctx.createBufferSource();
      oceanSrc.buffer = noiseBuffer;
      oceanSrc.loop = true;
      const oceanFilter = this.ctx.createBiquadFilter();
      oceanFilter.type = 'lowpass';
      oceanFilter.frequency.value = 340;
      this.oceanGain = this.ctx.createGain();
      this.oceanGain.gain.value = 0.08;
      oceanSrc.connect(oceanFilter);
      oceanFilter.connect(this.oceanGain);
      this.oceanGain.connect(this.acousticFilter);
      oceanSrc.start();

      // Wind through trees bed
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 460;
      this.windFilter.Q.value = 1.1;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.04;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.acousticFilter);
      windSrc.start();

      // Rain bed (outdoor patter vs indoor muffled roof/window patter)
      const rainSrc = this.ctx.createBufferSource();
      rainSrc.buffer = noiseBuffer;
      rainSrc.loop = true;
      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'bandpass';
      this.rainFilter.frequency.value = 1800;
      this.rainFilter.Q.value = 0.6;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      rainSrc.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.masterGain);
      rainSrc.start();

      // Distant town road traffic ambience
      const trafficSrc = this.ctx.createBufferSource();
      trafficSrc.buffer = noiseBuffer;
      trafficSrc.loop = true;
      const trafficFilter = this.ctx.createBiquadFilter();
      trafficFilter.type = 'lowpass';
      trafficFilter.frequency.value = 190;
      this.trafficGain = this.ctx.createGain();
      this.trafficGain.gain.value = 0.015;
      trafficSrc.connect(trafficFilter);
      trafficFilter.connect(this.trafficGain);
      this.trafficGain.connect(this.acousticFilter);
      trafficSrc.start();

      // Vehicle engine hum (muted when not driving)
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engFilter = this.ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 210;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engFilter);
      engFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();

      this.initialized = true;
    } catch {
      // AudioContext unavailable in restricted environments
    }
  }

  public setVolume(vol: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public updateAmbience(
    nowSec: number,
    distToShore: number,
    weather: WeatherType,
    isNight: boolean,
    isDriving: boolean,
    carSpeed: number,
    paused: boolean,
    windStrength: number,
    isIndoors: boolean,
    distToRoad: number,
  ): void {
    if (!this.initialized || !this.ctx) return;
    const t = this.ctx.currentTime;

    if (paused) {
      this.oceanGain?.gain.setTargetAtTime(0, t, 0.08);
      this.rainGain?.gain.setTargetAtTime(0, t, 0.08);
      this.windGain?.gain.setTargetAtTime(0, t, 0.08);
      this.trafficGain?.gain.setTargetAtTime(0, t, 0.08);
      this.engineGain?.gain.setTargetAtTime(0, t, 0.08);
      return;
    }

    // Smooth indoor vs outdoor acoustic cutoff
    this.acousticFilter?.frequency.setTargetAtTime(isIndoors ? 620 : 18000, t, 0.16);

    const shoreFactor = Math.max(0.12, 1 - Math.min(distToShore, 70) / 70);
    const wavePulse = 0.75 + 0.25 * Math.sin(nowSec * 0.65);
    this.oceanGain?.gain.setTargetAtTime(0.14 * shoreFactor * wavePulse, t, 0.2);

    // Wind swells naturally with weather
    const windSwirl = 0.72 + 0.28 * Math.sin(nowSec * 0.42 + 1.1);
    const windBase = 0.035 * windStrength * windSwirl;
    this.windGain?.gain.setTargetAtTime(windBase, t, 0.28);
    this.windFilter?.frequency.setTargetAtTime(340 + windStrength * 165, t, 0.3);

    // Distant road traffic ambience near town roads
    const roadProx = Math.max(0.08, 1 - Math.min(distToRoad, 55) / 55);
    this.trafficGain?.gain.setTargetAtTime(0.032 * roadProx * (isNight ? 0.55 : 1.0), t, 0.25);

    const targetRain =
      weather === 'thunderstorm' ? 0.28 : weather === 'rain' ? 0.18 : 0;
    this.rainGain?.gain.setTargetAtTime(isIndoors ? targetRain * 0.48 : targetRain, t, 0.35);
    this.rainFilter?.frequency.setTargetAtTime(isIndoors ? 880 : 1800, t, 0.2);

    if (isDriving && this.engineOsc && this.engineGain) {
      const speedNorm = Math.min(1, Math.abs(carSpeed) / 22);
      this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 95, t, 0.06);
      this.engineGain.gain.setTargetAtTime(0.055 + speedNorm * 0.045, t, 0.08);
    } else if (this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.08);
    }

    // Occasional distant bird chirp during clear/cloudy daytime outdoors
    if (
      !isNight &&
      !isIndoors &&
      (weather === 'clear' || weather === 'cloudy' || weather === 'foggy') &&
      nowSec > this.nextChirpTime
    ) {
      this.nextChirpTime = nowSec + 4.5 + Math.random() * 6;
      this.playBirdChirp();
    }
  }

  private playBirdChirp(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = 2200 + Math.random() * 800;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.92, t + 0.13);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.028, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playFootstep(
    surface: 'stone' | 'grass' | 'wood' | 'sand' | 'wet',
    isIndoors = false,
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pitchVar = 0.92 + Math.random() * 0.16;
    const baseFreq =
      surface === 'stone'
        ? 170
        : surface === 'wood'
          ? 135
          : surface === 'sand'
            ? 95
            : surface === 'wet'
              ? 240
              : 110;
    osc.type = surface === 'stone' || surface === 'wood' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq * pitchVar, t);
    osc.frequency.exponentialRampToValueAtTime(surface === 'wet' ? 68 : 42, t + 0.065);
    gain.gain.setValueAtTime(surface === 'wet' ? 0.075 : 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.085);

    // Subtle interior echo tap when walking inside wooden buildings
    if (isIndoors) {
      const echoOsc = this.ctx.createOscillator();
      const echoGain = this.ctx.createGain();
      echoOsc.type = 'triangle';
      echoOsc.frequency.setValueAtTime(baseFreq * 0.85 * pitchVar, t + 0.08);
      echoOsc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      echoGain.gain.setValueAtTime(0.018, t + 0.08);
      echoGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.15);
      echoOsc.connect(echoGain);
      echoGain.connect(this.masterGain);
      echoOsc.start(t + 0.08);
      echoOsc.stop(t + 0.155);
    }
  }

  public playJump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playLand(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playInteract(kind: 'door' | 'chime' | 'ui' | 'thunder'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    if (kind === 'thunder') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(75, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 1.1);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.3);
      return;
    }
    if (kind === 'chime') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0.07, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.38);
      });
      return;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = kind === 'door' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'door' ? 220 : 440, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'door' ? 140 : 580, t + 0.09);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public dispose(): void {
    try {
      this.engineOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
  }
}
