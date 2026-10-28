/** Dobles del audio del navegador para las pruebas del sonido. */

/** Un `HTMLAudioElement` de mentira: registra qué se pidió y deja decidir si `play()` lo bloquea el navegador. */
export class FakeAudio {
  static created: FakeAudio[] = [];
  /** Si es true, `play()` se rechaza como cuando el navegador aún no deja sonar nada. */
  static blocked = false;
  src: string;
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  private endedListeners: (() => void)[] = [];

  constructor(src = "") {
    this.src = src;
    FakeAudio.created.push(this);
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (FakeAudio.blocked) return Promise.reject(new DOMException("bloqueado", "NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "ended") this.endedListeners.push(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === "ended") this.endedListeners = this.endedListeners.filter((l) => l !== listener);
  }

  /** Simula que el tema terminó. */
  end(): void {
    this.paused = true;
    for (const listener of [...this.endedListeners]) listener();
  }

  static reset(): void {
    FakeAudio.created = [];
    FakeAudio.blocked = false;
  }

  /** Los que están sonando ahora. */
  static playing(): FakeAudio[] {
    return FakeAudio.created.filter((a) => !a.paused);
  }
}

/** Un `AudioContext` de mentira: suficiente para que el sintetizador cree y conecte nodos sin un navegador. */
export class FakeAudioContext {
  static created: FakeAudioContext[] = [];
  currentTime = 0;
  sampleRate = 44_100;
  state: "suspended" | "running" = "suspended";
  destination = { connect: () => {} };
  oscillators = 0;
  resumes = 0;

  constructor() {
    FakeAudioContext.created.push(this);
  }

  private node() {
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node: Record<string, unknown> = {
      gain: param(),
      frequency: param(),
      delayTime: param(),
      Q: param(),
      type: "",
      buffer: null,
      connect: (target: unknown) => target,
      disconnect() {},
      start() {},
      stop() {},
      setPeriodicWave() {},
    };
    return node;
  }

  createOscillator() {
    this.oscillators += 1;
    return this.node();
  }
  createGain() {
    return this.node();
  }
  createDelay() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createPeriodicWave() {
    return {};
  }
  resume() {
    this.resumes += 1;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }

  static reset(): void {
    FakeAudioContext.created = [];
  }
}

/** Un `document` mínimo: visibilidad y oyentes de eventos. */
export function fakeDocument() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** Temporizadores manuales: `advance(ms)` dispara los vencidos. */
export function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: number) => void pending.delete(id),
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
  };
}
