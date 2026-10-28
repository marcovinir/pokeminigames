// Referencia: los efectos de la playlist que eligió Marco (los de la versión anterior y los nuevos).
// Elegidos: acierto y fallo de OLD_SFX; ganar, perder, ronda, últimos segundos, botón, revelado y rival de NEW_SFX.
// ——— Sintetizador de 8 bits ———
  let ctx, out, echo;
  /** El contexto de audio, con un eco corto y suave en paralelo que da brillo a los efectos nuevos. */
  function audio() {
    if (ctx) return ctx;
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.11;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    echo = ctx.createGain();
    echo.gain.value = 0.35;
    echo.connect(delay).connect(feedback).connect(delay);
    delay.connect(out);
    return ctx;
  }
  /** Las ondas de pulso de la Game Boy: 12,5 %, 25 % y 50 % de ciclo. */
  const pulses = {};
  function pulse(duty) {
    if (pulses[duty]) return pulses[duty];
    const n = 64, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return (pulses[duty] = audio().createPeriodicWave(real, imag));
  }
  /** Una nota: onda de pulso (o triangular), con envolvente, deslizamiento y vibrato opcionales. */
  function tone(freq, at, length, { duty = 0.25, type, volume = 0.1, slideTo, vibrato = 0, wet = true } = {}) {
    const a = audio();
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    if (type) osc.type = type; else osc.setPeriodicWave(pulse(duty));
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    if (vibrato) {
      const lfo = a.createOscillator(), depth = a.createGain();
      lfo.frequency.value = 6; depth.gain.value = freq * vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t + length * 0.3); lfo.stop(t + length);
    }
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    gain.gain.setValueAtTime(volume, t + length * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(out);
    if (wet) gain.connect(echo);
    osc.start(t); osc.stop(t + length + 0.05);
  }
  /** Un golpe de ruido (la percusión de la Game Boy), filtrado para que suene a caja, a charles o a soplido. */
  function noise(at, length, { volume = 0.08, filter = 3000, q = 0.8, sweepTo } = {}) {
    const a = audio();
    const t = a.currentTime + at;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buffer;
    const bp = a.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.setValueAtTime(filter, t); bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + length);
    const gain = a.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(bp).connect(gain).connect(out);
    src.start(t);
  }
  /** Frecuencia de una nota por su número MIDI (60 = do central). */
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);

  const NEW_SFX = [
    ["correct", "Acierto", "arpegio brillante", () => {
      [76, 80, 83, 88].forEach((m, i) => tone(hz(m), i * 0.045, 0.12, { duty: 0.25, volume: 0.09 }));
      tone(hz(95), 0.18, 0.28, { duty: 0.125, volume: 0.06, vibrato: 0.01 });
      tone(hz(52), 0, 0.3, { type: "triangle", volume: 0.14, wet: false });
    }],
    ["wrong", "Fallo", "«buom» que cae", () => {
      tone(hz(58), 0, 0.38, { duty: 0.125, volume: 0.1, slideTo: hz(41) });
      tone(hz(57.4), 0.01, 0.38, { duty: 0.5, volume: 0.05, slideTo: hz(40) });
      noise(0, 0.12, { volume: 0.06, filter: 600, q: 1.2 });
    }],
    ["win", "Ganar la partida", "fanfarria con batería", () => {
      const lead = [[67, 0, 0.11], [67, 0.12, 0.11], [67, 0.24, 0.11], [72, 0.36, 0.7]];
      lead.forEach(([m, at, l]) => tone(hz(m), at, l, { duty: 0.25, volume: 0.09, vibrato: l > 0.5 ? 0.012 : 0 }));
      lead.forEach(([m, at, l]) => tone(hz(m - 5), at, l, { duty: 0.5, volume: 0.04 }));
      [[48, 0, 0.12], [43, 0.12, 0.12], [48, 0.24, 0.12], [36, 0.36, 0.7]].forEach(([m, at, l]) => tone(hz(m), at, l, { type: "triangle", volume: 0.16, wet: false }));
      [0, 0.12, 0.24].forEach((at) => noise(at, 0.05, { volume: 0.05, filter: 7000 }));
      noise(0.36, 0.25, { volume: 0.07, filter: 2500 });
      [79, 84, 88, 91].forEach((m, i) => tone(hz(m), 0.6 + i * 0.05, 0.1, { duty: 0.125, volume: 0.04 }));
    }],
    ["lose", "Perder la partida", "bajada triste", () => {
      [[64, 0, 0.22], [63, 0.24, 0.22], [62, 0.48, 0.22], [61, 0.72, 0.7]].forEach(([m, at, l]) => tone(hz(m), at, l, { duty: 0.5, volume: 0.08, vibrato: l > 0.5 ? 0.02 : 0 }));
      tone(hz(37), 0, 1.4, { type: "triangle", volume: 0.12, wet: false });
    }],
    ["round", "Empieza la ronda", "¡listos, ya!", () => {
      tone(hz(69), 0, 0.09, { duty: 0.5, volume: 0.08 });
      tone(hz(69), 0.16, 0.09, { duty: 0.5, volume: 0.08 });
      tone(hz(81), 0.32, 0.32, { duty: 0.25, volume: 0.1, vibrato: 0.008 });
      tone(hz(57), 0.32, 0.32, { type: "triangle", volume: 0.14, wet: false });
      noise(0.3, 0.35, { volume: 0.05, filter: 1500, sweepTo: 9000, q: 0.6 });
    }],
    ["tick", "Últimos segundos", "latido que acelera", () => {
      [0, 0.42, 0.78, 1.08, 1.32].forEach((at, i) => {
        tone(hz(i % 2 ? 76 : 81), at, 0.06, { duty: 0.125, volume: 0.07, wet: false });
        noise(at, 0.03, { volume: 0.05, filter: 5000, q: 2 });
      });
    }],
    ["click", "Botón o menú", "«pop» suave", () => {
      tone(hz(84), 0, 0.05, { duty: 0.5, volume: 0.06, slideTo: hz(72), wet: false });
    }],
    ["reveal", "Pokémon revelado", "nuevo: la silueta", () => {
      noise(0, 0.4, { volume: 0.05, filter: 800, sweepTo: 8000, q: 0.7 });
      [72, 76, 79, 84].forEach((m, i) => tone(hz(m), 0.3 + i * 0.06, 0.14, { duty: 0.25, volume: 0.08 }));
      tone(hz(88), 0.55, 0.5, { duty: 0.125, volume: 0.06, vibrato: 0.012 });
    }],
    ["rival", "El rival respondió", "nuevo: aviso corto", () => {
      tone(hz(74), 0, 0.06, { duty: 0.25, volume: 0.06, wet: false });
      tone(hz(79), 0.08, 0.1, { duty: 0.25, volume: 0.06, wet: false });
    }],
  ];

  // La versión anterior, para comparar: una sola onda cuadrada, sin eco ni percusión.
  function square(freq, at, length, { type = "square", volume = 0.12, slideTo } = {}) {
    const a = audio();
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t + length);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.setValueAtTime(volume, t + length * 0.7);
    gain.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(gain).connect(out);
    osc.start(t); osc.stop(t + length + 0.02);
  }
  const N = { C4: 261.6, E4: 329.6, G3: 196, Cs3: 138.6, G4: 392, A4: 440, C5: 523.3, E5: 659.3, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5 };
  const OLD_SFX = [
    ["Acierto", () => { square(N.B5, 0, 0.08); square(N.E6, 0.08, 0.22); }],
    ["Fallo", () => { square(N.G3, 0, 0.14, { volume: 0.1 }); square(N.Cs3, 0.15, 0.3, { volume: 0.1, slideTo: 120 }); }],
    ["Ganar la partida", () => {
      [[N.C5, 0, 0.12], [N.E5, 0.12, 0.12], [N.G5, 0.24, 0.12], [N.C6, 0.36, 0.5]].forEach(([f, s, l]) => square(f, s, l));
      [[N.E4, 0.36, 0.5], [N.G4, 0.36, 0.5]].forEach(([f, s, l]) => square(f, s, l, { type: "triangle", volume: 0.15 }));
    }],
    ["Perder la partida", () => { [[N.G4, 0, 0.2], [N.E4, 0.22, 0.2], [N.C4, 0.44, 0.5]].forEach(([f, s, l]) => square(f, s, l, { volume: 0.1 })); }],
    ["Empieza la ronda", () => { square(N.A4, 0, 0.1); square(N.A5, 0.12, 0.25); }],
    ["Últimos segundos", () => { [0, 0.5, 1].forEach((s) => square(N.E5, s, 0.06, { volume: 0.08 })); }],
    ["Botón o menú", () => { square(N.C6, 0, 0.04, { volume: 0.06 }); }],
  ];

  