import type { RoomConfig, Seat, ServerEvent, ServerEventName } from "@pokemon-minigames/shared";
import type { RoundRecord } from "../../src/game/engine/types.js";
import type { Broadcaster, Clock, FinishInput, GameRepository, Scheduler } from "../../src/game/ports.js";

type Payload<N extends ServerEventName> = Extract<ServerEvent, { name: N }>["payload"];

/** Reloj y planificador simulados: el tiempo solo avanza con `advance`. */
export class FakeTime implements Clock, Scheduler {
  private current: number;
  private sequence = 0;
  private tasks: { id: number; at: number; fn: () => void }[] = [];

  constructor(start = 1_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  schedule(delayMs: number, fn: () => void): () => void {
    const task = { id: this.sequence++, at: this.current + delayMs, fn };
    this.tasks.push(task);
    return () => {
      this.tasks = this.tasks.filter((t) => t !== task);
    };
  }

  get pendingCount(): number {
    return this.tasks.length;
  }

  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.tasks.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((t) => t !== due);
      this.current = due.at;
      due.fn();
    }
    this.current = target;
  }
}

export interface SentEvent {
  code: string;
  to: Seat | "all";
  event: ServerEvent;
}

/** Difusor que solo graba lo que se envía. */
export class RecordingBroadcaster implements Broadcaster {
  sent: SentEvent[] = [];

  toSeat(code: string, seat: Seat, event: ServerEvent): void {
    this.sent.push({ code, to: seat, event });
  }

  toAll(code: string, event: ServerEvent): void {
    this.sent.push({ code, to: "all", event });
  }

  payloads<N extends ServerEventName>(name: N, to?: Seat): Payload<N>[] {
    return this.sent
      .filter((s) => s.event.name === name && (to === undefined || s.to === to || s.to === "all"))
      .map((s) => s.event.payload as Payload<N>);
  }

  last<N extends ServerEventName>(name: N, to?: Seat): Payload<N> | undefined {
    return this.payloads(name, to).at(-1);
  }
}

/** Repositorio en memoria con fallos y lentitud inyectables. */
export class FakeRepository implements GameRepository {
  /** Operaciones ejecutadas con éxito, en orden, p. ej. "saveRound:1" o "finish:completed". */
  calls: string[] = [];
  /** Inicio y fin de cada operación, para comprobar que no se solapan. */
  timeline: string[] = [];
  /** Cuántas veces debe fallar cada operación antes de funcionar. */
  failures: Record<string, number> = {};
  /** Retraso artificial en ms de cada operación. */
  delays: Record<string, number> = {};
  rounds: RoundRecord[] = [];
  finishInput: FinishInput | null = null;
  abandonCalls = 0;
  private nextId = 1;

  private async run(name: string, label: string, action: () => void): Promise<void> {
    this.timeline.push(`${name}:start`);
    if (this.delays[name]) await new Promise((resolve) => setTimeout(resolve, this.delays[name]));
    if ((this.failures[name] ?? 0) > 0) {
      this.failures[name]!--;
      this.timeline.push(`${name}:fail`);
      throw new Error(`fallo simulado en ${name}`);
    }
    action();
    this.calls.push(label);
    this.timeline.push(`${name}:end`);
  }

  async createGame(_input: { roomCode: string; config: RoomConfig; creatorUserId: string }): Promise<string> {
    await this.run("createGame", "createGame", () => {});
    return `game-${this.nextId++}`;
  }

  addSecondPlayer(_gameId: string, userId: string): Promise<void> {
    return this.run("addSecondPlayer", `addSecondPlayer:${userId}`, () => {});
  }

  removeSecondPlayer(_gameId: string): Promise<void> {
    return this.run("removeSecondPlayer", "removeSecondPlayer", () => {});
  }

  markStarted(_gameId: string): Promise<void> {
    return this.run("markStarted", "markStarted", () => {});
  }

  saveRound(_gameId: string, round: RoundRecord): Promise<void> {
    return this.run("saveRound", `saveRound:${round.number}`, () => {
      this.rounds.push(round);
    });
  }

  finish(_gameId: string, input: FinishInput): Promise<void> {
    return this.run("finish", `finish:${input.status}`, () => {
      this.finishInput = input;
    });
  }

  async abandonUnfinished(): Promise<number> {
    this.abandonCalls++;
    return 0;
  }
}
