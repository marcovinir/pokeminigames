import { describe, expect, it } from "vitest";
import { reduce } from "../../src/game/engine/engine.js";
import { Harness, START_TIME } from "./harness.js";

describe("motor: sala y conexiones", () => {
  it("una sala nueva espera al segundo jugador y caduca a los 10 minutos", () => {
    const h = new Harness();
    expect(h.state.phase).toBe("waiting");
    expect(h.state.players[1]).toMatchObject({ username: "ash", connected: false, totalStats: 0, team: [] });
    expect(h.state.players[2]).toBeUndefined();
    expect(h.pending).toEqual([{ at: START_TIME + 10 * 60 * 1000, timer: { kind: "expire" } }]);
  });

  it("una sala de revancha caduca a los 30 s y su estado lo dice; una normal sigue caducando a los 10 min y sin la clave", () => {
    const rematch = new Harness({ rematch: true });
    expect(rematch.state.rematch).toBe(true);
    expect(rematch.pending).toEqual([{ at: START_TIME + 30 * 1000, timer: { kind: "expire" } }]);

    const normal = new Harness();
    expect("rematch" in normal.state).toBe(false);
    expect(normal.pending).toEqual([{ at: START_TIME + 10 * 60 * 1000, timer: { kind: "expire" } }]);
  });

  it("si el rival no entra a la sala de revancha, a los 30 s caduca como una sala en espera (abandonada, motivo expired)", () => {
    const h = new Harness({ rematch: true });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    h.advance(29_000);
    expect(h.state.phase).toBe("waiting");
    h.advance(1_000);
    expect(h.state.phase).toBe("finished");
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
  });

  describe("PLAYER_JOINED", () => {
    it("ocupa el asiento 2, avisa al creador y pide guardar el asiento", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
      expect(h.state.players[2]).toMatchObject({ userId: "u2", username: "misty", connected: false });
      expect(h.payloads("player-joined", 1)).toEqual([{ username: "misty" }]);
      expect(h.effectsOfKind("persist_seat_taken")).toEqual([{ kind: "persist_seat_taken", userId: "u2" }]);
    });

    it("quien se une como invitado: player-joined lleva guest: true y el asiento queda marcado; una cuenta no lleva el campo", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_JOINED", userId: "guest_x", username: "inv", guest: true });
      expect(h.state.players[2]).toMatchObject({ userId: "guest_x", username: "inv", guest: true });
      expect(h.payloads("player-joined", 1)).toEqual([{ username: "inv", guest: true }]);

      const account = new Harness();
      account.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty", guest: false });
      expect("guest" in account.state.players[2]!).toBe(false);
      expect(account.payloads("player-joined", 1)).toEqual([{ username: "misty" }]);
    });

    it("un creador invitado queda marcado en el asiento 1; uno con cuenta no", () => {
      const guest = new Harness({ creator: { userId: "guest_c", username: "inv", guest: true } });
      expect(guest.state.players[1]).toMatchObject({ userId: "guest_c", username: "inv", guest: true });
      expect("guest" in new Harness().state.players[1]!).toBe(false);
    });

    it("ignora a un tercer jugador y a quien llega con la partida ya empezada", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
      h.dispatch({ type: "PLAYER_JOINED", userId: "u3", username: "brock" });
      expect(h.state.players[2]?.userId).toBe("u2");

      h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
      h.dispatch({ type: "PLAYER_JOINED", userId: "u4", username: "gary" });
      expect(h.state.players[2]?.userId).toBe("u2");
    });
  });

  describe("conexión e inicio", () => {
    it("al conectarse un jugador recibe su estado; con uno solo no empieza nada", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
      expect(h.sentState).toEqual([1]);
      expect(h.state.phase).toBe("waiting");

      h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
      expect(h.state.phase).toBe("waiting"); // el asiento 2 aún no tiene socket
    });

    it("cuando ambos están conectados empieza una cuenta atrás de 5 segundos", () => {
      const h = new Harness();
      h.seatBoth();
      expect(h.state.phase).toBe("starting");
      expect(h.last("game-starting")).toEqual({ startsAt: START_TIME + 5000, serverNow: START_TIME });
      expect(h.pending).toContainEqual({ at: START_TIME + 5000, timer: { kind: "start", startsAt: START_TIME + 5000 } });
    });

    it("al terminar la cuenta atrás se guarda el inicio y arranca la ronda 1", () => {
      const h = new Harness({ rng: [0] });
      h.startGame();
      expect(h.effectsOfKind("persist_started")).toHaveLength(1);
      expect(h.state.phase).toBe("round_active");
      expect(h.last("round-started")).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    });

    it("si alguien se desconecta durante la cuenta atrás vuelve a esperar y el temporizador viejo no hace nada", () => {
      const h = new Harness({ rng: [0] });
      h.seatBoth();
      h.advance(2000);
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
      expect(h.state.phase).toBe("waiting");
      expect(h.state.startsAt).toBeNull();

      h.advance(10_000); // el temporizador `start` original vence aquí y debe ignorarse
      expect(h.state.phase).toBe("waiting");
      expect(h.payloads("round-started")).toHaveLength(0);
      expect(h.effectsOfKind("persist_started")).toHaveLength(0);

      h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
      expect(h.state.phase).toBe("starting");
      h.advance(5000);
      expect(h.state.phase).toBe("round_active");
      expect(h.payloads("round-started")).toHaveLength(1);
    });
  });

  it("el temporizador de una cuenta atrás cancelada no adelanta la cuenta atrás nueva", () => {
    const h = new Harness({ rng: [0] });
    h.seatBoth(); // la primera cuenta atrás vence en t0 + 5 s
    h.advance(2000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(1000);
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 }); // nueva cuenta atrás: vence en t0 + 8 s

    h.advance(2500); // t0 + 5,5 s: el temporizador viejo ya venció y debe ignorarse
    expect(h.state.phase).toBe("starting");
    expect(h.payloads("round-started")).toHaveLength(0);

    h.advance(2500); // t0 + 8 s
    expect(h.state.phase).toBe("round_active");
    expect(h.payloads("round-started")).toHaveLength(1);
  });

  describe("caducidad y salida", () => {
    it("la sala en espera caduca: termina como abandonada", () => {
      const h = new Harness();
      h.advance(10 * 60 * 1000);
      expect(h.state.phase).toBe("finished");
      expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
      expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "abandoned" });
    });

    it("la caducidad no afecta a una partida que ya empezó", () => {
      const h = new Harness({ rng: [0] });
      h.startGame();
      h.advance(10 * 60 * 1000);
      expect(h.state.outcome?.reason).not.toBe("expired");
    });

    it("si el creador sale antes de empezar, la sala se cancela", () => {
      const h = new Harness();
      h.dispatch({ type: "LEAVE", seat: 1 });
      expect(h.state.phase).toBe("finished");
      expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "cancelled" });
      expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "abandoned" });
    });

    it("si quien se unió sale antes de empezar, su asiento queda libre y otro puede entrar", () => {
      const h = new Harness();
      h.seatBoth();
      h.dispatch({ type: "LEAVE", seat: 2 });
      expect(h.state.phase).toBe("waiting");
      expect(h.state.players[2]).toBeUndefined();
      expect(h.effectsOfKind("persist_seat_freed")).toHaveLength(1);
      expect(h.sentState.at(-1)).toBe(1);

      h.dispatch({ type: "PLAYER_JOINED", userId: "u3", username: "brock" });
      expect(h.state.players[2]?.username).toBe("brock");
    });
  });

  describe("la caducidad de la sala no se pierde durante la cuenta atrás", () => {
    const TTL = 10 * 60 * 1000;

    function expiredDuringCountdown(): Harness {
      const h = new Harness({ rng: [0] });
      h.advance(TTL - 2000); // 9:58
      h.seatBoth(); // cuenta atrás hasta 10:03
      h.advance(3000); // 10:01: el temporizador `expire` venció en plena cuenta atrás y se ignoró
      expect(h.state.phase).toBe("starting");
      return h;
    }

    it("si alguien se cae cuando la sala ya debió caducar, termina como caducada", () => {
      const h = expiredDuringCountdown();
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
      expect(h.state.phase).toBe("finished");
      expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
      expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "abandoned" });
    });

    it("si quien se unió sale cuando la sala ya debió caducar, también termina como caducada", () => {
      const h = expiredDuringCountdown();
      h.dispatch({ type: "LEAVE", seat: 2 });
      expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
    });

    it("si la caída ocurre antes de la hora de caducidad, la sala sigue esperando y caduca a su hora", () => {
      const h = new Harness({ rng: [0] });
      h.advance(TTL - 10_000);
      h.seatBoth();
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
      expect(h.state.phase).toBe("waiting");
      h.advance(10_000);
      expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "expired" });
    });
  });

  describe("el rival se entera de los cambios en la sala de espera", () => {
    it("al conectarse el segundo jugador, el primero también recibe el estado actualizado", () => {
      const h = new Harness({ rng: [0] });
      h.seatBoth();
      // Conecta el 1 (estado al 1 y al 2, que ya se había unido) y luego el 2 (estado al 2 y al 1, ya con la cuenta atrás).
      expect(h.sentState).toEqual([1, 2, 2, 1]);
    });

    it("al cancelarse la cuenta atrás por una caída, el rival recibe su estado y deja de esperar el inicio", () => {
      const h = new Harness({ rng: [0] });
      h.seatBoth();
      h.sentState.length = 0;
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
      expect(h.state.phase).toBe("waiting");
      expect(h.sentState).toEqual([1]);
    });

    it("una caída en la sala de espera (sin cuenta atrás) también se le comunica al otro", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
      h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
      expect(h.sentState).toEqual([2, 1]);
      h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
      expect(h.sentState).toEqual([2, 1, 1]);
    });
  });

  it("una partida terminada ignora cualquier evento posterior", () => {
    const h = new Harness();
    h.dispatch({ type: "LEAVE", seat: 1 });
    const before = h.state;
    const effects = h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(effects).toEqual([]);
    expect(h.state).toBe(before);
  });

  it("reduce es puro: no modifica el estado que recibe", () => {
    const h = new Harness({ rng: [0] });
    h.seatBoth();
    const snapshot = structuredClone(h.state);
    reduce(h.state, { type: "PLAYER_DISCONNECTED", seat: 1 }, h.now, { catalog: h.catalog, rng: h.rng });
    reduce(h.state, { type: "LEAVE", seat: 1 }, h.now, { catalog: h.catalog, rng: h.rng });
    expect(h.state).toEqual(snapshot);
  });
});

describe("motor: el avatar de cada jugador", () => {
  it("el creador y quien se une llevan su avatar a la vista y a player-joined", () => {
    const h = new Harness({ creator: { userId: "u1", username: "ash", avatarId: 94 } });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty", avatarId: 25 });
    expect(h.state.players[1]).toMatchObject({ avatarId: 94 });
    expect(h.state.players[2]).toMatchObject({ avatarId: 25 });
    expect(h.payloads("player-joined", 1)).toEqual([{ username: "misty", avatarId: 25 }]);
  });

  it("sin avatar, ni el asiento ni player-joined llevan la clave", () => {
    const h = new Harness();
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    expect("avatarId" in h.state.players[1]!).toBe(false);
    expect("avatarId" in h.state.players[2]!).toBe(false);
    expect(h.payloads("player-joined", 1)).toEqual([{ username: "misty" }]);
    expect(JSON.stringify(h.payloads("player-joined", 1))).not.toContain("avatarId");
  });
});
