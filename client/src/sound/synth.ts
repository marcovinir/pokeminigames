import type { SoundEffect } from "./cues";

/**
 * Los efectos de 8 bits, generados al momento con Web Audio (no son archivos). Son los que eligió Marco en la playlist:
 * acierto y fallo de la «versión anterior» (una onda cuadrada sencilla) y el resto de la «versión nueva» (pulsos con el
 * timbre de la Game Boy, bajo triangular, percusión de ruido y un eco corto). Referencia:
 * docs/superpowers/specs/2026-10-28-musica-y-sonido-efectos.js
 */
export interface Synth {
  play(effect: SoundEffect, volume: number): void;
}

/** Frecuencia de una nota por su número MIDI (60 = do central). */
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export function createSynth(ctx: AudioContext): Synth {
  // Salida común (el volumen de los efectos) con un eco corto y suave en paralelo que da brillo a los efectos nuevos.
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.11;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const echo = ctx.createGain();
  echo.gain.value = 0.35;
  echo.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(out);

  /** Las ondas de pulso de la Game Boy (12,5 %, 25 % y 50 % de ciclo), creadas una vez cada una. */
  const pulses = new Map<number, PeriodicWave>();
  const pulse = (duty: number): PeriodicWave => {
    let wave = pulses.get(duty);
    if (!wave) {
      const n = 64;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      wave = ctx.createPeriodicWave(real, imag);
      pulses.set(duty, wave);
    }
    return wave;
  };

  interface ToneOptions {
    duty?: number;
    type?: OscillatorType;
    volume?: number;
    slideTo?: number;
    vibrato?: number;
    wet?: boolean;
  }
  /** Una nota con envolvente, y deslizamiento, vibrato y eco opcionales. */
  const tone = (freq: number, at: number, length: number, { duty = 0.25, type, volume = 0.1, slideTo, vibrato = 0, wet = true }: ToneOptions = {}) => {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    if (type) osc.type = type;
    else osc.setPeriodicWave(pulse(duty));
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = freq * vibrato;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t + length * 0.3);
      lfo.stop(t + length);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    gain.gain.setValueAtTime(volume, t + length * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain);
    gain.connect(out);
    if (wet) gain.connect(echo);
    osc.start(t);
    osc.stop(t + length + 0.05);
  };

  /** La onda cuadrada sencilla de los efectos de la «versión anterior» (acierto y fallo). */
  const square = (freq: number, at: number, length: number, { volume = 0.12, slideTo }: { volume?: number; slideTo?: number } = {}) => {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t + length);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.setValueAtTime(volume, t + length * 0.7);
    gain.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  };

  /** Un golpe de ruido filtrado: la percusión de la Game Boy (caja, charles o soplido). */
  const noise = (at: number, length: number, { volume = 0.08, filter = 3000, q = 0.8, sweepTo }: { volume?: number; filter?: number; q?: number; sweepTo?: number } = {}) => {
    const t = ctx.currentTime + at;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(filter, t);
    band.Q.value = q;
    if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(band);
    band.connect(gain);
    gain.connect(out);
    src.start(t);
  };

  const EFFECTS: Record<SoundEffect, () => void> = {
    // Versión anterior: dos notas que suben (B5 → E6).
    correct: () => {
      square(987.8, 0, 0.08);
      square(1318.5, 0.08, 0.22);
    },
    // Versión anterior: dos notas graves que caen.
    wrong: () => {
      square(196, 0, 0.14, { volume: 0.1 });
      square(138.6, 0.15, 0.3, { volume: 0.1, slideTo: 120 });
    },
    win: () => {
      const lead: [number, number, number][] = [[67, 0, 0.11], [67, 0.12, 0.11], [67, 0.24, 0.11], [72, 0.36, 0.7]];
      for (const [m, at, l] of lead) tone(hz(m), at, l, { duty: 0.25, volume: 0.09, vibrato: l > 0.5 ? 0.012 : 0 });
      for (const [m, at, l] of lead) tone(hz(m - 5), at, l, { duty: 0.5, volume: 0.04 });
      for (const [m, at, l] of [[48, 0, 0.12], [43, 0.12, 0.12], [48, 0.24, 0.12], [36, 0.36, 0.7]] as const) {
        tone(hz(m), at, l, { type: "triangle", volume: 0.16, wet: false });
      }
      for (const at of [0, 0.12, 0.24]) noise(at, 0.05, { volume: 0.05, filter: 7000 });
      noise(0.36, 0.25, { volume: 0.07, filter: 2500 });
      [79, 84, 88, 91].forEach((m, i) => tone(hz(m), 0.6 + i * 0.05, 0.1, { duty: 0.125, volume: 0.04 }));
    },
    lose: () => {
      for (const [m, at, l] of [[64, 0, 0.22], [63, 0.24, 0.22], [62, 0.48, 0.22], [61, 0.72, 0.7]] as const) {
        tone(hz(m), at, l, { duty: 0.5, volume: 0.08, vibrato: l > 0.5 ? 0.02 : 0 });
      }
      tone(hz(37), 0, 1.4, { type: "triangle", volume: 0.12, wet: false });
    },
    round: () => {
      tone(hz(69), 0, 0.09, { duty: 0.5, volume: 0.08 });
      tone(hz(69), 0.16, 0.09, { duty: 0.5, volume: 0.08 });
      tone(hz(81), 0.32, 0.32, { duty: 0.25, volume: 0.1, vibrato: 0.008 });
      tone(hz(57), 0.32, 0.32, { type: "triangle", volume: 0.14, wet: false });
      noise(0.3, 0.35, { volume: 0.05, filter: 1500, sweepTo: 9000, q: 0.6 });
    },
    tick: () => {
      [0, 0.42, 0.78, 1.08, 1.32].forEach((at, i) => {
        tone(hz(i % 2 ? 76 : 81), at, 0.06, { duty: 0.125, volume: 0.07, wet: false });
        noise(at, 0.03, { volume: 0.05, filter: 5000, q: 2 });
      });
    },
    click: () => tone(hz(84), 0, 0.05, { duty: 0.5, volume: 0.06, slideTo: hz(72), wet: false }),
    reveal: () => {
      noise(0, 0.4, { volume: 0.05, filter: 800, sweepTo: 8000, q: 0.7 });
      [72, 76, 79, 84].forEach((m, i) => tone(hz(m), 0.3 + i * 0.06, 0.14, { duty: 0.25, volume: 0.08 }));
      tone(hz(88), 0.55, 0.5, { duty: 0.125, volume: 0.06, vibrato: 0.012 });
    },
    rival: () => {
      tone(hz(74), 0, 0.06, { duty: 0.25, volume: 0.06, wet: false });
      tone(hz(79), 0.08, 0.1, { duty: 0.25, volume: 0.06, wet: false });
    },
  };

  return {
    play(effect, volume) {
      // Los sonidos de referencia están mezclados a volumen 0,9; el ajuste de efectos lo escala.
      out.gain.value = 0.9 * volume;
      EFFECTS[effect]();
    },
  };
}
