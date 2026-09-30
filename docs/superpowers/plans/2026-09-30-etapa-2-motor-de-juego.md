# Pokémon Minigames — Etapa 2: Motor de juego Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos jugadores autenticados jueguen una partida completa por Socket.io (salas, rondas de 15 s, carrera por Pokémon, acumulación de stats, fin por las reglas del modo, desconexiones) con todo guardado en PostgreSQL.

**Architecture:** `GameEngine` es una función pura (`reduce(estado, evento, hora, deps) → { estado, efectos }`) sin red ni base de datos. `GameRoom` ejecuta los efectos con puertos inyectados (`Clock`, `Scheduler`, `Broadcaster`, `GameRepository`); `RoomManager` crea y busca salas (en memoria, detrás de `RoomStore`); Express expone las salas por REST y Socket.io solo valida y delega. Los tipos de eventos viven en un paquete `shared/` que reutilizará el cliente.

**Tech Stack:** Node 24, TypeScript 7, Express 5, Socket.io 4.8, Prisma 7.10.0, PostgreSQL 18, Zod 4, Vitest 5 (`socket.io-client` para las pruebas).

**Spec:** `docs/superpowers/specs/2026-09-30-etapa-2-motor-de-juego-design.md` (complementa `2026-09-30-pokemon-minigames-design.md`; donde la de la etapa 2 es más específica, manda).

## Global Constraints

- Tiempos como constantes nombradas en `game/constants.ts`, no variables de entorno: `ROUND_SECONDS` 15, `TYPE_CHOICE_SECONDS` 15, `RESULT_PAUSE_SECONDS` 6, `START_COUNTDOWN_SECONDS` 5, `RECONNECT_GRACE_SECONDS` 30, `WAITING_ROOM_TTL_MINUTES` 10, `SIMULTANEOUS_WINDOW_MS` 500, `MIN_POOL_PER_PAIR` 2.
- Modo personalizado: de 1 a 20 rondas, o meta de stats de 500 a 5000; rondas fijas: 3 o 5.
- "Durante las partidas no se llama a PokéAPI" y tampoco a la base de datos para leer el catálogo: todo sale del `PokemonCatalog` en memoria.
- Un solo intento por jugador por ronda; el servidor es la autoridad de tiempo (timestamp de servidor, nunca del cliente).
- Un Pokémon solo puede estar en un equipo por partida.
- Durante una ronda el jugador ve su equipo completo y del rival solo `totalStats` y `teamSize`.
- Límite de eventos por socket: 5 por segundo (`RATE_LIMITED`).
- Un usuario solo puede estar en una partida activa a la vez (`ALREADY_IN_GAME`).
- Modelo de datos en tercera forma normal; no se agregan tablas ni columnas nuevas en esta etapa.
- Mensajes de error al usuario en español; identificadores de código en inglés.
- Se sigue TDD: cada comportamiento se prueba antes de implementarlo.
- Versiones: `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada.

1. **Temporizadores obsoletos.** Un temporizador viejo (cuenta atrás cancelada, ronda anterior, gracia de una caída anterior, elección de tipos ya resuelta) nunca debe cerrar ni adelantar una fase nueva. → Task 5 (`engine.lobby`, `engine.rounds`, `engine.types`, `engine.disconnect`).
2. **Dos pestañas y reconexión.** Abrir la sala en una segunda pestaña reemplaza a la primera sin que el rival vea una caída; reconectar devuelve el estado completo y avisa al rival; una sala terminada ya no admite conexiones. → Task 8 (`realtime.test.ts`).
3. **Fuga de información.** El rival nunca recibe lo que escribiste, tu Pokémon ni tu tipo elegido antes del resultado; `room-state` no revela el equipo rival; `type-received` solo llega a quien eligió. → Task 5 (`view.test.ts`, `engine.types`) y Task 8.
4. **Guardado.** Un fallo de la base de datos no detiene la partida; las escrituras se hacen de una en una y en orden aunque una sea lenta; guardar una ronda es atómico; al arrancar, las partidas a medias pasan a `abandoned`. → Task 6 (`room.test.ts`, `prisma-game-repository.test.ts`).
5. **Entradas y simultaneidad.** Cargas de socket mal formadas o de más de 100 caracteres, cuerpos REST inválidos en todos sus bordes (rondas 0/21, metas 499/5001, decimales, texto), dos creaciones de sala del mismo usuario a la vez, dos personas intentando el asiento 2 a la vez y códigos de sala repetidos en la base de datos. → Task 7 y Task 8.

---

## File Structure

```
pokemon-minigames/
├── package.json                      # workspaces: shared + server
├── shared/                           # NUEVO: contrato entre servidor y cliente
│   ├── package.json
│   └── src/ index.ts  types.ts  errors.ts  events.ts  rooms.ts
└── server/
    ├── scripts/smoke-game.ts         # prueba de humo manual
    ├── src/
    │   ├── index.ts                  # arranque real (catálogo, abandonar pendientes, Socket.io)
    │   ├── app.ts                    # createApp({ env, prisma, tokens, roomManager })
    │   ├── catalog/
    │   │   ├── pokemon-catalog.ts    # PokemonCatalog en memoria + loadCatalog
    │   │   └── snapshot.ts           # (usa los tipos de shared)
    │   ├── game/
    │   │   ├── constants.ts  rng.ts  ports.ts
    │   │   ├── engine/ types.ts  resolve.ts  view.ts  engine.ts
    │   │   ├── room.ts               # GameRoom: ejecuta efectos
    │   │   ├── room-manager.ts  room-store.ts
    │   │   └── prisma-game-repository.ts
    │   ├── rooms/ rooms.schemas.ts  rooms.routes.ts
    │   ├── realtime/ rate-limiter.ts  broadcaster.ts  server.ts
    │   └── http/errors.ts            # (ErrorCode viene de shared)
    └── test/
        ├── helpers/ fixtures.ts  rng.ts  users.ts  app.ts
        ├── game/ fakes.ts  harness.ts  + pruebas del motor, sala, manager y repositorio
        ├── catalog/  rooms/  realtime/  e2e/  shared/
```

El motor (`game/engine/`) no importa Express, Socket.io ni Prisma. Los adaptadores (Prisma, Socket.io) se enchufan por las interfaces de `game/ports.ts`.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con la etapa 1 completa (152 pruebas). Trabaja en una rama `etapa-2-motor`.
- `server/.env` y `server/.env.test` ya existen de la etapa 1 (rol `pokemon_app`); si no, sigue las notas de entorno del plan de la etapa 1. Las pruebas usan `pokemon_minigames_test` y **borran datos**.
- Antes de este plan se verificó en una copia de trabajo que TypeScript 7, Vitest 5 y `tsx` resuelven el paquete `shared/` desde el workspace (exports apuntando a `.ts`), y que Socket.io 4.8 y su cliente funcionan con esas versiones. Todo el código de este plan se ejecutó antes de incluirlo: 344 pruebas en verde y `tsc` sin errores.
- Las pruebas de tiempo real usan **tiempo simulado** (`FakeTime`): nunca esperan de verdad. Solo el script `smoke` usa temporizadores reales.
- `server/data/catalog.snapshot.json` debe estar cargado en la base de desarrollo (`npm run db:seed -w server`) para arrancar el servidor real.

---

### Task 1: Paquete `shared/` y adaptar el servidor a él

**Files:**
- Modify: `package.json`, `server/package.json` (dependencia), `server/src/catalog/snapshot.ts`, `server/src/http/errors.ts`
- Create: `shared/package.json`, `shared/src/types.ts`, `shared/src/errors.ts`, `shared/src/events.ts`, `shared/src/rooms.ts`, `shared/src/index.ts`
- Test: `server/test/shared/contract.test.ts`

**Interfaces:**
- Produces (paquete `@pokemon-minigames/shared`): `TYPE_NAMES` (18 tipos `as const`), `TypeName`, `BaseStats`, `TypeMode`, `LengthMode`, `Seat` (`1 | 2`), `PickResult`, `GamePhase`, `GameEndReason`, `RoomConfig { typeMode, lengthMode, roundsLimit: number | null, statsGoal: number | null }`, `PokemonView`; `ERROR_CODES`, `ErrorCode`; `RoomStateView`, `RoomPlayerView`, `RoundPlayerResult`, `RoundResultPayload`, `RoundStartedPayload`, `GameEndedPayload`, `ClientToServerEvents`, `ServerToClientEvents`, `ServerEventName`, `ServerEvent` (`{ name, payload }` discriminado); `CreateRoomRequest`, `CreateRoomResponse`, `PublicRoomInfo`.
- `server/src/catalog/snapshot.ts` sigue exportando `TYPE_NAMES`, `TypeName` y `BaseStats` (ahora re-exportados desde `shared`); `server/src/http/errors.ts` sigue exportando `ErrorCode`.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/shared/contract.test.ts`:

```ts
import { ERROR_CODES, TYPE_NAMES } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { TYPE_NAMES as SNAPSHOT_TYPE_NAMES, typeId } from "../../src/catalog/snapshot.js";

describe("paquete shared", () => {
  it("define los 18 tipos sin repetir, y el servidor usa esa misma lista", () => {
    expect(TYPE_NAMES).toHaveLength(18);
    expect(new Set(TYPE_NAMES).size).toBe(18);
    expect(SNAPSHOT_TYPE_NAMES).toBe(TYPE_NAMES);
    expect(typeId("normal")).toBe(1);
    expect(typeId("fairy")).toBe(18);
  });

  it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
git switch -c etapa-2-motor
npm test -w server -- test/shared
```

Expected: FAIL — `Failed to resolve import "@pokemon-minigames/shared"` (todavía no existe el paquete).

- [ ] **Step 3: Crear el paquete `shared/`**

`shared/package.json` (los `exports` apuntan al código fuente `.ts`; `tsc`, Vitest y `tsx` lo resuelven sin compilar):

```json
{
  "name": "@pokemon-minigames/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

`shared/src/types.ts`:

```ts
/** Los 18 tipos del juego. En la base de datos el id de un tipo es su posición + 1. */
export const TYPE_NAMES = [
  "normal",
  "fighting",
  "flying",
  "poison",
  "ground",
  "rock",
  "bug",
  "ghost",
  "steel",
  "fire",
  "water",
  "grass",
  "electric",
  "psychic",
  "ice",
  "dragon",
  "dark",
  "fairy",
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export type TypeMode = "random" | "chosen";
export type LengthMode = "fixed_rounds" | "custom";

/** Asiento en la sala: 1 es quien la crea, 2 quien se une. */
export type Seat = 1 | 2;

export type PickResult = "VALID" | "NOT_FOUND" | "WRONG_TYPES" | "ALREADY_OWNED" | "TAKEN" | "NO_ANSWER";

export type GamePhase = "waiting" | "starting" | "choosing_types" | "round_active" | "round_result" | "finished";

/**
 * Por qué terminó la partida. completed, forfeit, disconnect y exhausted son partidas
 * terminadas; cancelled, expired y abandoned quedan como abandonadas.
 */
export type GameEndReason = "completed" | "forfeit" | "disconnect" | "exhausted" | "cancelled" | "expired" | "abandoned";

export interface RoomConfig {
  typeMode: TypeMode;
  lengthMode: LengthMode;
  /** Rondas fijas (3 o 5) o máximo de rondas del modo personalizado; nulo si el fin es por meta de stats. */
  roundsLimit: number | null;
  /** Meta de stats del modo personalizado; nulo en cualquier otro caso. */
  statsGoal: number | null;
}

export interface PokemonView {
  id: number;
  names: { es: string; en: string };
  spriteUrl: string;
  types: TypeName[];
  stats: BaseStats;
  totalStats: number;
}
```

`shared/src/errors.ts`:

```ts
export const ERROR_CODES = [
  // Generales y de autenticación
  "VALIDATION_ERROR",
  "EMAIL_TAKEN",
  "USERNAME_TAKEN",
  "INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "INVALID_REFRESH_TOKEN",
  "NOT_FOUND",
  "INTERNAL_ERROR",
  // Salas (REST)
  "ALREADY_IN_GAME",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_CLOSED",
  // Partida (Socket.io)
  "NOT_IN_ROOM",
  "WRONG_PHASE",
  "ALREADY_ANSWERED",
  "ALREADY_CHOSEN",
  "INVALID_TYPE",
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
```

`shared/src/events.ts`:

```ts
import type { ErrorCode } from "./errors.js";
import type {
  GameEndReason,
  GamePhase,
  PickResult,
  PokemonView,
  RoomConfig,
  Seat,
  TypeName,
} from "./types.js";

export interface RoomPlayerView {
  seat: Seat;
  username: string;
  connected: boolean;
  totalStats: number;
  teamSize: number;
}

/** Estado completo de la partida desde el punto de vista de un jugador. */
export interface RoomStateView {
  code: string;
  phase: GamePhase;
  config: RoomConfig;
  mySeat: Seat;
  players: RoomPlayerView[];
  /** Equipo propio completo. Del rival solo se conocen los totales (`players`). */
  myTeam: PokemonView[];
  roundsPlayed: number;
  startsAt: number | null;
  /** Hasta cuándo puede volver el rival si está desconectado. */
  opponentGraceEndsAt: number | null;
  round: {
    number: number;
    pair: [TypeName, TypeName] | null;
    deadline: number | null;
    /** Ya envié mi respuesta en esta ronda. */
    answered: boolean;
    /** Ya elegí mi tipo en esta ronda. */
    typeChosen: boolean;
  } | null;
}

export interface RoundPlayerResult {
  seat: Seat;
  result: PickResult;
  /** Lo que escribió el jugador; nulo si no respondió. */
  text: string | null;
  /** Pokémon que ganó en esta ronda, si lo hubo. */
  pokemon: PokemonView | null;
  totalStats: number;
  teamSize: number;
}

export interface RoundResultPayload {
  round: number;
  type1: TypeName;
  type2: TypeName;
  results: Record<Seat, RoundPlayerResult>;
}

export interface GameEndedPayload {
  winnerSeat: Seat | null;
  reason: GameEndReason;
  teams: Record<Seat, PokemonView[]>;
  totals: Record<Seat, number>;
}

export interface RoundStartedPayload {
  round: number;
  type1: TypeName;
  type2: TypeName;
  deadline: number;
  /** El par elegido no era válido y el servidor sorteó otro. */
  typesNotice?: "pair_replaced";
}

export interface ClientToServerEvents {
  "join-room": (payload: { code: string }) => void;
  "choose-type": (payload: { type: string }) => void;
  "submit-pokemon": (payload: { text: string }) => void;
  "leave-room": () => void;
}

export interface ServerToClientEvents {
  "room-state": (payload: RoomStateView) => void;
  "player-joined": (payload: { username: string }) => void;
  "game-starting": (payload: { startsAt: number }) => void;
  "choose-types": (payload: { round: number; deadline: number }) => void;
  "type-received": (payload: { round: number }) => void;
  "round-started": (payload: RoundStartedPayload) => void;
  "answer-received": (payload: { round: number }) => void;
  "round-result": (payload: RoundResultPayload) => void;
  "game-ended": (payload: GameEndedPayload) => void;
  "opponent-disconnected": (payload: { graceEndsAt: number }) => void;
  "opponent-reconnected": () => void;
  error: (payload: { code: ErrorCode; message: string }) => void;
}

export type ServerEventName = keyof ServerToClientEvents;

/** Un evento del servidor con su nombre y su carga, como unión discriminada. */
export type ServerEvent = {
  [K in ServerEventName]: { name: K; payload: Parameters<ServerToClientEvents[K]>[0] };
}[ServerEventName];
```

`shared/src/rooms.ts`:

```ts
import type { GamePhase, LengthMode, RoomConfig, TypeMode } from "./types.js";

/** Cuerpo de `POST /rooms`. */
export interface CreateRoomRequest {
  typeMode: TypeMode;
  lengthMode: LengthMode;
  roundsLimit?: number;
  statsGoal?: number;
}

export interface CreateRoomResponse {
  code: string;
}

/** Respuesta de `GET /rooms/:code`. */
export interface PublicRoomInfo {
  code: string;
  phase: GamePhase;
  config: RoomConfig;
  creator: string;
  playerCount: number;
}
```

`shared/src/index.ts`:

```ts
export * from "./errors.js";
export * from "./events.js";
export * from "./rooms.js";
export * from "./types.js";
```

- [ ] **Step 4: Registrar el workspace y la dependencia**

En `package.json` de la raíz, cambiar `"workspaces": ["server"]` por `"workspaces": ["shared", "server"]`.

En `server/package.json`, dentro de `dependencies` y en orden alfabético (antes de `@prisma/adapter-pg`), agregar:

```json
    "@pokemon-minigames/shared": "*",
```

Luego:

```bash
npm install
```

Expected: npm enlaza `node_modules/@pokemon-minigames/shared` al directorio `shared/` (workspace) y actualiza `package-lock.json`.

- [ ] **Step 5: Hacer que el servidor use los tipos de `shared`**

Reemplazar `server/src/catalog/snapshot.ts` completo (los tipos y las stats ya no se definen aquí, se re-exportan; el resto del archivo no cambia):

```ts
import { type BaseStats, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { normalizeName } from "./normalize.js";

// Los tipos y las stats base viven en `shared/` (los usa también el cliente); se re-exportan aquí.
export { TYPE_NAMES };
export type { BaseStats, TypeName };

export interface PokemonSnapshot {
  /** Número de la Pokédex nacional. */
  id: number;
  /** Uno o dos tipos, en el orden de los slots de PokéAPI. */
  types: TypeName[];
  stats: BaseStats;
  spriteUrl: string;
  names: { es: string; en: string };
}

export interface CatalogSnapshot {
  generatedAt: string;
  source: string;
  pokemon: PokemonSnapshot[];
}

export function totalStats(stats: BaseStats): number {
  return stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed;
}

export function typeId(name: TypeName): number {
  return TYPE_NAMES.indexOf(name) + 1;
}

/** Devuelve la lista de problemas del snapshot; vacía si es válido. */
export function validateSnapshot(snapshot: CatalogSnapshot): string[] {
  const problems: string[] = [];
  if (snapshot.pokemon.length === 0) {
    return ["El snapshot no tiene Pokémon"];
  }

  const seenIds = new Set<number>();
  const idsByName = new Map<string, Set<number>>();

  for (const p of snapshot.pokemon) {
    const label = `#${p.id}`;
    if (!Number.isInteger(p.id) || p.id < 1) problems.push(`${label}: id inválido`);
    if (seenIds.has(p.id)) problems.push(`${label}: id repetido`);
    seenIds.add(p.id);

    if (p.types.length < 1 || p.types.length > 2) problems.push(`${label}: debe tener 1 o 2 tipos`);
    for (const type of p.types) {
      if (!(TYPE_NAMES as readonly string[]).includes(type)) problems.push(`${label}: tipo desconocido "${type}"`);
    }
    if (new Set(p.types).size !== p.types.length) problems.push(`${label}: tipos repetidos`);

    for (const [stat, value] of Object.entries(p.stats)) {
      if (!Number.isInteger(value) || value < 1) problems.push(`${label}: stat ${stat} inválida (${value})`);
    }
    if (!p.spriteUrl) problems.push(`${label}: sin sprite`);

    for (const language of ["es", "en"] as const) {
      const name = p.names[language];
      const normalized = name ? normalizeName(name) : "";
      if (!normalized) {
        problems.push(`${label}: nombre ${language} vacío`);
        continue;
      }
      const ids = idsByName.get(normalized) ?? new Set<number>();
      ids.add(p.id);
      idsByName.set(normalized, ids);
    }
  }

  for (const [name, ids] of idsByName) {
    if (ids.size > 1) problems.push(`El nombre normalizado "${name}" es ambiguo: Pokémon ${[...ids].map((i) => `#${i}`).join(", ")}`);
  }
  return problems;
}
```

Reemplazar `server/src/http/errors.ts` completo (`ErrorCode` ahora viene de `shared`):

```ts
import type { ErrorCode } from "@pokemon-minigames/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export type { ErrorCode };

/** Error esperado de la aplicación: se convierte en una respuesta HTTP con código tipado. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Ruta no encontrada" } });
};

function errorType(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { type?: unknown }).type : undefined;
}

// Express identifica un manejador de errores por tener 4 parámetros.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }
  if (errorType(err) === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "El cuerpo no es JSON válido" } });
    return;
  }
  if (errorType(err) === "entity.too.large") {
    res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "El cuerpo es demasiado grande" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
};
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

```bash
npm test
npm run typecheck
```

Expected: PASS (154 pruebas: las 152 de la etapa 1 más las 2 de `contract.test.ts`) y `tsc` sin errores.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): paquete shared con tipos de eventos y códigos de error" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Constantes y azar inyectable

**Files:**
- Create: `server/src/game/constants.ts`, `server/src/game/rng.ts`, `server/test/helpers/rng.ts`
- Test: `server/test/game/rng.test.ts`

**Interfaces:**
- Produces: las constantes de tiempo y límites (`ROUND_SECONDS`, `TYPE_CHOICE_SECONDS`, `RESULT_PAUSE_SECONDS`, `START_COUNTDOWN_SECONDS`, `RECONNECT_GRACE_SECONDS`, `WAITING_ROOM_TTL_MINUTES`, `SIMULTANEOUS_WINDOW_MS`, `MIN_POOL_PER_PAIR`, `CUSTOM_ROUNDS_MIN/MAX`, `CUSTOM_STATS_GOAL_MIN/MAX`, `FIXED_ROUNDS_OPTIONS`, `SOCKET_EVENTS_PER_SECOND`, `MAX_ANSWER_LENGTH`, `ROOM_CODE_LENGTH`, `ROOM_CODE_ALPHABET`) y los ayudantes `seconds(n)` y `minutes(n)` (devuelven milisegundos); `interface Rng { int(maxExclusive: number): number }`, `cryptoRng`, `pickOne(rng, items)` (lanza `Error` si la lista está vacía); en pruebas, `sequenceRng(values?): Rng & { calls }` (cada llamada consume el siguiente valor, módulo el máximo; sin valores devuelve 0) y `seededRng(seed): Rng` (repetible).

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/helpers/rng.ts`:

```ts
import type { Rng } from "../../src/game/rng.js";

/**
 * Azar con una secuencia conocida: cada llamada consume el siguiente valor (módulo el
 * máximo pedido). Cuando se acaba la secuencia devuelve 0.
 */
export function sequenceRng(values: number[] = []): Rng & { calls: number } {
  const queue = [...values];
  const rng = {
    calls: 0,
    int(maxExclusive: number): number {
      rng.calls++;
      const next = queue.shift() ?? 0;
      return next % maxExclusive;
    },
  };
  return rng;
}

/** Azar pseudoaleatorio pero repetible (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive: number): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
    },
  };
}
```

`server/test/game/rng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cryptoRng, pickOne } from "../../src/game/rng.js";
import { seededRng, sequenceRng } from "../helpers/rng.js";

describe("pickOne", () => {
  it("elige el elemento que indica el azar", () => {
    const items = ["a", "b", "c"];
    expect(pickOne(sequenceRng([0]), items)).toBe("a");
    expect(pickOne(sequenceRng([2]), items)).toBe("c");
  });

  it("lanza un error claro si la lista está vacía", () => {
    expect(() => pickOne(sequenceRng([0]), [])).toThrow(/vacía/);
  });
});

describe("cryptoRng", () => {
  it("devuelve enteros dentro del rango y alcanza todos los valores", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = cryptoRng.int(3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(3);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe("azar de las pruebas", () => {
  it("sequenceRng consume los valores en orden, aplica el módulo y cuenta las llamadas", () => {
    const rng = sequenceRng([7, 1]);
    expect(rng.int(5)).toBe(2);
    expect(rng.int(5)).toBe(1);
    expect(rng.int(5)).toBe(0); // sin más valores devuelve 0
    expect(rng.calls).toBe(3);
  });

  it("seededRng es repetible con la misma semilla y distinto con otra", () => {
    const draw = (seed: number) => {
      const rng = seededRng(seed);
      return Array.from({ length: 8 }, () => rng.int(1000));
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/game/rng.test.ts
```

Expected: FAIL — no existe `src/game/rng.js`.

- [ ] **Step 3: Implementar**

`server/src/game/constants.ts`:

```ts
/** Tiempos y límites de la partida. Son constantes, no variables de entorno. */

export const ROUND_SECONDS = 15;
export const TYPE_CHOICE_SECONDS = 15;
export const RESULT_PAUSE_SECONDS = 6;
export const START_COUNTDOWN_SECONDS = 5;
export const RECONNECT_GRACE_SECONDS = 30;
export const WAITING_ROOM_TTL_MINUTES = 10;

/** Dos respuestas al mismo Pokémon con menos diferencia que esto cuentan como simultáneas. */
export const SIMULTANEOUS_WINDOW_MS = 500;

/** Un par de tipos es jugable si quedan al menos tantos Pokémon sin reclamar. */
export const MIN_POOL_PER_PAIR = 2;

export const CUSTOM_ROUNDS_MIN = 1;
export const CUSTOM_ROUNDS_MAX = 20;
export const CUSTOM_STATS_GOAL_MIN = 500;
export const CUSTOM_STATS_GOAL_MAX = 5000;
export const FIXED_ROUNDS_OPTIONS = [3, 5] as const;

/** Eventos del cliente por segundo y por socket antes de responder RATE_LIMITED. */
export const SOCKET_EVENTS_PER_SECOND = 5;

/** Largo máximo del texto de una respuesta. */
export const MAX_ANSWER_LENGTH = 100;

export const ROOM_CODE_LENGTH = 6;
/** Sin 0, O, 1, I ni L para que el código se lea sin confusión. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const seconds = (n: number): number => n * 1000;
export const minutes = (n: number): number => n * 60 * 1000;
```

`server/src/game/rng.ts`:

```ts
import { randomInt } from "node:crypto";

/** Fuente de azar inyectable: en las pruebas se reemplaza por una secuencia conocida. */
export interface Rng {
  /** Entero en [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
};

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: la lista está vacía");
  return items[rng.int(items.length)]!;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/game/rng.test.ts
```

Expected: PASS (5 pruebas).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(game): constantes de tiempo y azar inyectable" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: PokemonCatalog en memoria y datos de prueba

**Files:**
- Create: `server/src/catalog/pokemon-catalog.ts`, `server/test/helpers/fixtures.ts`
- Test: `server/test/catalog/pokemon-catalog.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (etapa 1), `TYPE_NAMES`/`TypeName`/`BaseStats` (Task 1), `seedCatalog` y helpers `prisma`/`resetCatalog` (etapa 1).
- Produces: `interface CatalogPokemon { id, names: { es, en }, spriteUrl, types: TypeName[], stats: BaseStats, totalStats }`, `type TypePair = readonly [TypeName, TypeName]` (orden canónico de `TYPE_NAMES`), `class PokemonCatalog` con `size`, `get(id)`, `resolveName(texto)` (español o inglés, sin tildes/mayúsculas/signos), `static orderPair(a, b)`, `matchesPair(pokemon, pair)`, `poolSize(pair, claimed)` y `playablePairs(claimed, minPool)` (orden estable); el constructor lanza `Error` si dos Pokémon comparten nombre normalizado; `loadCatalog(prisma): Promise<PokemonCatalog>` (ignora Pokémon sin nombre en algún idioma o sin tipos). Helpers de prueba: `FIXTURE_SPECS`, `statsFor(total)`, `fixtureCatalogPokemon()`, `fixtureCatalog()`, `fixtureSnapshot()`. Catálogo de prueba: pares jugables volador/fuego (ids 1, 2, 3), tierra/agua (4, 5), veneno/planta (6, 7); acero/eléctrico solo tiene el 8 (no jugable); 9 y 10 son de un solo tipo.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/helpers/fixtures.ts`:

```ts
import type { BaseStats, TypeName } from "@pokemon-minigames/shared";
import { PokemonCatalog, type CatalogPokemon } from "../../src/catalog/pokemon-catalog.js";
import { type CatalogSnapshot, totalStats } from "../../src/catalog/snapshot.js";

/**
 * Catálogo pequeño y conocido para probar el juego. Pares jugables (al menos 2 Pokémon):
 * volador/fuego (1, 2, 3), tierra/agua (4, 5) y veneno/planta (6, 7).
 * El par acero/eléctrico solo tiene al Pokémon 8, así que no es jugable.
 */
export interface FixtureSpec {
  id: number;
  es: string;
  en: string;
  types: TypeName[];
  total: number;
}

export const FIXTURE_SPECS: FixtureSpec[] = [
  { id: 1, es: "Alfa", en: "Alpha", types: ["fire", "flying"], total: 500 },
  { id: 2, es: "Beto", en: "Beta", types: ["fire", "flying"], total: 400 },
  { id: 3, es: "Gama", en: "Gamma", types: ["fire", "flying"], total: 300 },
  { id: 4, es: "Delta", en: "Delta", types: ["water", "ground"], total: 450 },
  { id: 5, es: "Épsilon", en: "Epsilon", types: ["water", "ground"], total: 350 },
  { id: 6, es: "Zeta", en: "Zeta", types: ["grass", "poison"], total: 600 },
  { id: 7, es: "Eta", en: "Eta", types: ["grass", "poison"], total: 200 },
  { id: 8, es: "Teta", en: "Theta", types: ["electric", "steel"], total: 380 },
  { id: 9, es: "Iota", en: "Iota", types: ["fire"], total: 350 },
  { id: 10, es: "Kapa", en: "Kappa", types: ["water"], total: 250 },
];

/** Reparte un total en seis stats enteras positivas que suman exactamente ese total. */
export function statsFor(total: number): BaseStats {
  const base = Math.floor(total / 6);
  const hp = total - base * 5;
  return { hp, attack: base, defense: base, spAttack: base, spDefense: base, speed: base };
}

export function fixtureCatalogPokemon(): CatalogPokemon[] {
  return FIXTURE_SPECS.map((spec) => {
    const stats = statsFor(spec.total);
    return {
      id: spec.id,
      names: { es: spec.es, en: spec.en },
      spriteUrl: `https://example.com/${spec.id}.png`,
      types: spec.types,
      stats,
      totalStats: totalStats(stats),
    };
  });
}

export function fixtureCatalog(): PokemonCatalog {
  return new PokemonCatalog(fixtureCatalogPokemon());
}

/** El mismo catálogo en el formato del snapshot, para cargarlo en la base de datos de pruebas. */
export function fixtureSnapshot(): CatalogSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    source: "fixture",
    pokemon: FIXTURE_SPECS.map((spec) => ({
      id: spec.id,
      types: spec.types,
      stats: statsFor(spec.total),
      spriteUrl: `https://example.com/${spec.id}.png`,
      names: { es: spec.es, en: spec.en },
    })),
  };
}
```

`server/test/catalog/pokemon-catalog.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { fixtureCatalog, fixtureCatalogPokemon, fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog } from "../helpers/db.js";

const catalog = fixtureCatalog();

describe("PokemonCatalog", () => {
  describe("resolveName", () => {
    it("encuentra por nombre en español o en inglés", () => {
      expect(catalog.resolveName("Alfa")?.id).toBe(1);
      expect(catalog.resolveName("Alpha")?.id).toBe(1);
    });

    it("ignora mayúsculas, tildes, espacios y signos", () => {
      expect(catalog.resolveName("  épsilon ")?.id).toBe(5);
      expect(catalog.resolveName("EPSILON")?.id).toBe(5);
      expect(catalog.resolveName("a-l-f-a")?.id).toBe(1);
    });

    it("devuelve undefined para nombres desconocidos o vacíos", () => {
      expect(catalog.resolveName("Pikachu")).toBeUndefined();
      expect(catalog.resolveName("")).toBeUndefined();
      expect(catalog.resolveName("!!!")).toBeUndefined();
    });
  });

  it("get devuelve el Pokémon por id", () => {
    expect(catalog.get(6)?.names.en).toBe("Zeta");
    expect(catalog.get(999)).toBeUndefined();
    expect(catalog.size).toBe(10);
  });

  it("orderPair deja el par en el orden canónico sin importar cómo se pida", () => {
    expect(PokemonCatalog.orderPair("fire", "flying")).toEqual(["flying", "fire"]);
    expect(PokemonCatalog.orderPair("flying", "fire")).toEqual(["flying", "fire"]);
  });

  describe("matchesPair", () => {
    it("exige los dos tipos: un Pokémon de un solo tipo nunca sirve", () => {
      const pair = PokemonCatalog.orderPair("fire", "flying");
      expect(catalog.matchesPair(catalog.get(1)!, pair)).toBe(true);
      expect(catalog.matchesPair(catalog.get(9)!, pair)).toBe(false); // solo fuego
      expect(catalog.matchesPair(catalog.get(4)!, pair)).toBe(false); // agua/tierra
    });
  });

  describe("poolSize y playablePairs", () => {
    const none = new Set<number>();

    it("cuenta los Pokémon de doble tipo sin reclamar", () => {
      const pair = PokemonCatalog.orderPair("fire", "flying");
      expect(catalog.poolSize(pair, none)).toBe(3);
      expect(catalog.poolSize(pair, new Set([1]))).toBe(2);
      expect(catalog.poolSize(PokemonCatalog.orderPair("ice", "dark"), none)).toBe(0);
    });

    it("con mínimo 2 solo son jugables los pares con al menos 2 Pokémon, en orden estable", () => {
      expect(catalog.playablePairs(none, 2)).toEqual([
        ["flying", "fire"],
        ["poison", "grass"],
        ["ground", "water"],
      ]);
    });

    it("al reclamar Pokémon, los pares dejan de ser jugables", () => {
      expect(catalog.playablePairs(new Set([6]), 2)).toEqual([
        ["flying", "fire"],
        ["ground", "water"],
      ]);
      expect(catalog.playablePairs(new Set([1, 2, 4]), 2)).toEqual([["poison", "grass"]]);
      expect(catalog.playablePairs(new Set([1, 2, 4, 6]), 2)).toEqual([]);
    });

    it("con mínimo 1 también entra el par de un solo Pokémon", () => {
      expect(catalog.playablePairs(none, 1)).toContainEqual(["steel", "electric"]);
    });
  });

  it("rechaza un catálogo con dos Pokémon que comparten nombre normalizado", () => {
    const [first, second] = fixtureCatalogPokemon();
    const clash = { ...second!, names: { es: "ALFA", en: "Otro" } };
    expect(() => new PokemonCatalog([first!, clash])).toThrow(/ambiguo/);
  });
});

describe("loadCatalog", () => {
  beforeAll(async () => {
    await resetCatalog();
    await seedCatalog(prisma, fixtureSnapshot());
    // Pokémon incompletos: uno sin nombres ni tipos, otro con nombres pero sin tipos.
    const stats = { baseHp: 10, baseAttack: 10, baseDefense: 10, baseSpAttack: 10, baseSpDefense: 10, baseSpeed: 10, totalStats: 60, spriteUrl: "u" };
    await prisma.pokemon.create({ data: { id: 98, ...stats } });
    await prisma.pokemon.create({
      data: {
        id: 99,
        ...stats,
        names: {
          create: [
            { language: "es", name: "Sin Tipos", normalizedName: "sintipos" },
            { language: "en", name: "No Types", normalizedName: "notypes" },
          ],
        },
      },
    });
  });
  afterAll(async () => {
    await resetCatalog();
    await prisma.$disconnect();
  });

  it("carga los Pokémon completos con tipos en orden de slot, nombres y stats", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.size).toBe(10);
    const charizardLike = loaded.get(1)!;
    expect(charizardLike.types).toEqual(["fire", "flying"]);
    expect(charizardLike.names).toEqual({ es: "Alfa", en: "Alpha" });
    expect(charizardLike.totalStats).toBe(500);
    expect(loaded.resolveName("épsilon")?.id).toBe(5);
  });

  it("ignora los Pokémon sin nombres o sin tipos", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.get(98)).toBeUndefined();
    expect(loaded.get(99)).toBeUndefined();
    expect(loaded.resolveName("Sin Tipos")).toBeUndefined();
  });

  it("los pares jugables coinciden con los del catálogo en memoria", async () => {
    const loaded = await loadCatalog(prisma);
    expect(loaded.playablePairs(new Set(), 2)).toEqual(fixtureCatalog().playablePairs(new Set(), 2));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

```bash
npm test -w server -- test/catalog/pokemon-catalog.test.ts
```

Expected: FAIL — no existe `src/catalog/pokemon-catalog.js`.

- [ ] **Step 3: Implementar**

`server/src/catalog/pokemon-catalog.ts`:

```ts
import { type BaseStats, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../db/prisma.js";
import { normalizeName } from "./normalize.js";

export interface CatalogPokemon {
  id: number;
  names: { es: string; en: string };
  spriteUrl: string;
  types: TypeName[];
  stats: BaseStats;
  totalStats: number;
}

/** Par de tipos en su orden canónico (el de TYPE_NAMES): así el par no tiene orden ni repetidos. */
export type TypePair = readonly [TypeName, TypeName];

const typeIndex = (type: TypeName): number => TYPE_NAMES.indexOf(type);

interface PairEntry {
  pair: TypePair;
  members: CatalogPokemon[];
}

/** Catálogo de Pokémon en memoria. Durante las partidas nunca se consulta la base de datos. */
export class PokemonCatalog {
  private readonly byId = new Map<number, CatalogPokemon>();
  private readonly byName = new Map<string, CatalogPokemon>();
  private readonly pairs = new Map<string, PairEntry>();

  constructor(pokemon: readonly CatalogPokemon[]) {
    for (const p of pokemon) {
      this.byId.set(p.id, p);

      for (const name of [p.names.es, p.names.en]) {
        const key = normalizeName(name);
        if (!key) continue;
        const existing = this.byName.get(key);
        if (existing && existing.id !== p.id) {
          throw new Error(`Nombre ambiguo en el catálogo: "${key}" (#${existing.id} y #${p.id})`);
        }
        this.byName.set(key, p);
      }

      if (p.types.length === 2) {
        const pair = PokemonCatalog.orderPair(p.types[0]!, p.types[1]!);
        const key = `${pair[0]}|${pair[1]}`;
        const entry = this.pairs.get(key) ?? { pair, members: [] };
        entry.members.push(p);
        this.pairs.set(key, entry);
      }
    }
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: number): CatalogPokemon | undefined {
    return this.byId.get(id);
  }

  /** Busca por nombre en español o en inglés, sin distinguir tildes, mayúsculas ni signos. */
  resolveName(text: string): CatalogPokemon | undefined {
    const key = normalizeName(text);
    return key ? this.byName.get(key) : undefined;
  }

  static orderPair(a: TypeName, b: TypeName): TypePair {
    return typeIndex(a) <= typeIndex(b) ? [a, b] : [b, a];
  }

  /** Un Pokémon sirve para un par solo si tiene los dos tipos. */
  matchesPair(pokemon: CatalogPokemon, pair: TypePair): boolean {
    return pair.every((type) => pokemon.types.includes(type));
  }

  /** Cuántos Pokémon de doble tipo de ese par siguen sin reclamar. */
  poolSize(pair: TypePair, claimed: ReadonlySet<number>): number {
    const entry = this.pairs.get(`${pair[0]}|${pair[1]}`);
    return entry ? entry.members.filter((p) => !claimed.has(p.id)).length : 0;
  }

  /** Pares con al menos `minPool` Pokémon sin reclamar, en un orden estable. */
  playablePairs(claimed: ReadonlySet<number>, minPool: number): TypePair[] {
    return [...this.pairs.values()]
      .filter((entry) => entry.members.filter((p) => !claimed.has(p.id)).length >= minPool)
      .map((entry) => entry.pair)
      .sort((a, b) => typeIndex(a[0]) - typeIndex(b[0]) || typeIndex(a[1]) - typeIndex(b[1]));
  }
}

/**
 * Carga el catálogo de la base de datos. Ignora los Pokémon incompletos (sin nombre en
 * alguno de los dos idiomas o sin tipos), que pueden quedar al resembrar con un snapshot
 * que ya no los incluye.
 */
export async function loadCatalog(prisma: PrismaClient): Promise<PokemonCatalog> {
  const rows = await prisma.pokemon.findMany({
    orderBy: { id: "asc" },
    include: { types: { orderBy: { slot: "asc" }, include: { type: true } }, names: true },
  });

  const list: CatalogPokemon[] = [];
  for (const row of rows) {
    const es = row.names.find((n) => n.language === "es")?.name;
    const en = row.names.find((n) => n.language === "en")?.name;
    if (!es || !en || row.types.length === 0) continue;
    list.push({
      id: row.id,
      names: { es, en },
      spriteUrl: row.spriteUrl,
      types: row.types.map((t) => t.type.name as TypeName),
      stats: {
        hp: row.baseHp,
        attack: row.baseAttack,
        defense: row.baseDefense,
        spAttack: row.baseSpAttack,
        spDefense: row.baseSpDefense,
        speed: row.baseSpeed,
      },
      totalStats: row.totalStats,
    });
  }
  return new PokemonCatalog(list);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

```bash
npm test -w server -- test/catalog/pokemon-catalog.test.ts
```

Expected: PASS (14 pruebas). El orden de `playablePairs` es por índice de tipo: `flying` (2) antes que `poison` (3) y `ground` (4).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(catalog): PokemonCatalog en memoria con pares jugables y datos de prueba" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motor I — tipos internos y resolución de ronda

**Files:**
- Create: `server/src/game/engine/types.ts`, `server/src/game/engine/resolve.ts`
- Test: `server/test/game/resolve.test.ts`

**Interfaces:**
- Consumes: `PokemonCatalog`, `TypePair`, `CatalogPokemon` (Task 3), `Rng` (Task 2), `PickResult`/`Seat` (Task 1), helpers `fixtureCatalog`, `sequenceRng`.
- Produces (`engine/types.ts`): `SEATS`, `otherSeat(seat)`, `PlayerState`, `PickState { text, at }`, `RoundState`, `GameOutcome { winnerSeat, reason }`, `GameState` (`phase`, `config`, `players`, `round`, `roundsPlayed`, `owners: Map<pokemonId, Seat>`, `startsAt`, `graceEndsAt`, `outcome`), `TimerId` (`expire`, `start`, `choose`, `round`, `result`, `grace`), `GameEvent` (`PLAYER_JOINED`, `PLAYER_CONNECTED`, `PLAYER_DISCONNECTED`, `CHOOSE_TYPE`, `SUBMIT`, `LEAVE`, `TIMER`), `RoundRecordPick`, `RoundRecord { number, pair, picks }`, `Effect` (`schedule`, `emit`, `send_state`, `persist_seat_taken`, `persist_seat_freed`, `persist_started`, `persist_round`, `persist_end`), `ReduceResult { state, effects }`, `EngineDeps { catalog, rng }`.
- Produces (`engine/resolve.ts`): `resolveRound({ pair, picks, owners, catalog, rng, windowMs }): Record<Seat, { result: PickResult, pokemonId: number | null }>`. Orden de comprobaciones: existe → tiene ambos tipos → no reclamado. `ALREADY_OWNED` si ya está en tu equipo; `TAKEN` si lo tiene el rival de una ronda anterior o si pierdes la carrera de esta ronda. Carrera: gana el menor timestamp; con menos de `windowMs` de diferencia decide `rng.int(2)` (0 → asiento 1). No consume azar si no hay carrera.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/game/resolve.test.ts`:

```ts
import type { Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { type ResolveInput, resolveRound } from "../../src/game/engine/resolve.js";
import type { PickState } from "../../src/game/engine/types.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";

const catalog = fixtureCatalog();
// Par volador/fuego: Alfa (1), Beto (2) y Gama (3).
const pair = PokemonCatalog.orderPair("fire", "flying");
const WINDOW = 500;

function resolve(
  picks: Partial<Record<Seat, PickState>>,
  extra: Partial<ResolveInput> = {},
) {
  return resolveRound({ pair, picks, owners: new Map(), catalog, rng: sequenceRng(), windowMs: WINDOW, ...extra });
}

const pick = (text: string, at = 1000): PickState => ({ text, at });

describe("resolveRound", () => {
  it("acepta dos Pokémon válidos distintos", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") });
    expect(out[1]).toEqual({ result: "VALID", pokemonId: 1 });
    expect(out[2]).toEqual({ result: "VALID", pokemonId: 2 });
  });

  it("acepta el nombre en español o en inglés, con tildes y mayúsculas indistintas", () => {
    const out = resolve({ 1: pick("  ALPHA "), 2: pick("bèto") });
    expect(out[1].pokemonId).toBe(1);
    expect(out[2].pokemonId).toBe(2);
  });

  it("NO_ANSWER cuando un jugador no respondió", () => {
    const out = resolve({ 1: pick("Alfa") });
    expect(out[1].result).toBe("VALID");
    expect(out[2]).toEqual({ result: "NO_ANSWER", pokemonId: null });
    expect(resolve({})[1].result).toBe("NO_ANSWER");
  });

  it("NOT_FOUND para un nombre que no existe, vacío o solo signos", () => {
    const out = resolve({ 1: pick("Pikachu"), 2: pick("   ") });
    expect(out[1].result).toBe("NOT_FOUND");
    expect(out[2].result).toBe("NOT_FOUND");
  });

  it("WRONG_TYPES si no tiene ambos tipos, aunque tenga uno de ellos", () => {
    const out = resolve({ 1: pick("Delta"), 2: pick("Iota") }); // agua/tierra y solo fuego
    expect(out[1]).toEqual({ result: "WRONG_TYPES", pokemonId: null });
    expect(out[2]).toEqual({ result: "WRONG_TYPES", pokemonId: null });
  });

  it("ALREADY_OWNED si ya está en tu propio equipo", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { owners: new Map([[1, 1 as Seat]]) });
    expect(out[1]).toEqual({ result: "ALREADY_OWNED", pokemonId: null });
    expect(out[2].result).toBe("VALID");
  });

  it("TAKEN si ya lo tiene el rival de una ronda anterior", () => {
    const out = resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { owners: new Map([[1, 2 as Seat]]) });
    expect(out[1]).toEqual({ result: "TAKEN", pokemonId: null });
    expect(out[2].result).toBe("VALID");
  });

  describe("carrera por el mismo Pokémon", () => {
    it("gana quien respondió antes si la diferencia es de 500 ms o más", () => {
      const out = resolve({ 1: pick("Alfa", 1000), 2: pick("Alpha", 1500) });
      expect(out[1]).toEqual({ result: "VALID", pokemonId: 1 });
      expect(out[2]).toEqual({ result: "TAKEN", pokemonId: null });

      const reversed = resolve({ 1: pick("Alfa", 2000), 2: pick("Alfa", 1000) });
      expect(reversed[2].result).toBe("VALID");
      expect(reversed[1].result).toBe("TAKEN");
    });

    it("con menos de 500 ms de diferencia decide el azar, no el orden de llegada", () => {
      const seatOneWins = resolve({ 1: pick("Alfa", 1100), 2: pick("Alfa", 1000) }, { rng: sequenceRng([0]) });
      expect(seatOneWins[1].result).toBe("VALID");
      expect(seatOneWins[2].result).toBe("TAKEN");

      const seatTwoWins = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1100) }, { rng: sequenceRng([1]) });
      expect(seatTwoWins[2].result).toBe("VALID");
      expect(seatTwoWins[1].result).toBe("TAKEN");
    });

    it("499 ms es simultáneo y 500 ms ya no lo es", () => {
      const simultaneous = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1499) }, { rng: sequenceRng([1]) });
      expect(simultaneous[2].result).toBe("VALID"); // ganó el azar, aunque llegó después

      const notSimultaneous = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1500) }, { rng: sequenceRng([1]) });
      expect(notSimultaneous[1].result).toBe("VALID"); // gana el más rápido; el azar no se usó
    });

    it("el mismo timestamp exacto también se decide por azar", () => {
      const out = resolve({ 1: pick("Alfa", 1000), 2: pick("Alfa", 1000) }, { rng: sequenceRng([1]) });
      expect(out[2].result).toBe("VALID");
    });

    it("no consume azar cuando no hay carrera", () => {
      const rng = sequenceRng([1]);
      resolve({ 1: pick("Alfa"), 2: pick("Beto") }, { rng });
      expect(rng.calls).toBe(0);
    });

    it("una respuesta inválida al mismo Pokémon no dispara la carrera", () => {
      // El jugador 2 escribe el nombre de Alfa pero Alfa ya es suyo: no compite.
      const out = resolve({ 1: pick("Alfa"), 2: pick("Alfa") }, { owners: new Map([[1, 2 as Seat]]) });
      expect(out[1].result).toBe("TAKEN");
      expect(out[2].result).toBe("ALREADY_OWNED");
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/game/resolve.test.ts
```

Expected: FAIL — no existe `src/game/engine/resolve.js`.

- [ ] **Step 3: Implementar**

`server/src/game/engine/types.ts`:

```ts
import type {
  ErrorCode,
  GameEndReason,
  GamePhase,
  PickResult,
  RoomConfig,
  Seat,
  ServerEvent,
  TypeName,
} from "@pokemon-minigames/shared";
import type { PokemonCatalog, TypePair } from "../../catalog/pokemon-catalog.js";
import type { Rng } from "../rng.js";

export const SEATS: readonly Seat[] = [1, 2];

export function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

export interface PlayerState {
  seat: Seat;
  userId: string;
  username: string;
  connected: boolean;
  totalStats: number;
  /** Ids de los Pokémon del equipo, en el orden en que se ganaron. */
  team: number[];
}

export interface PickState {
  text: string;
  /** Timestamp del servidor en que llegó la respuesta. */
  at: number;
}

export interface RoundState {
  number: number;
  typeChoices: Partial<Record<Seat, TypeName>>;
  pair: TypePair | null;
  deadline: number | null;
  picks: Partial<Record<Seat, PickState>>;
}

export interface GameOutcome {
  winnerSeat: Seat | null;
  reason: GameEndReason;
}

export interface GameState {
  phase: GamePhase;
  config: RoomConfig;
  players: Partial<Record<Seat, PlayerState>>;
  round: RoundState | null;
  /** Rondas ya cerradas. */
  roundsPlayed: number;
  /** Pokémon reclamado → asiento que lo tiene. Un Pokémon solo puede estar en un equipo. */
  owners: Map<number, Seat>;
  startsAt: number | null;
  /** Si un jugador está desconectado en plena partida: hasta cuándo puede volver. */
  graceEndsAt: Partial<Record<Seat, number>>;
  outcome: GameOutcome | null;
}

/** Identifica un temporizador. Los datos que lleva sirven para ignorarlo si ya quedó obsoleto. */
export type TimerId =
  | { kind: "expire" }
  | { kind: "start"; startsAt: number }
  | { kind: "choose"; round: number }
  | { kind: "round"; round: number }
  | { kind: "result"; round: number }
  | { kind: "grace"; seat: Seat; graceEndsAt: number };

export type GameEvent =
  | { type: "PLAYER_JOINED"; userId: string; username: string }
  | { type: "PLAYER_CONNECTED"; seat: Seat }
  | { type: "PLAYER_DISCONNECTED"; seat: Seat }
  | { type: "CHOOSE_TYPE"; seat: Seat; typeName: string }
  | { type: "SUBMIT"; seat: Seat; text: string }
  | { type: "LEAVE"; seat: Seat }
  | { type: "TIMER"; timer: TimerId };

export interface RoundRecordPick {
  seat: Seat;
  userId: string;
  text: string | null;
  result: PickResult;
  pokemonId: number | null;
  submittedAt: number | null;
}

export interface RoundRecord {
  number: number;
  pair: TypePair;
  picks: RoundRecordPick[];
}

export type Effect =
  | { kind: "schedule"; at: number; timer: TimerId }
  | { kind: "emit"; to: Seat | "all"; event: ServerEvent }
  /** El orquestador construye el estado completo de ese jugador y se lo envía. */
  | { kind: "send_state"; to: Seat }
  | { kind: "persist_seat_taken"; userId: string }
  | { kind: "persist_seat_freed" }
  | { kind: "persist_started" }
  | { kind: "persist_round"; record: RoundRecord }
  | {
      kind: "persist_end";
      status: "completed" | "abandoned";
      outcome: GameOutcome;
      finalStats: Partial<Record<Seat, number>>;
    };

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}

export interface EngineDeps {
  catalog: PokemonCatalog;
  rng: Rng;
}

export type { ErrorCode };
```

`server/src/game/engine/resolve.ts`:

```ts
import type { PickResult, Seat } from "@pokemon-minigames/shared";
import type { CatalogPokemon, PokemonCatalog, TypePair } from "../../catalog/pokemon-catalog.js";
import type { Rng } from "../rng.js";
import { type PickState, SEATS } from "./types.js";

export interface ResolveInput {
  pair: TypePair;
  picks: Partial<Record<Seat, PickState>>;
  /** Pokémon ya reclamados en rondas anteriores y quién los tiene. */
  owners: ReadonlyMap<number, Seat>;
  catalog: PokemonCatalog;
  rng: Rng;
  /** Dos respuestas al mismo Pokémon con menos diferencia que esto cuentan como simultáneas. */
  windowMs: number;
}

export interface PickOutcome {
  result: PickResult;
  pokemonId: number | null;
}

/**
 * Resuelve las respuestas de una ronda. Orden de las comprobaciones: existe, tiene ambos
 * tipos, no está reclamado. ALREADY_OWNED si ya está en tu equipo; TAKEN si lo tiene el
 * rival (de una ronda anterior) o si perdiste la carrera de esta ronda.
 */
export function resolveRound(input: ResolveInput): Record<Seat, PickOutcome> {
  const { pair, picks, owners, catalog, rng, windowMs } = input;
  const outcomes = {} as Record<Seat, PickOutcome>;
  const candidates: Partial<Record<Seat, CatalogPokemon>> = {};

  for (const seat of SEATS) {
    const pick = picks[seat];
    if (!pick) {
      outcomes[seat] = { result: "NO_ANSWER", pokemonId: null };
      continue;
    }
    const pokemon = catalog.resolveName(pick.text);
    if (!pokemon) {
      outcomes[seat] = { result: "NOT_FOUND", pokemonId: null };
    } else if (!catalog.matchesPair(pokemon, pair)) {
      outcomes[seat] = { result: "WRONG_TYPES", pokemonId: null };
    } else {
      const owner = owners.get(pokemon.id);
      if (owner === seat) {
        outcomes[seat] = { result: "ALREADY_OWNED", pokemonId: null };
      } else if (owner !== undefined) {
        outcomes[seat] = { result: "TAKEN", pokemonId: null };
      } else {
        candidates[seat] = pokemon;
      }
    }
  }

  const first = candidates[1];
  const second = candidates[2];
  if (first && second && first.id === second.id) {
    // Carrera por el mismo Pokémon.
    const at1 = picks[1]!.at;
    const at2 = picks[2]!.at;
    let winner: Seat;
    if (Math.abs(at1 - at2) < windowMs) {
      winner = rng.int(2) === 0 ? 1 : 2;
    } else {
      winner = at1 < at2 ? 1 : 2;
    }
    const loser: Seat = winner === 1 ? 2 : 1;
    outcomes[winner] = { result: "VALID", pokemonId: first.id };
    outcomes[loser] = { result: "TAKEN", pokemonId: null };
    return outcomes;
  }

  for (const seat of SEATS) {
    const pokemon = candidates[seat];
    if (pokemon) outcomes[seat] = { result: "VALID", pokemonId: pokemon.id };
  }
  return outcomes;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/game/resolve.test.ts
```

Expected: PASS (13 pruebas). Técnica de verificación recomendada (se hizo al escribir el plan): cambiar `<` por `<=` en `Math.abs(at1 - at2) < windowMs` debe romper la prueba "499 ms es simultáneo y 500 ms ya no lo es".

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add -A
git commit -m "feat(game): tipos del motor y resolución de una ronda con carrera" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Motor II — `reduce`, vistas y pruebas de todo el ciclo de la partida

**Files:**
- Create: `server/src/game/engine/view.ts`, `server/src/game/engine/engine.ts`
- Test: `server/test/game/harness.ts` (arnés), `server/test/game/engine.lobby.test.ts`, `server/test/game/engine.rounds.test.ts`, `server/test/game/engine.types.test.ts`, `server/test/game/engine.end.test.ts`, `server/test/game/engine.disconnect.test.ts`, `server/test/game/view.test.ts`

**Interfaces:**
- Consumes: todo de las Tasks 1–4, `fixtureCatalog`/`fixtureCatalogPokemon`/`statsFor` (Task 3), `sequenceRng` (Task 2).
- Produces (`engine/engine.ts`): `createGame(config, creator: { userId, username }, now): ReduceResult` (estado `waiting`, creador en el asiento 1, programa el temporizador `expire` a los 10 minutos) y `reduce(prev, event, now, deps): ReduceResult` (pura: clona el estado, no hace E/S; una partida `finished` ignora todo). Comportamiento: ver el bloque de pruebas de cada archivo. Códigos de error emitidos a un asiento: `WRONG_PHASE`, `ALREADY_ANSWERED`, `ALREADY_CHOSEN`, `INVALID_TYPE`. Motivos de fin: `completed`, `exhausted`, `forfeit`, `disconnect`, `cancelled`, `expired`, `abandoned` (los tres últimos y `abandoned` persisten como `abandoned`).
- Produces (`engine/view.ts`): `toPokemonView(pokemon)`, `teamViews(state, seat, catalog)`, `buildRoomState(state, seat, code, catalog): RoomStateView` (del rival solo totales y tamaño), `buildGameEnded(state, catalog): GameEndedPayload`.
- Produces (prueba): `Harness` (reloj y temporizadores simulados: `dispatch`, `advance(ms)`, `payloads(nombre, asiento?)`, `last`, `errorCodes(asiento)`, `effectsOfKind`, `seatBoth`, `startGame`, `submit`, `choose`), `RANDOM_3`, `CHOSEN_3`, `START_TIME`.

- [ ] **Step 1: Escribir el arnés y las pruebas que fallan**

`server/test/game/harness.ts`:

```ts
import type { ErrorCode, RoomConfig, Seat, ServerEvent, ServerEventName } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createGame, reduce } from "../../src/game/engine/engine.js";
import type { Effect, GameEvent, GameState, TimerId } from "../../src/game/engine/types.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";

export const RANDOM_3: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
export const CHOSEN_3: RoomConfig = { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
export const START_TIME = 1_000_000;

type Payload<N extends ServerEventName> = Extract<ServerEvent, { name: N }>["payload"];

export interface Emitted {
  to: Seat | "all";
  event: ServerEvent;
}

/**
 * Hace correr el motor con hora y temporizadores simulados: `advance(ms)` dispara los
 * temporizadores en orden, sin esperar de verdad.
 */
export class Harness {
  state: GameState;
  now = START_TIME;
  emitted: Emitted[] = [];
  persisted: Effect[] = [];
  sentState: Seat[] = [];
  pending: { at: number; timer: TimerId }[] = [];
  readonly rng: ReturnType<typeof sequenceRng>;
  readonly catalog: PokemonCatalog;

  constructor(opts: { config?: RoomConfig; rng?: number[]; catalog?: PokemonCatalog } = {}) {
    this.rng = sequenceRng(opts.rng ?? []);
    this.catalog = opts.catalog ?? fixtureCatalog();
    const created = createGame(opts.config ?? RANDOM_3, { userId: "u1", username: "ash" }, this.now);
    this.state = created.state;
    this.run(created.effects);
  }

  private run(effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case "schedule":
          this.pending.push({ at: effect.at, timer: effect.timer });
          break;
        case "emit":
          this.emitted.push({ to: effect.to, event: effect.event });
          break;
        case "send_state":
          this.sentState.push(effect.to);
          break;
        default:
          this.persisted.push(effect);
      }
    }
  }

  dispatch(event: GameEvent): Effect[] {
    const result = reduce(this.state, event, this.now, { catalog: this.catalog, rng: this.rng });
    this.state = result.state;
    this.run(result.effects);
    return result.effects;
  }

  /** Avanza el reloj disparando, en orden, los temporizadores que venzan. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = this.pending.filter((p) => p.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.pending.splice(this.pending.indexOf(due), 1);
      this.now = due.at;
      this.dispatch({ type: "TIMER", timer: due.timer });
    }
    this.now = target;
  }

  /** Cargas de los eventos con ese nombre; con `to`, solo los que recibió ese asiento. */
  payloads<N extends ServerEventName>(name: N, to?: Seat): Payload<N>[] {
    return this.emitted
      .filter((e) => e.event.name === name && (to === undefined || e.to === to || e.to === "all"))
      .map((e) => e.event.payload as Payload<N>);
  }

  last<N extends ServerEventName>(name: N, to?: Seat): Payload<N> | undefined {
    return this.payloads(name, to).at(-1);
  }

  errorCodes(seat: Seat): ErrorCode[] {
    return this.payloads("error", seat).map((p) => p.code);
  }

  effectsOfKind<K extends Effect["kind"]>(kind: K): Extract<Effect, { kind: K }>[] {
    return this.persisted.filter((e): e is Extract<Effect, { kind: K }> => e.kind === kind);
  }

  clearEmitted(): void {
    this.emitted = [];
  }

  /** El segundo jugador se une y los dos se conectan: empieza la cuenta atrás. */
  seatBoth(): void {
    this.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    this.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  }

  /** Deja la partida en la primera ronda (o en la elección de tipos en el modo elegido). */
  startGame(): void {
    this.seatBoth();
    this.advance(5000);
  }

  submit(seat: Seat, text: string): Effect[] {
    return this.dispatch({ type: "SUBMIT", seat, text });
  }

  choose(seat: Seat, typeName: string): Effect[] {
    return this.dispatch({ type: "CHOOSE_TYPE", seat, typeName });
  }
}
```

`server/test/game/engine.lobby.test.ts` (sala, conexiones, cuenta atrás, caducidad y salida):

```ts
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

  describe("PLAYER_JOINED", () => {
    it("ocupa el asiento 2, avisa al creador y pide guardar el asiento", () => {
      const h = new Harness();
      h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
      expect(h.state.players[2]).toMatchObject({ userId: "u2", username: "misty", connected: false });
      expect(h.payloads("player-joined", 1)).toEqual([{ username: "misty" }]);
      expect(h.effectsOfKind("persist_seat_taken")).toEqual([{ kind: "persist_seat_taken", userId: "u2" }]);
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
      expect(h.last("game-starting")).toEqual({ startsAt: START_TIME + 5000 });
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
```

`server/test/game/engine.rounds.test.ts` (rondas del modo aleatorio):

```ts
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { fixtureCatalogPokemon, statsFor } from "../helpers/fixtures.js";
import { Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // la ronda 1 empieza al terminar la cuenta atrás

/** Partida aleatoria en la ronda 1 con el par volador/fuego (Alfa 500, Beto 400, Gama 300). */
function round1(rng: number[] = [0]): Harness {
  const h = new Harness({ rng });
  h.startGame();
  return h;
}

describe("motor: rondas (modo aleatorio)", () => {
  it("anuncia la ronda con el par ordenado y un plazo de 15 segundos", () => {
    const h = round1();
    expect(h.last("round-started")).toEqual({ round: 1, type1: "flying", type2: "fire", deadline: T0 + 15_000 });
    expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "round", round: 1 } });
  });

  it("confirma la recepción solo a quien respondió, sin decir si acertó", () => {
    const h = round1();
    h.submit(1, "Alfa");
    expect(h.payloads("answer-received", 1)).toEqual([{ round: 1 }]);
    expect(h.emitted.filter((e) => e.event.name === "answer-received").every((e) => e.to === 1)).toBe(true);
    expect(h.state.phase).toBe("round_active");
  });

  it("cuando ambos responden cierra la ronda de inmediato y suma los stats", () => {
    const h = round1();
    h.advance(1000);
    h.submit(1, "Alfa");
    h.advance(1000);
    h.submit(2, "Beto");

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    expect(result.results[1]).toMatchObject({ result: "VALID", text: "Alfa", totalStats: 500, teamSize: 1 });
    expect(result.results[1].pokemon).toMatchObject({ id: 1, totalStats: 500 });
    expect(result.results[2]).toMatchObject({ result: "VALID", text: "Beto", totalStats: 400, teamSize: 1 });

    expect(h.state.players[1]?.team).toEqual([1]);
    expect(h.state.players[2]?.team).toEqual([2]);
    expect([...h.state.owners]).toEqual([[1, 1], [2, 2]]);
  });

  it("guarda la ronda con las respuestas de ambos y su timestamp de servidor", () => {
    const h = round1();
    h.advance(1000);
    h.submit(1, "Alfa");
    h.advance(2000);
    h.submit(2, "Pikachu");

    const [record] = h.effectsOfKind("persist_round").map((e) => e.record);
    expect(record).toEqual({
      number: 1,
      pair: ["flying", "fire"],
      picks: [
        { seat: 1, userId: "u1", text: "Alfa", result: "VALID", pokemonId: 1, submittedAt: T0 + 1000 },
        { seat: 2, userId: "u2", text: "Pikachu", result: "NOT_FOUND", pokemonId: null, submittedAt: T0 + 3000 },
      ],
    });
  });

  it("al vencer los 15 segundos cierra la ronda y marca NO_ANSWER a quien no respondió", () => {
    const h = round1();
    h.submit(1, "Alfa");
    h.advance(14_999);
    expect(h.state.phase).toBe("round_active");
    h.advance(1);

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("VALID");
    expect(result.results[2]).toMatchObject({ result: "NO_ANSWER", text: null, pokemon: null, totalStats: 0, teamSize: 0 });
    const record = h.effectsOfKind("persist_round")[0]!.record;
    expect(record.picks[1]).toMatchObject({ seat: 2, text: null, result: "NO_ANSWER", submittedAt: null });
  });

  it("clasifica cada respuesta: no existe, tipos incorrectos, etc.", () => {
    const h = round1();
    h.submit(1, "Delta"); // agua/tierra: no tiene los tipos del par
    h.submit(2, "Iota"); // solo fuego
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("WRONG_TYPES");
    expect(result.results[2].result).toBe("WRONG_TYPES");
    expect(result.results[1].pokemon).toBeNull();
  });

  describe("carrera por el mismo Pokémon", () => {
    it("gana quien respondió antes; el otro recibe TAKEN", () => {
      const h = round1();
      h.advance(1000);
      h.submit(2, "Alpha");
      h.advance(1000);
      h.submit(1, "Alfa");
      const result = h.last("round-result")!;
      expect(result.results[2].result).toBe("VALID");
      expect(result.results[1].result).toBe("TAKEN");
      expect(h.state.players[2]?.team).toEqual([1]);
      expect(h.state.players[1]?.team).toEqual([]);
    });

    it("si llegan con menos de 500 ms de diferencia decide el azar", () => {
      const h = round1([0, 1]); // 0: par volador/fuego; 1: gana el asiento 2
      h.submit(1, "Alfa");
      h.advance(100);
      h.submit(2, "Alfa");
      const result = h.last("round-result")!;
      expect(result.results[2].result).toBe("VALID");
      expect(result.results[1].result).toBe("TAKEN");
    });
  });

  it("el temporizador de la ronda anterior no cierra la ronda siguiente antes de tiempo", () => {
    const h = round1([0, 1]);
    h.advance(1000);
    h.submit(1, "Alfa");
    h.submit(2, "Beto"); // la ronda 1 cierra en T0 + 1 s; su temporizador original sigue pendiente (T0 + 15 s)
    h.advance(6000); // empieza la ronda 2 en T0 + 7 s, con plazo T0 + 22 s
    expect(h.state.round?.number).toBe(2);

    h.advance(9000); // T0 + 16 s: el temporizador de la ronda 1 venció y debe ignorarse
    expect(h.state.phase).toBe("round_active");
    expect(h.state.round?.number).toBe(2);
    expect(h.payloads("round-result")).toHaveLength(1);

    h.advance(6000); // T0 + 22 s: ahora sí vence la ronda 2
    expect(h.payloads("round-result")).toHaveLength(2);
  });

  describe("respuestas rechazadas", () => {
    it("ALREADY_ANSWERED si se responde dos veces; la primera respuesta se conserva", () => {
      const h = round1();
      h.submit(1, "Alfa");
      h.submit(1, "Beto");
      expect(h.errorCodes(1)).toEqual(["ALREADY_ANSWERED"]);
      expect(h.state.round?.picks[1]?.text).toBe("Alfa");
    });

    it("WRONG_PHASE fuera de una ronda activa: antes de empezar y durante la pausa del resultado", () => {
      const h = new Harness({ rng: [0] });
      h.submit(1, "Alfa");
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);

      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.submit(1, "Gama"); // la ronda ya cerró
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE", "WRONG_PHASE"]);
    });

    it("WRONG_PHASE si la respuesta llega después del plazo aunque el temporizador aún no se haya procesado", () => {
      const h = round1();
      h.now = T0 + 15_001;
      h.submit(1, "Alfa");
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);
      expect(h.state.round?.picks[1]).toBeUndefined();
    });
  });

  describe("siguiente ronda", () => {
    it("tras 6 segundos de pausa arranca sola, sin los pares que ya no son jugables", () => {
      // Ronda 1: par volador/fuego (índice 0). Se reclaman Alfa y Beto, así que solo queda
      // Gama y ese par deja de ser jugable. Ronda 2: entre [veneno/planta, tierra/agua] el índice 1.
      const h = round1([0, 1]);
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      expect(h.state.phase).toBe("round_result");
      expect(h.pending).toContainEqual({ at: T0 + 6000, timer: { kind: "result", round: 1 } });

      h.advance(5999);
      expect(h.payloads("round-started")).toHaveLength(1);
      h.advance(1);
      expect(h.payloads("round-started")).toHaveLength(2);
      expect(h.last("round-started")).toMatchObject({ round: 2, type1: "ground", type2: "water" });
      expect(h.state.phase).toBe("round_active");
    });

    it("un Pokémon que ya tiene el rival da TAKEN y uno que ya tienes da ALREADY_OWNED", () => {
      // Catálogo con 5 Pokémon volador/fuego: tras reclamar 2 en la ronda 1 el par sigue jugable.
      const extra = (id: number, es: string, en: string, total: number) => {
        const stats = statsFor(total);
        return { id, names: { es, en }, spriteUrl: "u", types: ["fire", "flying"] as ("fire" | "flying")[], stats, totalStats: totalStats(stats) };
      };
      const catalog = new PokemonCatalog([...fixtureCatalogPokemon(), extra(11, "Lambda", "Lambda", 100), extra(12, "Mu", "Mu", 110)]);
      const h = new Harness({ rng: [0, 0], catalog }); // ambas rondas: primer par jugable (volador/fuego)
      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.advance(6000);
      expect(h.last("round-started")).toMatchObject({ round: 2, type1: "flying", type2: "fire" });

      h.submit(1, "Beto"); // lo tiene el asiento 2
      h.submit(2, "Beto"); // lo tiene él mismo
      const result = h.last("round-result")!;
      expect(result.results[1].result).toBe("TAKEN");
      expect(result.results[2].result).toBe("ALREADY_OWNED");
      expect(h.state.players[1]?.team).toEqual([1]);
      expect(h.state.players[2]?.team).toEqual([2]);
    });
  });
});
```

`server/test/game/engine.types.test.ts` (elección de tipos del modo elegido):

```ts
import { describe, expect, it } from "vitest";
import { CHOSEN_3, Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // empieza la elección de tipos de la ronda 1

function chosenGame(rng: number[] = []): Harness {
  const h = new Harness({ config: CHOSEN_3, rng });
  h.startGame();
  return h;
}

describe("motor: elección de tipos (modo elegido)", () => {
  it("abre la elección de tipos con un plazo de 15 segundos, sin anunciar todavía el par", () => {
    const h = chosenGame();
    expect(h.state.phase).toBe("choosing_types");
    expect(h.last("choose-types")).toEqual({ round: 1, deadline: T0 + 15_000 });
    expect(h.payloads("round-started")).toHaveLength(0);
    expect(h.pending).toContainEqual({ at: T0 + 15_000, timer: { kind: "choose", round: 1 } });
  });

  it("con dos tipos distintos y jugables, el par sale ordenado y sin aviso", () => {
    const h = chosenGame();
    h.choose(1, "fire");
    expect(h.payloads("type-received", 1)).toEqual([{ round: 1 }]);
    expect(h.state.phase).toBe("choosing_types"); // falta el otro jugador
    h.advance(3000);
    h.choose(2, "flying");

    expect(h.state.phase).toBe("round_active");
    expect(h.last("round-started")).toEqual({ round: 1, type1: "flying", type2: "fire", deadline: T0 + 3000 + 15_000 });
  });

  it("el tipo elegido es secreto: el rival no recibe confirmación de tu elección", () => {
    const h = chosenGame();
    h.choose(1, "fire");
    expect(h.payloads("type-received", 2)).toEqual([]);
  });

  describe("elecciones rechazadas", () => {
    it("INVALID_TYPE para un tipo que no existe", () => {
      const h = chosenGame();
      h.choose(1, "banana");
      h.choose(1, "stellar");
      expect(h.errorCodes(1)).toEqual(["INVALID_TYPE", "INVALID_TYPE"]);
      expect(h.state.round?.typeChoices[1]).toBeUndefined();
    });

    it("ALREADY_CHOSEN si se elige dos veces; se conserva la primera", () => {
      const h = chosenGame();
      h.choose(1, "fire");
      h.choose(1, "water");
      expect(h.errorCodes(1)).toEqual(["ALREADY_CHOSEN"]);
      expect(h.state.round?.typeChoices[1]).toBe("fire");
    });

    it("WRONG_PHASE si se elige fuera de la fase de elección", () => {
      const h = new Harness({ config: CHOSEN_3 });
      h.choose(1, "fire"); // la partida aún no empezó
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE"]);

      h.startGame();
      h.choose(1, "fire");
      h.choose(2, "flying");
      h.choose(1, "water"); // la ronda ya está activa
      expect(h.errorCodes(1)).toEqual(["WRONG_PHASE", "WRONG_PHASE"]);
    });
  });

  describe("pares no válidos: el servidor sortea uno jugable y avisa", () => {
    it("los dos eligen el mismo tipo", () => {
      const h = chosenGame([1]); // entre [volador/fuego, veneno/planta, tierra/agua] el índice 1
      h.choose(1, "fire");
      h.choose(2, "fire");
      expect(h.last("round-started")).toMatchObject({ type1: "poison", type2: "grass", typesNotice: "pair_replaced" });
    });

    it("el par no tiene Pokémon de doble tipo jugables (acero/eléctrico solo tiene uno)", () => {
      const h = chosenGame([2]);
      h.choose(1, "steel");
      h.choose(2, "electric");
      expect(h.last("round-started")).toMatchObject({ type1: "ground", type2: "water", typesNotice: "pair_replaced" });
    });

    it("el par no existe en ningún Pokémon (hielo/siniestro)", () => {
      const h = chosenGame([0]);
      h.choose(1, "ice");
      h.choose(2, "dark");
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", typesNotice: "pair_replaced" });
    });
  });

  describe("tiempo agotado", () => {
    it("a quien no elige se le sortea un tipo; si el par resulta válido no hay aviso", () => {
      const h = chosenGame([2]); // el tipo sorteado es TYPE_NAMES[2] = flying
      h.choose(1, "fire");
      h.advance(15_000);
      expect(h.state.round?.typeChoices[2]).toBe("flying");
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", deadline: T0 + 15_000 + 15_000 });
      expect(h.last("round-started")).not.toHaveProperty("typesNotice");
    });

    it("si nadie elige se sortean los dos tipos", () => {
      const h = chosenGame([9, 2]); // fire y flying
      h.advance(15_000);
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire" });
      expect(h.payloads("round-started")[0]).not.toHaveProperty("typesNotice");
    });

    it("si los tipos sorteados forman un par inválido se sortea un par jugable con aviso", () => {
      const h = chosenGame([0, 0, 0]); // normal y normal → inválido → par jugable índice 0
      h.advance(15_000);
      expect(h.last("round-started")).toMatchObject({ type1: "flying", type2: "fire", typesNotice: "pair_replaced" });
    });
  });

  it("el temporizador de elección que quedó obsoleto no vuelve a resolver la ronda", () => {
    const h = chosenGame();
    h.advance(1000);
    h.choose(1, "fire");
    h.choose(2, "flying"); // se resuelve antes del plazo
    const started = h.payloads("round-started").length;
    h.advance(14_500); // pasa el plazo original de la elección (T0 + 15 s)
    expect(h.payloads("round-started")).toHaveLength(started);
    expect(h.state.phase).toBe("round_active");
    expect(h.state.round?.number).toBe(1);
  });
});
```

`server/test/game/engine.end.test.ts` (fin de la partida):

```ts
import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { fixtureCatalogPokemon } from "../helpers/fixtures.js";
import { Harness, RANDOM_3 } from "./harness.js";

const custom = (overrides: Partial<RoomConfig>): RoomConfig => ({
  typeMode: "random",
  lengthMode: "custom",
  roundsLimit: null,
  statsGoal: null,
  ...overrides,
});

/**
 * Las rondas siguen el orden de los pares: con el rng [0, 1, 0] la ronda 1 es volador/fuego,
 * la 2 tierra/agua (índice 1 de [veneno/planta, tierra/agua]) y la 3 veneno/planta.
 * Totales de cada Pokémon: Alfa 500, Beto 400, Delta 450, Épsilon 350, Zeta 600, Eta 200.
 */
function playRound(h: Harness, a: string, b: string): void {
  h.submit(1, a);
  h.submit(2, b);
  h.advance(6000);
}

describe("motor: fin de la partida", () => {
  it("rondas fijas: se juegan todas y gana quien suma más stats", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
    h.startGame();
    playRound(h, "Alfa", "Beto"); // 500 - 400
    playRound(h, "Delta", "Épsilon"); // 450 - 350  → 950 - 750
    expect(h.state.phase).toBe("round_active");
    h.submit(1, "Eta"); // 200
    h.submit(2, "Zeta"); // 600 → 1150 - 1350

    expect(h.state.phase).toBe("finished");
    const ended = h.last("game-ended")!;
    expect(ended).toMatchObject({ winnerSeat: 2, reason: "completed", totals: { 1: 1150, 2: 1350 } });
    expect(ended.teams[1].map((p) => p.id)).toEqual([1, 4, 7]);
    expect(ended.teams[2].map((p) => p.id)).toEqual([2, 5, 6]);

    const end = h.effectsOfKind("persist_end")[0]!;
    expect(end).toMatchObject({ status: "completed", outcome: { winnerSeat: 2, reason: "completed" }, finalStats: { 1: 1150, 2: 1350 } });
    expect(h.effectsOfKind("persist_round")).toHaveLength(3);
  });

  it("al terminar no programa más rondas y el resultado de la última sale antes del fin", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0, 1, 0] });
    h.startGame();
    playRound(h, "Alfa", "Beto");
    playRound(h, "Delta", "Épsilon");
    h.submit(1, "Eta");
    h.submit(2, "Zeta");
    const names = h.emitted.map((e) => e.event.name);
    expect(names.lastIndexOf("round-result")).toBeLessThan(names.lastIndexOf("game-ended"));
    expect(h.pending.filter((p) => p.timer.kind === "result" && p.timer.round === 3)).toEqual([]);
    const before = h.payloads("round-started").length;
    h.advance(60_000);
    expect(h.payloads("round-started")).toHaveLength(before);
  });

  it("personalizada por rondas: termina al jugarse el máximo; el empate no tiene ganador", () => {
    const h = new Harness({ config: custom({ roundsLimit: 2 }), rng: [0, 1] });
    h.startGame();
    playRound(h, "Alfa", "Beto"); // 500 - 400
    h.submit(1, "Épsilon"); // 350
    h.submit(2, "Delta"); // 450 → 850 - 850

    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: null, reason: "completed", totals: { 1: 850, 2: 850 } });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { winnerSeat: null } });
  });

  describe("personalizada por meta de stats", () => {
    it("termina al final de la ronda en que alguien alcanza la meta", () => {
      const h = new Harness({ config: custom({ statsGoal: 800 }), rng: [0, 1] });
      h.startGame();
      playRound(h, "Alfa", "Beto"); // 500 - 400: nadie llega a 800
      expect(h.state.phase).toBe("round_active");
      h.submit(1, "Delta"); // 950
      h.submit(2, "Épsilon"); // 750

      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 950, 2: 750 } });
    });

    it("si ambos alcanzan la meta en la misma ronda gana quien tiene más", () => {
      const h = new Harness({ config: custom({ statsGoal: 700 }), rng: [0, 1] });
      h.startGame();
      playRound(h, "Alfa", "Beto");
      h.submit(1, "Delta"); // 950
      h.submit(2, "Épsilon"); // 750: también supera 700

      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, totals: { 1: 950, 2: 750 } });
    });

    it("alcanzar la meta a mitad de ronda no corta la ronda: se espera al cierre", () => {
      const h = new Harness({ config: custom({ statsGoal: 500 }), rng: [0] });
      h.startGame();
      h.submit(1, "Alfa"); // ya llega a 500 pero el otro aún no respondió
      expect(h.state.phase).toBe("round_active");
      h.submit(2, "Beto");
      expect(h.state.phase).toBe("finished");
    });
  });

  describe("pares agotados", () => {
    it("si tras una ronda ya no queda ningún par jugable, la partida termina con los totales actuales", () => {
      // Solo el par volador/fuego, con 3 Pokémon: al reclamar 2 queda 1 y deja de ser jugable.
      const catalog = new PokemonCatalog(fixtureCatalogPokemon().filter((p) => p.id <= 3));
      const h = new Harness({ config: RANDOM_3, rng: [0], catalog });
      h.startGame();
      h.submit(1, "Alfa");
      h.submit(2, "Beto");
      h.advance(6000);

      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "exhausted", totals: { 1: 500, 2: 400 } });
      expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { reason: "exhausted" } });
    });

    it("si no hay ningún par jugable desde el principio, termina empatada en la primera ronda", () => {
      const singleTypes = new PokemonCatalog(fixtureCatalogPokemon().filter((p) => p.types.length === 1));
      const h = new Harness({ config: RANDOM_3, catalog: singleTypes });
      h.startGame();
      expect(h.state.phase).toBe("finished");
      expect(h.last("game-ended")).toMatchObject({ winnerSeat: null, reason: "exhausted", totals: { 1: 0, 2: 0 } });
      expect(h.payloads("round-started")).toHaveLength(0);
    });
  });
});
```

`server/test/game/engine.disconnect.test.ts` (desconexiones):

```ts
import { describe, expect, it } from "vitest";
import { Harness, START_TIME } from "./harness.js";

const T0 = START_TIME + 5000; // empieza la ronda 1

function inRound(rng: number[] = [0]): Harness {
  const h = new Harness({ rng });
  h.startGame();
  return h;
}

describe("motor: desconexiones", () => {
  it("al caerse un jugador en plena ronda el rival recibe el aviso con los 30 s de gracia", () => {
    const h = inRound();
    h.advance(2000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });

    expect(h.state.players[2]?.connected).toBe(false);
    const graceEndsAt = T0 + 2000 + 30_000;
    expect(h.payloads("opponent-disconnected", 1)).toEqual([{ graceEndsAt }]);
    expect(h.pending).toContainEqual({ at: graceEndsAt, timer: { kind: "grace", seat: 2, graceEndsAt } });
  });

  it("el reloj de la ronda sigue corriendo: quien se cayó cuenta como sin respuesta", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.submit(1, "Alfa");
    expect(h.state.phase).toBe("round_active"); // se espera al plazo, no al jugador caído
    h.advance(15_000);

    expect(h.state.phase).toBe("round_result");
    const result = h.last("round-result")!;
    expect(result.results[1].result).toBe("VALID");
    expect(result.results[2].result).toBe("NO_ANSWER");
  });

  it("lo que un jugador respondió antes de caerse sí cuenta", () => {
    const h = inRound();
    h.submit(2, "Beto");
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(15_000);
    expect(h.last("round-result")!.results[2]).toMatchObject({ result: "VALID", totalStats: 400 });
  });

  it("si vuelve dentro de la gracia se avisa al rival, recibe su estado y no pierde", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(10_000);
    h.clearEmitted();
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });

    expect(h.state.players[2]?.connected).toBe(true);
    expect(h.state.graceEndsAt[2]).toBeUndefined();
    expect(h.payloads("opponent-reconnected", 1)).toHaveLength(1);
    expect(h.sentState.at(-1)).toBe(2);

    h.advance(25_000); // pasan 35 s desde la caída: el temporizador de gracia vence y debe ignorarse
    expect(h.state.phase).not.toBe("finished");
    expect(h.state.outcome).toBeNull();
  });

  it("si no vuelve en 30 s pierde: gana el rival por desconexión", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(29_999);
    expect(h.state.phase).not.toBe("finished");
    h.advance(1);

    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: 1, reason: "disconnect" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed", outcome: { winnerSeat: 1, reason: "disconnect" } });
  });

  it("si ambos están desconectados al vencer la gracia, la partida queda abandonada sin ganador", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.advance(10_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(20_000); // vence la gracia del asiento 1 con el 2 también caído

    expect(h.state.phase).toBe("finished");
    expect(h.state.outcome).toEqual({ winnerSeat: null, reason: "abandoned" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "abandoned" });
  });

  it("una segunda caída abre una gracia nueva: el temporizador de la primera queda obsoleto", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    h.advance(20_000);
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    h.advance(5_000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 }); // nueva gracia: vence 30 s después
    h.advance(6_000); // aquí vencería la primera (T0 + 30 s) si siguiera vigente
    expect(h.state.phase).not.toBe("finished");
    h.advance(24_000);
    expect(h.state.outcome).toEqual({ winnerSeat: 1, reason: "disconnect" });
  });

  it("también hay gracia si la caída ocurre en la pausa entre rondas", () => {
    const h = inRound();
    h.submit(1, "Alfa");
    h.submit(2, "Beto");
    expect(h.state.phase).toBe("round_result");
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    expect(h.payloads("opponent-disconnected", 2)).toHaveLength(1);
    h.advance(30_000);
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "disconnect" });
  });

  it("salir voluntariamente en plena partida da la victoria al rival al instante", () => {
    const h = inRound();
    h.dispatch({ type: "LEAVE", seat: 1 });
    expect(h.state.phase).toBe("finished");
    expect(h.last("game-ended")).toMatchObject({ winnerSeat: 2, reason: "forfeit" });
    expect(h.effectsOfKind("persist_end")[0]).toMatchObject({ status: "completed" });
  });

  it("desconectarse dos veces seguidas o conectarse estando conectado no cambia nada", () => {
    const h = inRound();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    const pending = h.pending.length;
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    expect(h.pending).toHaveLength(pending);

    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(h.payloads("opponent-reconnected", 2)).toHaveLength(0);
  });
});
```

`server/test/game/view.test.ts` (vistas):

```ts
import { describe, expect, it } from "vitest";
import { buildGameEnded, buildRoomState } from "../../src/game/engine/view.js";
import { CHOSEN_3, Harness, RANDOM_3 } from "./harness.js";

describe("vistas de la partida", () => {
  it("antes de empezar: fase, jugadores y sin ronda", () => {
    const h = new Harness({ config: RANDOM_3 });
    h.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    const view = buildRoomState(h.state, 1, "ABC234", h.catalog);

    expect(view).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, roundsPlayed: 0, round: null, startsAt: null });
    expect(view.players).toEqual([
      { seat: 1, username: "ash", connected: true, totalStats: 0, teamSize: 0 },
      { seat: 2, username: "misty", connected: false, totalStats: 0, teamSize: 0 },
    ]);
    expect(view.myTeam).toEqual([]);
  });

  it("muestra el equipo propio completo pero del rival solo totales y tamaño", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    h.submit(2, "Beto");

    const mine = buildRoomState(h.state, 1, "ABC234", h.catalog);
    expect(mine.myTeam.map((p) => p.id)).toEqual([1]);
    expect(mine.players.find((p) => p.seat === 2)).toMatchObject({ totalStats: 400, teamSize: 1 });
    const json = JSON.stringify(mine);
    expect(json).not.toContain("Beto");
    expect(json).not.toContain("Beta");

    const theirs = buildRoomState(h.state, 2, "ABC234", h.catalog);
    expect(theirs.myTeam.map((p) => p.id)).toEqual([2]);
    expect(JSON.stringify(theirs)).not.toContain("Alfa");
  });

  it("en una ronda activa incluye el par, el plazo y si ya respondí", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.startGame();
    h.submit(1, "Alfa");
    const mine = buildRoomState(h.state, 1, "X", h.catalog);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
    expect(mine.round).toMatchObject({ number: 1, pair: ["flying", "fire"], answered: true, typeChosen: false });
    expect(theirs.round?.answered).toBe(false);
    expect(mine.phase).toBe("round_active");
  });

  it("en la elección de tipos indica si ya elegí, sin revelar el tipo del rival", () => {
    const h = new Harness({ config: CHOSEN_3 });
    h.startGame();
    h.choose(1, "fire");
    const mine = buildRoomState(h.state, 1, "X", h.catalog);
    const theirs = buildRoomState(h.state, 2, "X", h.catalog);
    expect(mine.round).toMatchObject({ pair: null, typeChosen: true });
    expect(theirs.round).toMatchObject({ pair: null, typeChosen: false });
    expect(JSON.stringify(theirs)).not.toContain("fire");
  });

  it("informa la cuenta atrás y la gracia de reconexión del rival", () => {
    const h = new Harness({ config: RANDOM_3, rng: [0] });
    h.seatBoth();
    expect(buildRoomState(h.state, 1, "X", h.catalog).startsAt).toBe(h.state.startsAt);

    h.advance(5000);
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 2 });
    const view = buildRoomState(h.state, 1, "X", h.catalog);
    expect(view.startsAt).toBeNull();
    expect(view.opponentGraceEndsAt).toBe(h.now + 30_000);
    expect(buildRoomState(h.state, 2, "X", h.catalog).opponentGraceEndsAt).toBeNull();
  });

  it("el resumen final incluye los dos equipos completos", () => {
    const h = new Harness({ config: { ...RANDOM_3, roundsLimit: 3 }, rng: [0] });
    h.startGame();
    h.dispatch({ type: "LEAVE", seat: 2 });
    const ended = buildGameEnded(h.state, h.catalog);
    expect(ended).toEqual({ winnerSeat: 1, reason: "forfeit", teams: { 1: [], 2: [] }, totals: { 1: 0, 2: 0 } });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

```bash
npm test -w server -- test/game/engine test/game/view
```

Expected: FAIL — no existen `src/game/engine/engine.js` ni `src/game/engine/view.js`.

- [ ] **Step 3: Implementar las vistas**

`server/src/game/engine/view.ts`:

```ts
import type {
  GameEndedPayload,
  PokemonView,
  RoomPlayerView,
  RoomStateView,
  Seat,
} from "@pokemon-minigames/shared";
import type { CatalogPokemon, PokemonCatalog } from "../../catalog/pokemon-catalog.js";
import { type GameState, SEATS, otherSeat } from "./types.js";

export function toPokemonView(pokemon: CatalogPokemon): PokemonView {
  return {
    id: pokemon.id,
    names: { ...pokemon.names },
    spriteUrl: pokemon.spriteUrl,
    types: [...pokemon.types],
    stats: { ...pokemon.stats },
    totalStats: pokemon.totalStats,
  };
}

export function teamViews(state: GameState, seat: Seat, catalog: PokemonCatalog): PokemonView[] {
  const team = state.players[seat]?.team ?? [];
  return team.flatMap((id) => {
    const pokemon = catalog.get(id);
    return pokemon ? [toPokemonView(pokemon)] : [];
  });
}

/**
 * Estado de la partida para un jugador. Del rival solo revela los totales: los nombres
 * de sus Pokémon se conocen únicamente en `round-result` y `game-ended`.
 */
export function buildRoomState(state: GameState, seat: Seat, code: string, catalog: PokemonCatalog): RoomStateView {
  const players: RoomPlayerView[] = SEATS.flatMap((s) => {
    const player = state.players[s];
    return player
      ? [
          {
            seat: s,
            username: player.username,
            connected: player.connected,
            totalStats: player.totalStats,
            teamSize: player.team.length,
          },
        ]
      : [];
  });

  const activeRound = state.phase === "choosing_types" || state.phase === "round_active" || state.phase === "round_result";
  const round: RoomStateView["round"] =
    activeRound && state.round
      ? {
          number: state.round.number,
          pair: state.round.pair ? [state.round.pair[0], state.round.pair[1]] : null,
          deadline: state.round.deadline,
          answered: state.round.picks[seat] !== undefined,
          typeChosen: state.round.typeChoices[seat] !== undefined,
        }
      : null;

  return {
    code,
    phase: state.phase,
    config: { ...state.config },
    mySeat: seat,
    players,
    myTeam: teamViews(state, seat, catalog),
    roundsPlayed: state.roundsPlayed,
    startsAt: state.phase === "starting" ? state.startsAt : null,
    opponentGraceEndsAt: state.graceEndsAt[otherSeat(seat)] ?? null,
    round,
  };
}

export function buildGameEnded(state: GameState, catalog: PokemonCatalog): GameEndedPayload {
  return {
    winnerSeat: state.outcome?.winnerSeat ?? null,
    reason: state.outcome?.reason ?? "abandoned",
    teams: { 1: teamViews(state, 1, catalog), 2: teamViews(state, 2, catalog) },
    totals: { 1: state.players[1]?.totalStats ?? 0, 2: state.players[2]?.totalStats ?? 0 },
  };
}
```

- [ ] **Step 4: Implementar el motor**

`server/src/game/engine/engine.ts`:

```ts
import { type ErrorCode, type RoomConfig, type RoundPlayerResult, type Seat, type ServerEvent, TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { PokemonCatalog, type TypePair } from "../../catalog/pokemon-catalog.js";
import {
  MIN_POOL_PER_PAIR,
  RECONNECT_GRACE_SECONDS,
  RESULT_PAUSE_SECONDS,
  ROUND_SECONDS,
  SIMULTANEOUS_WINDOW_MS,
  START_COUNTDOWN_SECONDS,
  TYPE_CHOICE_SECONDS,
  WAITING_ROOM_TTL_MINUTES,
  minutes,
  seconds,
} from "../constants.js";
import { pickOne } from "../rng.js";
import { resolveRound } from "./resolve.js";
import {
  type Effect,
  type EngineDeps,
  type GameEvent,
  type GameOutcome,
  type GameState,
  type PlayerState,
  type ReduceResult,
  type RoundRecordPick,
  SEATS,
  type TimerId,
  otherSeat,
} from "./types.js";
import { buildGameEnded, toPokemonView } from "./view.js";

interface Ctx {
  s: GameState;
  fx: Effect[];
  now: number;
  deps: EngineDeps;
}

const ABANDONED_REASONS = new Set(["cancelled", "expired", "abandoned"]);

function newPlayer(seat: Seat, userId: string, username: string): PlayerState {
  return { seat, userId, username, connected: false, totalStats: 0, team: [] };
}

function inGame(s: GameState): boolean {
  return s.phase === "choosing_types" || s.phase === "round_active" || s.phase === "round_result";
}

function emit(c: Ctx, to: Seat | "all", event: ServerEvent): void {
  c.fx.push({ kind: "emit", to, event });
}

function schedule(c: Ctx, at: number, timer: TimerId): void {
  c.fx.push({ kind: "schedule", at, timer });
}

function reject(c: Ctx, seat: Seat, code: ErrorCode, message: string): void {
  emit(c, seat, { name: "error", payload: { code, message } });
}

function claimedIds(s: GameState): Set<number> {
  return new Set(s.owners.keys());
}

function randomPlayablePair(c: Ctx): TypePair | null {
  const pairs = c.deps.catalog.playablePairs(claimedIds(c.s), MIN_POOL_PER_PAIR);
  return pairs.length === 0 ? null : pickOne(c.deps.rng, pairs);
}

/** Estado inicial de una sala recién creada: el creador ocupa el asiento 1. */
export function createGame(
  config: RoomConfig,
  creator: { userId: string; username: string },
  now: number,
): ReduceResult {
  const state: GameState = {
    phase: "waiting",
    config,
    players: { 1: newPlayer(1, creator.userId, creator.username) },
    round: null,
    roundsPlayed: 0,
    owners: new Map(),
    startsAt: null,
    graceEndsAt: {},
    outcome: null,
  };
  return {
    state,
    effects: [{ kind: "schedule", at: now + minutes(WAITING_ROOM_TTL_MINUTES), timer: { kind: "expire" } }],
  };
}

/**
 * Función pura: dado el estado, un evento y la hora, devuelve el estado nuevo y los
 * efectos que el orquestador debe ejecutar. No hace E/S ni mira el reloj.
 */
export function reduce(prev: GameState, event: GameEvent, now: number, deps: EngineDeps): ReduceResult {
  if (prev.phase === "finished") return { state: prev, effects: [] };

  const c: Ctx = { s: structuredClone(prev), fx: [], now, deps };
  switch (event.type) {
    case "PLAYER_JOINED":
      onJoined(c, event.userId, event.username);
      break;
    case "PLAYER_CONNECTED":
      onConnected(c, event.seat);
      break;
    case "PLAYER_DISCONNECTED":
      onDisconnected(c, event.seat);
      break;
    case "CHOOSE_TYPE":
      onChooseType(c, event.seat, event.typeName);
      break;
    case "SUBMIT":
      onSubmit(c, event.seat, event.text);
      break;
    case "LEAVE":
      onLeave(c, event.seat);
      break;
    case "TIMER":
      onTimer(c, event.timer);
      break;
  }
  return { state: c.s, effects: c.fx };
}

// --- Sala y conexiones -------------------------------------------------------------

function onJoined(c: Ctx, userId: string, username: string): void {
  if (c.s.phase !== "waiting" || c.s.players[2]) return;
  c.s.players[2] = newPlayer(2, userId, username);
  c.fx.push({ kind: "persist_seat_taken", userId });
  emit(c, 1, { name: "player-joined", payload: { username } });
}

function onConnected(c: Ctx, seat: Seat): void {
  const player = c.s.players[seat];
  if (!player) return;
  const wasAway = !player.connected;
  player.connected = true;

  if (inGame(c.s) && wasAway) {
    delete c.s.graceEndsAt[seat];
    emit(c, otherSeat(seat), { name: "opponent-reconnected", payload: undefined });
  }
  c.fx.push({ kind: "send_state", to: seat });
  tryStart(c);
}

function tryStart(c: Ctx): void {
  const { s } = c;
  if (s.phase !== "waiting") return;
  const [a, b] = [s.players[1], s.players[2]];
  if (!a || !b || !a.connected || !b.connected) return;

  s.phase = "starting";
  s.startsAt = c.now + seconds(START_COUNTDOWN_SECONDS);
  emit(c, "all", { name: "game-starting", payload: { startsAt: s.startsAt } });
  schedule(c, s.startsAt, { kind: "start", startsAt: s.startsAt });
}

function onDisconnected(c: Ctx, seat: Seat): void {
  const { s } = c;
  const player = s.players[seat];
  if (!player || !player.connected) return;
  player.connected = false;

  if (s.phase === "starting") {
    // La cuenta atrás se cancela: el temporizador `start` queda obsoleto.
    s.phase = "waiting";
    s.startsAt = null;
    return;
  }
  if (inGame(s)) {
    const graceEndsAt = c.now + seconds(RECONNECT_GRACE_SECONDS);
    s.graceEndsAt[seat] = graceEndsAt;
    emit(c, otherSeat(seat), { name: "opponent-disconnected", payload: { graceEndsAt } });
    schedule(c, graceEndsAt, { kind: "grace", seat, graceEndsAt });
  }
}

function onLeave(c: Ctx, seat: Seat): void {
  const { s } = c;
  if (s.phase === "waiting" || s.phase === "starting") {
    if (seat === 1) {
      finish(c, "cancelled", null);
    } else if (s.players[2]) {
      // Quien se unió se va antes de empezar: el asiento 2 queda libre.
      delete s.players[2];
      s.phase = "waiting";
      s.startsAt = null;
      c.fx.push({ kind: "persist_seat_freed" });
      c.fx.push({ kind: "send_state", to: 1 });
    }
    return;
  }
  if (inGame(s)) finish(c, "forfeit", otherSeat(seat));
}

// --- Temporizadores --------------------------------------------------------------------

function onTimer(c: Ctx, timer: TimerId): void {
  const { s } = c;
  switch (timer.kind) {
    case "expire":
      if (s.phase === "waiting") finish(c, "expired", null);
      break;
    case "start":
      if (s.phase === "starting" && s.startsAt === timer.startsAt) {
        c.fx.push({ kind: "persist_started" });
        beginRound(c, 1);
      }
      break;
    case "choose":
      if (s.phase === "choosing_types" && s.round?.number === timer.round) resolveTypes(c);
      break;
    case "round":
      if (s.phase === "round_active" && s.round?.number === timer.round) closeRound(c);
      break;
    case "result":
      if (s.phase === "round_result" && s.round?.number === timer.round) beginRound(c, timer.round + 1);
      break;
    case "grace": {
      const player = s.players[timer.seat];
      if (inGame(s) && player && !player.connected && s.graceEndsAt[timer.seat] === timer.graceEndsAt) {
        const other = otherSeat(timer.seat);
        if (s.players[other]?.connected) finish(c, "disconnect", other);
        else finish(c, "abandoned", null);
      }
      break;
    }
  }
}

// --- Rondas ----------------------------------------------------------------------------

function beginRound(c: Ctx, number: number): void {
  const { s } = c;
  const pairs = c.deps.catalog.playablePairs(claimedIds(s), MIN_POOL_PER_PAIR);
  if (pairs.length === 0) {
    finish(c, "exhausted");
    return;
  }

  s.round = { number, typeChoices: {}, pair: null, deadline: null, picks: {} };
  if (s.config.typeMode === "chosen") {
    s.phase = "choosing_types";
    s.round.deadline = c.now + seconds(TYPE_CHOICE_SECONDS);
    emit(c, "all", { name: "choose-types", payload: { round: number, deadline: s.round.deadline } });
    schedule(c, s.round.deadline, { kind: "choose", round: number });
  } else {
    startActive(c, pickOne(c.deps.rng, pairs), false);
  }
}

function onChooseType(c: Ctx, seat: Seat, typeName: string): void {
  const { s } = c;
  const round = s.round;
  if (s.phase !== "choosing_types" || !round || (round.deadline !== null && c.now > round.deadline)) {
    reject(c, seat, "WRONG_PHASE", "Ahora no se puede elegir un tipo");
    return;
  }
  if (!(TYPE_NAMES as readonly string[]).includes(typeName)) {
    reject(c, seat, "INVALID_TYPE", "Ese tipo no existe");
    return;
  }
  if (round.typeChoices[seat]) {
    reject(c, seat, "ALREADY_CHOSEN", "Ya elegiste un tipo en esta ronda");
    return;
  }
  round.typeChoices[seat] = typeName as TypeName;
  emit(c, seat, { name: "type-received", payload: { round: round.number } });
  if (round.typeChoices[1] && round.typeChoices[2]) resolveTypes(c);
}

/** Cierra la elección de tipos: rellena con azar a quien no eligió y valida el par. */
function resolveTypes(c: Ctx): void {
  const { s } = c;
  const round = s.round!;
  for (const seat of SEATS) {
    round.typeChoices[seat] ??= pickOne(c.deps.rng, TYPE_NAMES);
  }
  const a = round.typeChoices[1]!;
  const b = round.typeChoices[2]!;

  if (a !== b) {
    const pair = PokemonCatalog.orderPair(a, b);
    if (c.deps.catalog.poolSize(pair, claimedIds(s)) >= MIN_POOL_PER_PAIR) {
      startActive(c, pair, false);
      return;
    }
  }
  const replacement = randomPlayablePair(c);
  if (!replacement) {
    finish(c, "exhausted");
    return;
  }
  startActive(c, replacement, true);
}

function startActive(c: Ctx, pair: TypePair, replaced: boolean): void {
  const { s } = c;
  const round = s.round!;
  s.phase = "round_active";
  round.pair = pair;
  round.deadline = c.now + seconds(ROUND_SECONDS);
  emit(c, "all", {
    name: "round-started",
    payload: {
      round: round.number,
      type1: pair[0],
      type2: pair[1],
      deadline: round.deadline,
      ...(replaced ? { typesNotice: "pair_replaced" as const } : {}),
    },
  });
  schedule(c, round.deadline, { kind: "round", round: round.number });
}

function onSubmit(c: Ctx, seat: Seat, text: string): void {
  const { s } = c;
  const round = s.round;
  if (s.phase !== "round_active" || !round || (round.deadline !== null && c.now > round.deadline)) {
    reject(c, seat, "WRONG_PHASE", "Ahora no se pueden enviar respuestas");
    return;
  }
  if (round.picks[seat]) {
    reject(c, seat, "ALREADY_ANSWERED", "Ya enviaste tu respuesta en esta ronda");
    return;
  }
  round.picks[seat] = { text, at: c.now };
  emit(c, seat, { name: "answer-received", payload: { round: round.number } });
  if (round.picks[1] && round.picks[2]) closeRound(c);
}

function closeRound(c: Ctx): void {
  const { s } = c;
  const round = s.round!;
  const pair = round.pair!;
  const outcomes = resolveRound({
    pair,
    picks: round.picks,
    owners: s.owners,
    catalog: c.deps.catalog,
    rng: c.deps.rng,
    windowMs: SIMULTANEOUS_WINDOW_MS,
  });

  const results = {} as Record<Seat, RoundPlayerResult>;
  const records: RoundRecordPick[] = [];
  for (const seat of SEATS) {
    const player = s.players[seat]!;
    const outcome = outcomes[seat];
    const pick = round.picks[seat];
    const pokemon = outcome.pokemonId !== null ? c.deps.catalog.get(outcome.pokemonId) : undefined;

    if (pokemon) {
      s.owners.set(pokemon.id, seat);
      player.team.push(pokemon.id);
      player.totalStats += pokemon.totalStats;
    }
    results[seat] = {
      seat,
      result: outcome.result,
      text: pick?.text ?? null,
      pokemon: pokemon ? toPokemonView(pokemon) : null,
      totalStats: player.totalStats,
      teamSize: player.team.length,
    };
    records.push({
      seat,
      userId: player.userId,
      text: pick?.text ?? null,
      result: outcome.result,
      pokemonId: pokemon?.id ?? null,
      submittedAt: pick?.at ?? null,
    });
  }

  s.roundsPlayed = round.number;
  emit(c, "all", { name: "round-result", payload: { round: round.number, type1: pair[0], type2: pair[1], results } });
  c.fx.push({ kind: "persist_round", record: { number: round.number, pair, picks: records } });

  if (gameIsOver(s)) {
    finish(c, "completed");
  } else {
    s.phase = "round_result";
    schedule(c, c.now + seconds(RESULT_PAUSE_SECONDS), { kind: "result", round: round.number });
  }
}

function gameIsOver(s: GameState): boolean {
  const { roundsLimit, statsGoal } = s.config;
  if (roundsLimit !== null && s.roundsPlayed >= roundsLimit) return true;
  if (statsGoal !== null) {
    return SEATS.some((seat) => (s.players[seat]?.totalStats ?? 0) >= statsGoal);
  }
  return false;
}

// --- Fin de la partida -----------------------------------------------------------------

function winnerByStats(s: GameState): Seat | null {
  const one = s.players[1]?.totalStats ?? 0;
  const two = s.players[2]?.totalStats ?? 0;
  if (one === two) return null;
  return one > two ? 1 : 2;
}

function finish(c: Ctx, reason: GameOutcome["reason"], forcedWinner?: Seat | null): void {
  const { s } = c;
  const winnerSeat = forcedWinner !== undefined ? forcedWinner : winnerByStats(s);
  s.phase = "finished";
  s.outcome = { winnerSeat, reason };

  emit(c, "all", { name: "game-ended", payload: buildGameEnded(s, c.deps.catalog) });
  const finalStats: Partial<Record<Seat, number>> = {};
  for (const seat of SEATS) {
    const player = s.players[seat];
    if (player) finalStats[seat] = player.totalStats;
  }
  c.fx.push({
    kind: "persist_end",
    status: ABANDONED_REASONS.has(reason) ? "abandoned" : "completed",
    outcome: s.outcome,
    finalStats,
  });
}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

```bash
npm test -w server -- test/game
npm run typecheck
```

Expected: PASS — `engine.lobby` 14, `engine.rounds` 14, `engine.types` 13, `engine.end` 8, `engine.disconnect` 10, `view` 6 (más `resolve` 13 y `rng` 5) y `tsc` sin errores.

- [ ] **Step 6: Comprobar que las pruebas detectan fallos (técnica de la etapa 1)**

Rompe a propósito, una por una, cada protección crítica, ejecuta `npm test -w server -- test/game` y confirma que **falla al menos una prueba**; después restaura el archivo (`git checkout -- server/src/game/engine`). En `server/src/game/engine/engine.ts`:

1. Quitar `&& s.startsAt === timer.startsAt` del caso `"start"` → debe fallar "el temporizador de una cuenta atrás cancelada no adelanta la cuenta atrás nueva".
2. Quitar `&& s.graceEndsAt[timer.seat] === timer.graceEndsAt` del caso `"grace"` → debe fallar "una segunda caída abre una gracia nueva".
3. Quitar `&& s.round?.number === timer.round` del caso `"round"` → debe fallar "el temporizador de la ronda anterior no cierra la ronda siguiente antes de tiempo".

En `server/src/game/engine/resolve.ts`: 4. cambiar `<` por `<=` en `Math.abs(at1 - at2) < windowMs` → debe fallar "499 ms es simultáneo y 500 ms ya no lo es".

Expected: las cuatro roturas hacen fallar una prueba; tras restaurar, vuelve a pasar todo.

- [ ] **Step 7: Commit**

```bash
git status --short   # solo deben aparecer los archivos de esta tarea
git add -A
git commit -m "feat(game): motor de juego puro con rondas, tipos, fin de partida y desconexiones" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Orquestador `GameRoom`, puertos y repositorio de Prisma

**Files:**
- Create: `server/src/game/ports.ts`, `server/src/game/room.ts`, `server/src/game/prisma-game-repository.ts`
- Test: `server/test/game/fakes.ts`, `server/test/game/room.test.ts`, `server/test/game/prisma-game-repository.test.ts`

**Interfaces:**
- Consumes: el motor (Task 5), `PokemonCatalog` (Task 3), `Rng` (Task 2), `RoundRecord` (Task 4), `typeId` (etapa 1), `PrismaClient`, helpers `prisma`/`resetCatalog`/`resetDatabase`, `fixtureSnapshot`.
- Produces (`ports.ts`): `Clock { now() }`, `Scheduler { schedule(delayMs, fn): () => void }`, `Broadcaster { toSeat(code, seat, event), toAll(code, event) }`, `FinishInput { status, winnerUserId, finalStats }`, `GameRepository { createGame({ roomCode, config, creatorUserId }): Promise<gameId>, addSecondPlayer, removeSecondPlayer, markStarted, saveRound, finish, abandonUnfinished(): Promise<number> }`, `systemClock`, `timerScheduler` (con `unref`).
- Produces (`room.ts`): `GameRoomPorts { clock, scheduler, broadcaster, repository, catalog, rng, logger?, persistAttempts?, persistRetryDelayMs? }`, `RoomUser { userId, username }`, `class GameRoom` con `static create(ports, { code, gameId, config, creator })`, `code`, `phase`, `config`, `seatOf(userId)`, `hasSeat(seat)`, `playerCount()`, `creatorName()`, `view(seat)`, `onFinished(listener)`, `idle()`, `dispatch(event)`. Las escrituras se encadenan (una a la vez, en orden), se reintentan y, si fallan siempre, se registran sin detener la partida. Al terminar cancela sus temporizadores y avisa una sola vez.
- Produces (`prisma-game-repository.ts`): `createPrismaGameRepository(prisma): GameRepository`; `saveRound` es una transacción; `finish` actualiza la partida y `final_stats` por asiento; `abandonUnfinished` pasa `waiting`/`in_progress` a `abandoned`.
- Produces (prueba): `FakeTime` (reloj + planificador simulado con `advance`, `pendingCount`), `RecordingBroadcaster` (`sent`, `payloads`, `last`), `FakeRepository` (graba `calls` y `timeline`; `failures` y `delays` inyectables).

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/game/fakes.ts`:

```ts
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
```

`server/test/game/room.test.ts`:

```ts
import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { GameRoom } from "../../src/game/room.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

const ONE_ROUND: RoomConfig = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null };
const creator = { userId: "u1", username: "ash" };

function setup(config: RoomConfig = ONE_ROUND, rng: number[] = [0]) {
  const time = new FakeTime();
  const broadcaster = new RecordingBroadcaster();
  const repository = new FakeRepository();
  const logger = { error: vi.fn() };
  const room = GameRoom.create(
    {
      clock: time,
      scheduler: time,
      broadcaster,
      repository,
      catalog: fixtureCatalog(),
      rng: sequenceRng(rng),
      logger,
      persistAttempts: 3,
      persistRetryDelayMs: 0,
    },
    { code: "ABC234", gameId: "game-1", config, creator },
  );
  return { room, time, broadcaster, repository, logger };
}

function startGame(room: GameRoom, time: FakeTime) {
  room.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
  room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  time.advance(5000);
}

describe("GameRoom", () => {
  it("expone quién participa y en qué asiento", () => {
    const { room } = setup();
    expect(room.code).toBe("ABC234");
    expect(room.seatOf("u1")).toBe(1);
    expect(room.seatOf("u2")).toBeUndefined();
    expect(room.playerCount()).toBe(1);
    expect(room.creatorName()).toBe("ash");

    room.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty" });
    expect(room.seatOf("u2")).toBe(2);
    expect(room.playerCount()).toBe(2);
    expect(room.hasSeat(2)).toBe(true);
  });

  it("al conectarse un jugador se le envía su estado completo", () => {
    const { room, broadcaster } = setup();
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    const state = broadcaster.last("room-state", 1)!;
    expect(state).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1, round: null });
    expect(state.players).toHaveLength(1);
  });

  it("juega una partida completa usando solo los temporizadores y guarda todo en orden", async () => {
    const { room, time, broadcaster, repository } = setup();
    startGame(room, time);
    expect(broadcaster.last("round-started")).toMatchObject({ round: 1, type1: "flying", type2: "fire" });

    room.dispatch({ type: "SUBMIT", seat: 1, text: "Alfa" });
    time.advance(15_000); // el asiento 2 no responde: vence el plazo
    expect(room.phase).toBe("finished");

    const ended = broadcaster.last("game-ended")!;
    expect(ended).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 500, 2: 0 } });

    await room.idle();
    expect(repository.calls).toEqual(["addSecondPlayer:u2", "markStarted", "saveRound:1", "finish:completed"]);
    expect(repository.rounds[0]!.picks.map((p) => p.result)).toEqual(["VALID", "NO_ANSWER"]);
    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: "u1", finalStats: { 1: 500, 2: 0 } });
  });

  it("un empate se guarda sin ganador", async () => {
    const { room, time, repository } = setup();
    startGame(room, time);
    time.advance(15_000); // nadie responde
    await room.idle();
    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: null, finalStats: { 1: 0, 2: 0 } });
  });

  it("al terminar cancela los temporizadores pendientes y avisa una sola vez", () => {
    const { room, time } = setup();
    const onFinished = vi.fn();
    room.onFinished(onFinished);
    startGame(room, time);
    expect(time.pendingCount).toBeGreaterThan(0);

    room.dispatch({ type: "LEAVE", seat: 2 });
    expect(room.phase).toBe("finished");
    expect(time.pendingCount).toBe(0);
    expect(onFinished).toHaveBeenCalledTimes(1);

    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("una sala que nadie completa caduca sola a los 10 minutos", async () => {
    const { room, time, repository } = setup();
    const onFinished = vi.fn();
    room.onFinished(onFinished);
    time.advance(10 * 60 * 1000);
    expect(room.phase).toBe("finished");
    expect(onFinished).toHaveBeenCalledTimes(1);
    await room.idle();
    expect(repository.finishInput).toMatchObject({ status: "abandoned", winnerUserId: null });
  });

  describe("guardado en la base de datos", () => {
    it("reintenta una escritura que falla y la deja hecha", async () => {
      const { room, time, repository, logger } = setup();
      repository.failures.saveRound = 2;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();
      expect(repository.calls).toContain("saveRound:1");
      expect(repository.timeline.filter((e) => e === "saveRound:fail")).toHaveLength(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("si una escritura falla siempre, se registra el error y el resto se sigue guardando", async () => {
      const { room, time, repository, logger } = setup();
      repository.failures.saveRound = 99;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();

      expect(room.phase).toBe("finished"); // la partida no se detuvo
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0]![0]).toContain("guardar la ronda 1");
      expect(repository.calls).not.toContain("saveRound:1");
      expect(repository.calls).toContain("finish:completed");
    });

    it("las escrituras no se solapan aunque una sea lenta: cada una espera a la anterior", async () => {
      const { room, time, repository } = setup();
      repository.delays.saveRound = 30;
      startGame(room, time);
      time.advance(15_000);
      await room.idle();

      const timeline = repository.timeline.filter((e) => e.startsWith("saveRound") || e.startsWith("finish"));
      expect(timeline).toEqual(["saveRound:start", "saveRound:end", "finish:start", "finish:end"]);
    });
  });

  it("ignora un temporizador viejo que se dispara tras terminar la partida", () => {
    const { room, time, broadcaster } = setup();
    startGame(room, time);
    room.dispatch({ type: "LEAVE", seat: 1 });
    const sentBefore = broadcaster.sent.length;
    time.advance(60_000);
    expect(broadcaster.sent).toHaveLength(sentBefore);
  });
});
```

`server/test/game/prisma-game-repository.test.ts`:

```ts
import type { RoomConfig } from "@pokemon-minigames/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import type { RoundRecord } from "../../src/game/engine/types.js";
import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";

const repository = createPrismaGameRepository(prisma);
const config: RoomConfig = { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1500 };

let ash: string;
let misty: string;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  ash = (await prisma.user.create({ data: { email: "a@example.com", username: "ash", passwordHash: "h" } })).id;
  misty = (await prisma.user.create({ data: { email: "m@example.com", username: "misty", passwordHash: "h" } })).id;
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

const sampleRound = (): RoundRecord => ({
  number: 1,
  pair: ["flying", "fire"],
  picks: [
    { seat: 1, userId: ash, text: "Alfa", result: "VALID", pokemonId: 1, submittedAt: 1_700_000_000_123 },
    { seat: 2, userId: misty, text: null, result: "NO_ANSWER", pokemonId: null, submittedAt: null },
  ],
});

describe("createPrismaGameRepository", () => {
  it("createGame crea la partida en espera con el creador en el asiento 1", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: true } });
    expect(game).toMatchObject({
      roomCode: "ABC234",
      typeMode: "chosen",
      lengthMode: "custom",
      roundsLimit: null,
      statsGoal: 1500,
      status: "waiting",
      winnerId: null,
      endedAt: null,
    });
    expect(game.players).toEqual([expect.objectContaining({ userId: ash, seat: 1, finalStats: null })]);
  });

  it("rechaza un código de sala repetido", async () => {
    await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await expect(repository.createGame({ roomCode: "ABC234", config, creatorUserId: misty })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("addSecondPlayer y removeSecondPlayer manejan el asiento 2", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    expect(await prisma.gamePlayer.count({ where: { gameId: id } })).toBe(2);
    await repository.removeSecondPlayer(id);
    const players = await prisma.gamePlayer.findMany({ where: { gameId: id } });
    expect(players.map((p) => p.seat)).toEqual([1]);
  });

  it("markStarted pasa la partida a in_progress", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.markStarted(id);
    expect((await prisma.game.findUniqueOrThrow({ where: { id } })).status).toBe("in_progress");
  });

  it("saveRound guarda la ronda con el par ordenado y una fila por jugador", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    await repository.saveRound(id, sampleRound());

    const round = await prisma.round.findFirstOrThrow({
      where: { gameId: id },
      include: { picks: { orderBy: { result: "asc" } }, type1: true, type2: true },
    });
    expect(round.number).toBe(1);
    expect([round.type1.name, round.type2.name]).toEqual(["flying", "fire"]);
    expect(round.type1Id).toBeLessThan(round.type2Id);

    const valid = round.picks.find((p) => p.result === "VALID")!;
    expect(valid).toMatchObject({ userId: ash, submittedText: "Alfa", pokemonId: 1 });
    expect(valid.submittedAt?.getTime()).toBe(1_700_000_000_123);
    const none = round.picks.find((p) => p.result === "NO_ANSWER")!;
    expect(none).toMatchObject({ userId: misty, submittedText: null, pokemonId: null, submittedAt: null });
  });

  it("saveRound es atómico: si una respuesta es inválida no queda la ronda a medias", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    const broken = sampleRound();
    broken.picks[0]!.pokemonId = 999_999; // Pokémon que no existe: viola la clave foránea
    await expect(repository.saveRound(id, broken)).rejects.toThrow();
    expect(await prisma.round.count({ where: { gameId: id } })).toBe(0);
  });

  it("finish guarda el resultado, el ganador y los stats finales por asiento", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.addSecondPlayer(id, misty);
    await repository.finish(id, { status: "completed", winnerUserId: misty, finalStats: { 1: 900, 2: 1200 } });

    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: { orderBy: { seat: "asc" } } } });
    expect(game).toMatchObject({ status: "completed", winnerId: misty });
    expect(game.endedAt).toBeInstanceOf(Date);
    expect(game.players.map((p) => p.finalStats)).toEqual([900, 1200]);
  });

  it("finish de una partida abandonada no tiene ganador y solo actualiza los asientos que existen", async () => {
    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
    await repository.finish(id, { status: "abandoned", winnerUserId: null, finalStats: { 1: 0 } });
    const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: true } });
    expect(game).toMatchObject({ status: "abandoned", winnerId: null });
    expect(game.players).toHaveLength(1);
  });

  it("abandonUnfinished marca como abandonadas solo las partidas en espera o en curso", async () => {
    const waiting = await repository.createGame({ roomCode: "AAAAAA", config, creatorUserId: ash });
    const playing = await repository.createGame({ roomCode: "BBBBBB", config, creatorUserId: misty });
    await repository.markStarted(playing);
    const done = await prisma.game.create({
      data: { roomCode: "CCCCCC", typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, status: "completed" },
    });

    await expect(repository.abandonUnfinished()).resolves.toBe(2);

    const status = async (id: string) => (await prisma.game.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(waiting)).toBe("abandoned");
    expect(await status(playing)).toBe("abandoned");
    expect(await status(done.id)).toBe("completed");
    expect((await prisma.game.findUniqueOrThrow({ where: { id: waiting } })).endedAt).toBeInstanceOf(Date);
    await expect(repository.abandonUnfinished()).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

```bash
npm test -w server -- test/game/room.test.ts test/game/prisma-game-repository.test.ts
```

Expected: FAIL — no existen `src/game/room.js`, `src/game/ports.js` ni `src/game/prisma-game-repository.js`.

- [ ] **Step 3: Implementar**

`server/src/game/ports.ts`:

```ts
import type { RoomConfig, Seat, ServerEvent } from "@pokemon-minigames/shared";
import type { RoundRecord } from "./engine/types.js";

/** Reloj inyectable: en las pruebas se controla a mano. */
export interface Clock {
  now(): number;
}

/** Programa una función para más tarde y devuelve cómo cancelarla. */
export interface Scheduler {
  schedule(delayMs: number, fn: () => void): () => void;
}

/** Envía eventos a los jugadores de una sala. Quién recibe qué lo decide la sala, no el transporte. */
export interface Broadcaster {
  toSeat(code: string, seat: Seat, event: ServerEvent): void;
  toAll(code: string, event: ServerEvent): void;
}

export interface FinishInput {
  status: "completed" | "abandoned";
  winnerUserId: string | null;
  finalStats: Partial<Record<Seat, number>>;
}

export interface GameRepository {
  /** Crea la partida en `waiting` con el creador en el asiento 1 y devuelve su id. */
  createGame(input: { roomCode: string; config: RoomConfig; creatorUserId: string }): Promise<string>;
  addSecondPlayer(gameId: string, userId: string): Promise<void>;
  removeSecondPlayer(gameId: string): Promise<void>;
  markStarted(gameId: string): Promise<void>;
  saveRound(gameId: string, round: RoundRecord): Promise<void>;
  finish(gameId: string, input: FinishInput): Promise<void>;
  /** Marca como abandonadas las partidas que quedaron `waiting` o `in_progress` (p. ej. tras reiniciar). */
  abandonUnfinished(): Promise<number>;
}

export const systemClock: Clock = { now: () => Date.now() };

export const timerScheduler: Scheduler = {
  schedule(delayMs, fn) {
    const timer = setTimeout(fn, delayMs);
    // Un temporizador pendiente no debe impedir que el proceso termine.
    timer.unref();
    return () => clearTimeout(timer);
  },
};
```

`server/src/game/room.ts`:

```ts
import type { RoomConfig, RoomStateView, Seat } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { createGame, reduce } from "./engine/engine.js";
import {
  type Effect,
  type GameEvent,
  type GameState,
  type RoundRecord,
  SEATS,
} from "./engine/types.js";
import { buildRoomState } from "./engine/view.js";
import type { Broadcaster, Clock, GameRepository, Scheduler } from "./ports.js";
import type { Rng } from "./rng.js";

export interface GameRoomPorts {
  clock: Clock;
  scheduler: Scheduler;
  broadcaster: Broadcaster;
  repository: GameRepository;
  catalog: PokemonCatalog;
  rng: Rng;
  logger?: { error(message: string, error?: unknown): void };
  /** Intentos para guardar en la base de datos antes de rendirse (por defecto 3). */
  persistAttempts?: number;
  persistRetryDelayMs?: number;
}

export interface RoomUser {
  userId: string;
  username: string;
}

/**
 * Una sala en ejecución: recibe eventos (de sockets o temporizadores), se los pasa al
 * motor puro y ejecuta los efectos que este devuelve.
 */
export class GameRoom {
  private state: GameState;
  private readonly timers = new Set<() => void>();
  private persistChain: Promise<void> = Promise.resolve();
  private readonly finishListeners: Array<() => void> = [];
  private finishedNotified = false;

  private constructor(
    private readonly ports: GameRoomPorts,
    readonly code: string,
    private readonly gameId: string,
    state: GameState,
  ) {
    this.state = state;
  }

  static create(
    ports: GameRoomPorts,
    input: { code: string; gameId: string; config: RoomConfig; creator: RoomUser },
  ): GameRoom {
    const { state, effects } = createGame(input.config, input.creator, ports.clock.now());
    const room = new GameRoom(ports, input.code, input.gameId, state);
    room.execute(effects);
    return room;
  }

  get phase(): GameState["phase"] {
    return this.state.phase;
  }

  get config(): RoomConfig {
    return this.state.config;
  }

  seatOf(userId: string): Seat | undefined {
    return SEATS.find((seat) => this.state.players[seat]?.userId === userId);
  }

  hasSeat(seat: Seat): boolean {
    return this.state.players[seat] !== undefined;
  }

  playerCount(): number {
    return SEATS.filter((seat) => this.state.players[seat] !== undefined).length;
  }

  creatorName(): string {
    return this.state.players[1]?.username ?? "";
  }

  view(seat: Seat): RoomStateView {
    return buildRoomState(this.state, seat, this.code, this.ports.catalog);
  }

  /** Se llama una sola vez, cuando la partida termina por cualquier motivo. */
  onFinished(listener: () => void): void {
    this.finishListeners.push(listener);
  }

  /** Espera a que termine lo que quede por guardar en la base de datos. */
  idle(): Promise<void> {
    return this.persistChain;
  }

  dispatch(event: GameEvent): void {
    const result = reduce(this.state, event, this.ports.clock.now(), {
      catalog: this.ports.catalog,
      rng: this.ports.rng,
    });
    this.state = result.state;
    this.execute(result.effects);

    if (this.state.phase === "finished" && !this.finishedNotified) {
      this.finishedNotified = true;
      for (const cancel of this.timers) cancel();
      this.timers.clear();
      for (const listener of this.finishListeners) listener();
    }
  }

  private execute(effects: Effect[]): void {
    const { broadcaster, clock, scheduler, repository } = this.ports;
    for (const effect of effects) {
      switch (effect.kind) {
        case "schedule": {
          const cancel = scheduler.schedule(Math.max(0, effect.at - clock.now()), () => {
            this.timers.delete(cancel);
            this.dispatch({ type: "TIMER", timer: effect.timer });
          });
          this.timers.add(cancel);
          break;
        }
        case "emit":
          if (effect.to === "all") broadcaster.toAll(this.code, effect.event);
          else broadcaster.toSeat(this.code, effect.to, effect.event);
          break;
        case "send_state":
          broadcaster.toSeat(this.code, effect.to, { name: "room-state", payload: this.view(effect.to) });
          break;
        case "persist_seat_taken":
          this.persist("unir al segundo jugador", () => repository.addSecondPlayer(this.gameId, effect.userId));
          break;
        case "persist_seat_freed":
          this.persist("liberar el asiento 2", () => repository.removeSecondPlayer(this.gameId));
          break;
        case "persist_started":
          this.persist("marcar el inicio", () => repository.markStarted(this.gameId));
          break;
        case "persist_round": {
          const record: RoundRecord = effect.record;
          this.persist(`guardar la ronda ${record.number}`, () => repository.saveRound(this.gameId, record));
          break;
        }
        case "persist_end": {
          const winner = effect.outcome.winnerSeat;
          const winnerUserId = winner ? (this.state.players[winner]?.userId ?? null) : null;
          this.persist("guardar el final", () =>
            repository.finish(this.gameId, {
              status: effect.status,
              winnerUserId,
              finalStats: effect.finalStats,
            }),
          );
          break;
        }
      }
    }
  }

  /**
   * Encola una escritura. Se ejecutan de una en una y en orden (la ronda 2 nunca se guarda
   * antes que la ronda 1). Un fallo se reintenta y, si persiste, se registra: la partida en
   * curso nunca se detiene por un problema de guardado.
   */
  private persist(label: string, operation: () => Promise<void>): void {
    this.persistChain = this.persistChain.then(async () => {
      const attempts = this.ports.persistAttempts ?? 3;
      const delay = this.ports.persistRetryDelayMs ?? 500;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          await operation();
          return;
        } catch (error) {
          if (attempt === attempts) {
            this.ports.logger?.error(`No se pudo guardar (${label}) en la sala ${this.code}`, error);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    });
  }
}
```

`server/src/game/prisma-game-repository.ts`:

```ts
import type { PrismaClient } from "../db/prisma.js";
import { typeId } from "../catalog/snapshot.js";
import type { FinishInput, GameRepository } from "./ports.js";
import type { RoundRecord } from "./engine/types.js";

export function createPrismaGameRepository(prisma: PrismaClient): GameRepository {
  return {
    async createGame({ roomCode, config, creatorUserId }) {
      const game = await prisma.game.create({
        data: {
          roomCode,
          typeMode: config.typeMode,
          lengthMode: config.lengthMode,
          roundsLimit: config.roundsLimit,
          statsGoal: config.statsGoal,
          status: "waiting",
          players: { create: { userId: creatorUserId, seat: 1 } },
        },
        select: { id: true },
      });
      return game.id;
    },

    async addSecondPlayer(gameId, userId) {
      await prisma.gamePlayer.create({ data: { gameId, userId, seat: 2 } });
    },

    async removeSecondPlayer(gameId) {
      await prisma.gamePlayer.deleteMany({ where: { gameId, seat: 2 } });
    },

    async markStarted(gameId) {
      await prisma.game.update({ where: { id: gameId }, data: { status: "in_progress" } });
    },

    async saveRound(gameId, round: RoundRecord) {
      await prisma.$transaction(async (tx) => {
        // El par ya llega ordenado y el id de un tipo es su posición + 1, así que type1Id < type2Id.
        const created = await tx.round.create({
          data: { gameId, number: round.number, type1Id: typeId(round.pair[0]), type2Id: typeId(round.pair[1]) },
          select: { id: true },
        });
        await tx.roundPick.createMany({
          data: round.picks.map((pick) => ({
            roundId: created.id,
            userId: pick.userId,
            submittedText: pick.text,
            result: pick.result,
            pokemonId: pick.pokemonId,
            submittedAt: pick.submittedAt === null ? null : new Date(pick.submittedAt),
          })),
        });
      });
    },

    async finish(gameId, input: FinishInput) {
      await prisma.$transaction(async (tx) => {
        await tx.game.update({
          where: { id: gameId },
          data: { status: input.status, winnerId: input.winnerUserId, endedAt: new Date() },
        });
        for (const seat of [1, 2] as const) {
          const finalStats = input.finalStats[seat];
          if (finalStats !== undefined) {
            await tx.gamePlayer.updateMany({ where: { gameId, seat }, data: { finalStats } });
          }
        }
      });
    },

    async abandonUnfinished() {
      const result = await prisma.game.updateMany({
        where: { status: { in: ["waiting", "in_progress"] } },
        data: { status: "abandoned", endedAt: new Date() },
      });
      return result.count;
    },
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

```bash
npm test -w server -- test/game/room.test.ts test/game/prisma-game-repository.test.ts
npm run typecheck
```

Expected: PASS (`room` 10 y `prisma-game-repository` 9) y `tsc` sin errores.

- [ ] **Step 5: Comprobar que las pruebas detectan fallos**

En `server/src/game/room.ts`, cambiar `this.persistChain = this.persistChain.then(async () => {` por `this.persistChain = Promise.resolve().then(async () => {` (las escrituras dejan de encadenarse) → debe fallar al menos una prueba de `room.test.ts`. Restaurar con `git checkout -- server/src/game/room.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(game): GameRoom con guardado ordenado y reintentos, puertos y repositorio Prisma" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `RoomStore` y `RoomManager`

**Files:**
- Create: `server/src/game/room-store.ts`, `server/src/game/room-manager.ts`
- Test: `server/test/game/room-manager.test.ts`

**Interfaces:**
- Consumes: `GameRoom`, `GameRoomPorts`, `RoomUser` (Task 6), `AppError` (etapa 1), `Prisma` del cliente generado, constantes `ROOM_CODE_*` (Task 2), helpers de la Task 6 (`FakeTime`, `RecordingBroadcaster`, `FakeRepository`).
- Produces: `interface RoomStore { get(code), add(room), remove(code), findByUser(userId) }`, `InMemoryRoomStore`; `RoomManagerDeps extends GameRoomPorts { store, generateCode? }`, `generateRoomCode(rng): string` (6 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), `class RoomManager` con `createRoom(user, config): Promise<{ code }>` (409 `ALREADY_IN_GAME`; reintenta el código si ya existe en memoria o si la BD lo rechaza por repetido `P2002`), `joinRoom(user, code): { code }` (idempotente para quien ya está; 404 `ROOM_NOT_FOUND`, 409 `ROOM_FULL`, 409 `ROOM_CLOSED`, 409 `ALREADY_IN_GAME`), `getPublicInfo(code): PublicRoomInfo`, `connect(user, code): { room, seat }` (403 `NOT_IN_ROOM`). Los códigos se normalizan (`trim` y mayúsculas). Al terminar una partida la sala sale del registro.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/game/room-manager.test.ts`:

```ts
import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../src/game/constants.js";
import { RoomManager, generateRoomCode } from "../../src/game/room-manager.js";
import { InMemoryRoomStore } from "../../src/game/room-store.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { seededRng, sequenceRng } from "../helpers/rng.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

const config: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };
const ash = { userId: "u1", username: "ash" };
const misty = { userId: "u2", username: "misty" };
const brock = { userId: "u3", username: "brock" };

function setup(generateCode?: () => string) {
  const time = new FakeTime();
  const repository = new FakeRepository();
  const store = new InMemoryRoomStore();
  const manager = new RoomManager({
    clock: time,
    scheduler: time,
    broadcaster: new RecordingBroadcaster(),
    repository,
    catalog: fixtureCatalog(),
    rng: seededRng(7),
    store,
    generateCode,
    persistRetryDelayMs: 0,
  });
  return { manager, time, repository, store };
}

async function rejection(promise: unknown): Promise<{ status: number; code: string }> {
  const error = await Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e,
  );
  return { status: (error as { status: number }).status, code: (error as { code: string }).code };
}

function syncRejection(fn: () => unknown): { status: number; code: string } {
  try {
    fn();
  } catch (e) {
    return { status: (e as { status: number }).status, code: (e as { code: string }).code };
  }
  throw new Error("Se esperaba un error");
}

describe("generateRoomCode", () => {
  it("genera 6 caracteres del alfabeto sin confusiones (sin 0, O, 1, I, L)", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
});

describe("RoomManager.createRoom", () => {
  it("crea la sala: guarda la partida, la registra y deja al creador en el asiento 1", async () => {
    const { manager, repository, store } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(code).toHaveLength(6);
    expect(repository.calls).toEqual(["createGame"]);
    expect(store.get(code)?.seatOf("u1")).toBe(1);
  });

  it("un usuario no puede crear una segunda sala mientras tenga una activa", async () => {
    const { manager } = setup();
    await manager.createRoom(ash, config);
    expect(await rejection(manager.createRoom(ash, config))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
  });

  it("dos creaciones simultáneas del mismo usuario: una gana y la otra recibe ALREADY_IN_GAME", async () => {
    const { manager, repository } = setup();
    repository.delays.createGame = 20;
    const results = await Promise.allSettled([manager.createRoom(ash, config), manager.createRoom(ash, config)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect((failed.reason as { code: string }).code).toBe("ALREADY_IN_GAME");
  });

  it("si el código ya está en uso por otra sala activa, genera otro", async () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const { manager, store } = setup(() => codes.shift()!);
    await manager.createRoom(ash, config);
    const second = await manager.createRoom(misty, config);
    expect(second.code).toBe("BBBBBB");
    expect(store.get("AAAAAA")?.seatOf("u1")).toBe(1);
  });

  it("si la base de datos rechaza el código por repetido (partida antigua), reintenta con otro", async () => {
    const codes = ["AAAAAA", "BBBBBB"];
    const { manager, repository } = setup(() => codes.shift()!);
    const original = repository.createGame.bind(repository);
    let first = true;
    repository.createGame = async (input) => {
      if (first) {
        first = false;
        throw new Prisma.PrismaClientKnownRequestError("duplicado", { code: "P2002", clientVersion: "test" });
      }
      return original(input);
    };
    await expect(manager.createRoom(ash, config)).resolves.toEqual({ code: "BBBBBB" });
  });

  it("propaga los errores inesperados de la base de datos y libera al usuario para reintentar", async () => {
    const { manager, repository } = setup();
    repository.failures.createGame = 1;
    await expect(manager.createRoom(ash, config)).rejects.toThrow("fallo simulado");
    await expect(manager.createRoom(ash, config)).resolves.toBeTruthy();
  });

  it("al terminar la partida la sala sale del registro y el usuario puede crear otra", async () => {
    const { manager, store, time } = setup();
    const { code } = await manager.createRoom(ash, config);
    time.advance(10 * 60 * 1000); // caduca sin que nadie se una
    expect(store.get(code)).toBeUndefined();
    await expect(manager.createRoom(ash, config)).resolves.toBeTruthy();
  });
});

describe("RoomManager.joinRoom", () => {
  it("reserva el asiento 2", async () => {
    const { manager, store, repository } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(manager.joinRoom(misty, code)).toEqual({ code });
    expect(store.get(code)?.seatOf("u2")).toBe(2);
    await store.get(code)!.idle();
    expect(repository.calls).toContain("addSecondPlayer:u2");
  });

  it("acepta el código en minúsculas y con espacios", async () => {
    const { manager } = setup(() => "ABC234");
    await manager.createRoom(ash, config);
    expect(manager.joinRoom(misty, "  abc234 ")).toEqual({ code: "ABC234" });
  });

  it("es idempotente para quien ya está en la sala, creador incluido", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(manager.joinRoom(ash, code)).toEqual({ code });
    manager.joinRoom(misty, code);
    expect(manager.joinRoom(misty, code)).toEqual({ code });
  });

  it("ROOM_NOT_FOUND si el código no existe", () => {
    const { manager } = setup();
    expect(syncRejection(() => manager.joinRoom(ash, "ZZZZZZ"))).toEqual({ status: 404, code: "ROOM_NOT_FOUND" });
  });

  it("ROOM_FULL si el asiento 2 ya está ocupado por otra persona", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    expect(syncRejection(() => manager.joinRoom(brock, code))).toEqual({ status: 409, code: "ROOM_FULL" });
  });

  it("ROOM_CLOSED si la partida ya empezó", async () => {
    const { manager, store } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    const room = store.get(code)!;
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    room.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
    expect(room.phase).toBe("starting");
    expect(syncRejection(() => manager.joinRoom(brock, code))).toEqual({ status: 409, code: "ROOM_CLOSED" });
  });

  it("ALREADY_IN_GAME si el usuario participa en otra sala activa", async () => {
    const { manager } = setup();
    const first = await manager.createRoom(ash, config);
    const second = await manager.createRoom(misty, config);
    expect(first.code).not.toBe(second.code);
    expect(syncRejection(() => manager.joinRoom(ash, second.code))).toEqual({ status: 409, code: "ALREADY_IN_GAME" });
  });
});

describe("RoomManager.getPublicInfo y connect", () => {
  it("getPublicInfo describe la sala sin datos privados", async () => {
    const { manager } = setup(() => "ABC234");
    await manager.createRoom(ash, config);
    expect(manager.getPublicInfo("abc234")).toEqual({
      code: "ABC234",
      phase: "waiting",
      config,
      creator: "ash",
      playerCount: 1,
    });
    manager.joinRoom(misty, "ABC234");
    expect(manager.getPublicInfo("ABC234").playerCount).toBe(2);
  });

  it("connect devuelve la sala y el asiento de quien participa", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    manager.joinRoom(misty, code);
    expect(manager.connect(ash, code).seat).toBe(1);
    expect(manager.connect(misty, code).seat).toBe(2);
  });

  it("connect rechaza a quien no participa (NOT_IN_ROOM) y a una sala inexistente", async () => {
    const { manager } = setup();
    const { code } = await manager.createRoom(ash, config);
    expect(syncRejection(() => manager.connect(brock, code))).toEqual({ status: 403, code: "NOT_IN_ROOM" });
    expect(syncRejection(() => manager.connect(ash, "ZZZZZZ"))).toEqual({ status: 404, code: "ROOM_NOT_FOUND" });
  });

  it("el generador usa el azar inyectado de forma determinista", () => {
    const rng = sequenceRng([0, 1, 2, 3, 4, 5]);
    expect(generateRoomCode(rng)).toBe("ABCDEF");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/game/room-manager.test.ts
```

Expected: FAIL — no existen `src/game/room-manager.js` ni `src/game/room-store.js`.

- [ ] **Step 3: Implementar**

`server/src/game/room-store.ts`:

```ts
import type { GameRoom } from "./room.js";

/** Dónde viven las salas activas. Hoy en memoria; una implementación con Redis cabría aquí. */
export interface RoomStore {
  get(code: string): GameRoom | undefined;
  add(room: GameRoom): void;
  remove(code: string): void;
  /** La sala activa (no terminada) en la que participa el usuario, si hay alguna. */
  findByUser(userId: string): GameRoom | undefined;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, GameRoom>();

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  add(room: GameRoom): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  findByUser(userId: string): GameRoom | undefined {
    // Hay pocas salas activas a la vez: un recorrido lineal es suficiente.
    for (const room of this.rooms.values()) {
      if (room.phase !== "finished" && room.seatOf(userId) !== undefined) return room;
    }
    return undefined;
  }
}
```

`server/src/game/room-manager.ts`:

```ts
import type { PublicRoomInfo, RoomConfig, Seat } from "@pokemon-minigames/shared";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.js";
import type { Rng } from "./rng.js";
import { GameRoom, type GameRoomPorts, type RoomUser } from "./room.js";
import type { RoomStore } from "./room-store.js";

export interface RoomManagerDeps extends GameRoomPorts {
  store: RoomStore;
  /** Reemplazable en las pruebas para forzar códigos conocidos. */
  generateCode?: () => string;
}

const MAX_CODE_ATTEMPTS = 10;

export function generateRoomCode(rng: Rng): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[rng.int(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

const normalizeCode = (code: string): string => code.trim().toUpperCase();

const alreadyInGame = () => new AppError(409, "ALREADY_IN_GAME", "Ya estás en una partida activa");

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Crea y busca salas, y decide quién puede entrar en ellas. */
export class RoomManager {
  /** Usuarios con una sala en proceso de creación (evita que uno cree dos a la vez). */
  private readonly pendingCreates = new Set<string>();

  constructor(private readonly deps: RoomManagerDeps) {}

  async createRoom(user: RoomUser, config: RoomConfig): Promise<{ code: string }> {
    if (this.deps.store.findByUser(user.userId) || this.pendingCreates.has(user.userId)) {
      throw alreadyInGame();
    }
    this.pendingCreates.add(user.userId);
    try {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = this.deps.generateCode?.() ?? generateRoomCode(this.deps.rng);
        if (this.deps.store.get(code)) continue;

        let gameId: string;
        try {
          gameId = await this.deps.repository.createGame({ roomCode: code, config, creatorUserId: user.userId });
        } catch (error) {
          // El código ya se usó en una partida anterior (la base de datos lo exige único).
          if (isUniqueViolation(error)) continue;
          throw error;
        }

        const room = GameRoom.create(this.deps, { code, gameId, config, creator: user });
        room.onFinished(() => this.deps.store.remove(code));
        this.deps.store.add(room);
        return { code };
      }
      throw new Error("No se pudo generar un código de sala único");
    } finally {
      this.pendingCreates.delete(user.userId);
    }
  }

  /** Reserva el asiento 2. Si el usuario ya está en esa sala, no hace nada. */
  joinRoom(user: RoomUser, code: string): { code: string } {
    const room = this.findRoom(code);
    if (room.seatOf(user.userId) !== undefined) return { code: room.code };
    if (room.phase !== "waiting") {
      throw new AppError(409, "ROOM_CLOSED", "La sala ya no admite jugadores");
    }
    if (room.hasSeat(2)) throw new AppError(409, "ROOM_FULL", "La sala está llena");
    if (this.deps.store.findByUser(user.userId)) throw alreadyInGame();

    room.dispatch({ type: "PLAYER_JOINED", userId: user.userId, username: user.username });
    return { code: room.code };
  }

  getPublicInfo(code: string): PublicRoomInfo {
    const room = this.findRoom(code);
    return {
      code: room.code,
      phase: room.phase,
      config: room.config,
      creator: room.creatorName(),
      playerCount: room.playerCount(),
    };
  }

  /** Para el socket: la sala y el asiento del usuario, si participa en ella. */
  connect(user: RoomUser, code: string): { room: GameRoom; seat: Seat } {
    const room = this.findRoom(code);
    const seat = room.seatOf(user.userId);
    if (seat === undefined) throw new AppError(403, "NOT_IN_ROOM", "No participas en esa sala");
    return { room, seat };
  }

  private findRoom(code: string): GameRoom {
    const room = this.deps.store.get(normalizeCode(code));
    if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "No existe una sala con ese código");
    return room;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/game/room-manager.test.ts
npm run typecheck
```

Expected: PASS (19 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Comprobar que las pruebas detectan fallos**

En `server/src/game/room-manager.ts`: (a) quitar `|| this.pendingCreates.has(user.userId)` → debe fallar "dos creaciones simultáneas del mismo usuario"; (b) quitar la línea `room.onFinished(() => this.deps.store.remove(code));` → debe fallar "al terminar la partida la sala sale del registro". Restaurar con `git checkout -- server/src/game/room-manager.ts` tras cada una.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(game): RoomStore y RoomManager (crear, unir y conectar a salas)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Salas por REST, Socket.io y cableado de la aplicación

**Files:**
- Create: `server/src/rooms/rooms.schemas.ts`, `server/src/rooms/rooms.routes.ts`, `server/src/realtime/rate-limiter.ts`, `server/src/realtime/broadcaster.ts`, `server/src/realtime/server.ts`
- Replace: `server/src/app.ts`, `server/src/index.ts`, `server/test/helpers/app.ts`, `server/test/app/health.test.ts`
- Create (pruebas): `server/test/helpers/users.ts`, `server/test/realtime/client.ts`, `server/test/realtime/rate-limiter.test.ts`, `server/test/rooms/rooms.routes.test.ts`, `server/test/realtime/realtime.test.ts`

**Interfaces:**
- Consumes: `RoomManager`/`RoomStore` (Task 7), `GameRoom` (Task 6), `TokenService`, `createRequireAuth`, `getAuth` y `AuthService` (etapa 1), `AppError`, `Env`, el catálogo y el repositorio (Tasks 3 y 6).
- Produces: `createRoomSchema` (Zod; aplica las reglas del CHECK de `games` con sus rangos y devuelve `RoomConfig`), `createRoomsRouter({ manager, tokens })` con `POST /rooms` (201 `{ code }`), `GET /rooms/:code` y `POST /rooms/:code/join` (todas exigen `Authorization: Bearer`); `createRateLimiter(limit, windowMs, now?)`; `SocketBroadcaster` (`bind`, `unbind`, `toSeat`, `toAll`), `attachRealtime(httpServer, { env, tokens, manager, broadcaster, eventsPerSecond?, logger? }): GameIoServer`; **`createApp({ env, prisma, tokens, roomManager })`** (reemplaza a `createApp({ env, prisma })` de la etapa 1). Protocolo de socket: `join-room { code }` (también reconecta; una segunda pestaña reemplaza a la primera), `choose-type { type }`, `submit-pokemon { text }` (máx. 100 caracteres), `leave-room`; errores como evento `error { code, message }`. El handshake exige `auth.token`; si no, rechaza con el mensaje `UNAUTHORIZED`.
- Produces (prueba): `buildTestContext(overrides?, options?)` → `{ app, env, tokens, time, broadcaster, store, roomManager }` (tiempo simulado; opciones `rng`, `generateCode`, `catalog`), `buildTestApp(overrides?)`, `registerUser(app, username)`, `startServer(overrides?, options?)`, `TestClient`.

- [ ] **Step 1: Instalar las dependencias de Socket.io**

```bash
npm install socket.io@^4.8.4 -w server
npm install -D socket.io-client@^4.8.4 -w server
```

Expected: `server/package.json` gana `socket.io` en `dependencies` y `socket.io-client` en `devDependencies`.

- [ ] **Step 2: Escribir las pruebas que fallan**

`server/test/helpers/app.ts` (reemplaza la versión de la etapa 1; ahora arma la app completa con tiempo simulado):

```ts
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import type { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { loadEnv } from "../../src/config/env.js";
import { createPrismaGameRepository } from "../../src/game/prisma-game-repository.js";
import { type Rng, cryptoRng } from "../../src/game/rng.js";
import { RoomManager } from "../../src/game/room-manager.js";
import { InMemoryRoomStore } from "../../src/game/room-store.js";
import { SocketBroadcaster } from "../../src/realtime/broadcaster.js";
import { FakeTime } from "../game/fakes.js";
import { fixtureCatalog } from "./fixtures.js";
import { prisma } from "./db.js";

export interface TestContextOptions {
  /** Azar de las salas (por defecto el real). */
  rng?: Rng;
  /** Fuerza los códigos de sala (por defecto aleatorios). */
  generateCode?: () => string;
  /** Catálogo (por defecto el de pruebas en memoria). */
  catalog?: PokemonCatalog;
}

/**
 * La app completa (y sus piezas) con la configuración de .env.test y la base de datos de pruebas.
 * El tiempo de las salas es simulado (`time.advance`) y el catálogo es el de pruebas.
 */
export function buildTestContext(overrides: Record<string, string> = {}, options: TestContextOptions = {}) {
  const env = loadEnv({ ...process.env, ...overrides });
  const tokens = createTokenService({ secret: env.JWT_ACCESS_SECRET, accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS });
  const time = new FakeTime();
  const broadcaster = new SocketBroadcaster();
  const store = new InMemoryRoomStore();
  const roomManager = new RoomManager({
    clock: time,
    scheduler: time,
    broadcaster,
    repository: createPrismaGameRepository(prisma),
    catalog: options.catalog ?? fixtureCatalog(),
    rng: options.rng ?? cryptoRng,
    generateCode: options.generateCode,
    store,
    persistRetryDelayMs: 0,
  });
  const app = createApp({ env, prisma, tokens, roomManager });
  return { app, env, tokens, time, broadcaster, store, roomManager };
}

export function buildTestApp(overrides: Record<string, string> = {}): Express {
  return buildTestContext(overrides).app;
}
```

`server/test/app/health.test.ts` (reemplaza la versión de la etapa 1):

```ts
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";

afterAll(() => prisma.$disconnect());

describe("GET /health", () => {
  const app = buildTestApp();

  it("responde 200 con status ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("no expone el encabezado x-powered-by", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
```

`server/test/helpers/users.ts`:

```ts
import type { Express } from "express";
import request from "supertest";

export interface TestUser {
  userId: string;
  username: string;
  token: string;
}

/** Registra un usuario por la API y devuelve su id y su access token. */
export async function registerUser(app: Express, username: string): Promise<TestUser> {
  const response = await request(app)
    .post("/auth/register")
    .send({ email: `${username}@example.com`, username, password: "pikachu-123" });
  if (response.status !== 201) throw new Error(`No se pudo registrar a ${username}: ${response.status}`);
  return { userId: response.body.user.id, username, token: response.body.accessToken };
}
```

`server/test/realtime/rate-limiter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../src/realtime/rate-limiter.js";

describe("createRateLimiter", () => {
  it("deja pasar hasta el límite dentro de la ventana y rechaza el resto", () => {
    let now = 0;
    const limiter = createRateLimiter(3, 1000, () => now);
    expect([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("la ventana se desliza: pasado el intervalo vuelve a aceptar", () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    limiter.allow();
    now = 500;
    limiter.allow();
    now = 999;
    expect(limiter.allow()).toBe(false);
    now = 1000; // el primer evento ya salió de la ventana
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it("los eventos rechazados no alargan el bloqueo", () => {
    let now = 0;
    const limiter = createRateLimiter(1, 1000, () => now);
    limiter.allow();
    for (now = 100; now < 1000; now += 100) expect(limiter.allow()).toBe(false);
    now = 1000;
    expect(limiter.allow()).toBe(true);
  });
});
```

`server/test/rooms/rooms.routes.test.ts`:

```ts
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { buildTestContext } from "../helpers/app.js";
import { registerUser, type TestUser } from "../helpers/users.js";

let ctx = buildTestContext();
let ash: TestUser;
let misty: TestUser;
let brock: TestUser;

const validBody = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 };

beforeEach(async () => {
  await resetDatabase();
  ctx = buildTestContext();
  ash = await registerUser(ctx.app, "ash");
  misty = await registerUser(ctx.app, "misty");
  brock = await registerUser(ctx.app, "brock");
});
afterAll(() => prisma.$disconnect());

const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const createRoom = (user: TestUser, body: unknown = validBody) =>
  request(ctx.app).post("/rooms").set(auth(user)).send(body as object);

describe("autenticación de las rutas de salas", () => {
  it.each([
    ["POST /rooms", () => request(ctx.app).post("/rooms").send(validBody)],
    ["GET /rooms/:code", () => request(ctx.app).get("/rooms/ABC234")],
    ["POST /rooms/:code/join", () => request(ctx.app).post("/rooms/ABC234/join")],
  ])("%s responde 401 sin token", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 con un token inválido", async () => {
    const response = await request(ctx.app).post("/rooms").set("Authorization", "Bearer basura").send(validBody);
    expect(response.status).toBe(401);
  });
});

describe("POST /rooms", () => {
  it("crea la sala y la partida en la base de datos", async () => {
    const response = await createRoom(ash);
    expect(response.status).toBe(201);
    expect(response.body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    const game = await prisma.game.findUniqueOrThrow({
      where: { roomCode: response.body.code },
      include: { players: true },
    });
    expect(game).toMatchObject({ status: "waiting", typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 });
    expect(game.players.map((p) => [p.userId, p.seat])).toEqual([[ash.userId, 1]]);
  });

  it.each([
    ["rondas fijas de 5", { typeMode: "chosen", lengthMode: "fixed_rounds", roundsLimit: 5 }],
    ["personalizada con 10 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 10 }],
    ["personalizada con 1 ronda", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }],
    ["personalizada con 20 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 20 }],
    ["personalizada con meta 500", { typeMode: "chosen", lengthMode: "custom", statsGoal: 500 }],
    ["personalizada con meta 5000", { typeMode: "chosen", lengthMode: "custom", statsGoal: 5000 }],
  ])("acepta %s", async (_name, body) => {
    const response = await createRoom(ash, body);
    expect(response.status).toBe(201);
  });

  it.each([
    ["modo de tipos desconocido", { typeMode: "x", lengthMode: "fixed_rounds", roundsLimit: 3 }],
    ["rondas fijas de 4", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 4 }],
    ["rondas fijas sin número", { typeMode: "random", lengthMode: "fixed_rounds" }],
    ["rondas fijas con meta de stats", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: 1000 }],
    ["personalizada sin condición de fin", { typeMode: "random", lengthMode: "custom" }],
    ["personalizada con las dos condiciones", { typeMode: "random", lengthMode: "custom", roundsLimit: 5, statsGoal: 1000 }],
    ["personalizada con 0 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 0 }],
    ["personalizada con 21 rondas", { typeMode: "random", lengthMode: "custom", roundsLimit: 21 }],
    ["personalizada con meta 499", { typeMode: "random", lengthMode: "custom", statsGoal: 499 }],
    ["personalizada con meta 5001", { typeMode: "random", lengthMode: "custom", statsGoal: 5001 }],
    ["rondas decimales", { typeMode: "random", lengthMode: "custom", roundsLimit: 2.5 }],
    ["rondas como texto", { typeMode: "random", lengthMode: "custom", roundsLimit: "3" }],
  ])("rechaza %s con 400", async (_name, body) => {
    const response = await createRoom(ash, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un cuerpo vacío", async () => {
    const response = await request(ctx.app).post("/rooms").set(auth(ash));
    expect(response.status).toBe(400);
  });

  it("409 ALREADY_IN_GAME si el usuario ya está en una partida activa", async () => {
    await createRoom(ash);
    const response = await createRoom(ash);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN_GAME");
  });
});

describe("GET /rooms/:code", () => {
  it("devuelve la información pública de la sala", async () => {
    const { body } = await createRoom(ash, { typeMode: "chosen", lengthMode: "custom", statsGoal: 2500 });
    const response = await request(ctx.app).get(`/rooms/${body.code.toLowerCase()}`).set(auth(misty));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: body.code,
      phase: "waiting",
      config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 },
      creator: "ash",
      playerCount: 1,
    });
  });

  it("404 ROOM_NOT_FOUND para un código inexistente", async () => {
    const response = await request(ctx.app).get("/rooms/ZZZZZZ").set(auth(ash));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROOM_NOT_FOUND");
  });
});

describe("POST /rooms/:code/join", () => {
  it("reserva el asiento 2 y lo guarda en la base de datos", async () => {
    const { body } = await createRoom(ash);
    const room = ctx.store.get(body.code)!;
    const response = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: body.code });

    await room.idle();
    const players = await prisma.gamePlayer.findMany({ where: { game: { roomCode: body.code } }, orderBy: { seat: "asc" } });
    expect(players.map((p) => [p.userId, p.seat])).toEqual([[ash.userId, 1], [misty.userId, 2]]);
    const info = await request(ctx.app).get(`/rooms/${body.code}`).set(auth(ash));
    expect(info.body.playerCount).toBe(2);
  });

  it("es idempotente para quien ya está en la sala", async () => {
    const { body } = await createRoom(ash);
    const again = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(ash));
    expect(again.status).toBe(200);
  });

  it("409 ROOM_FULL si ya hay dos jugadores", async () => {
    const { body } = await createRoom(ash);
    await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty));
    const response = await request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(brock));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ROOM_FULL");
  });

  it("404 ROOM_NOT_FOUND si el código no existe", async () => {
    const response = await request(ctx.app).post("/rooms/ZZZZZZ/join").set(auth(ash));
    expect(response.status).toBe(404);
  });

  it("409 ALREADY_IN_GAME si quien se une ya participa en otra sala", async () => {
    await createRoom(ash);
    const other = await createRoom(misty);
    const response = await request(ctx.app).post(`/rooms/${other.body.code}/join`).set(auth(ash));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN_GAME");
  });

  it("dos personas intentando entrar a la vez: una obtiene el asiento y la otra ROOM_FULL", async () => {
    const { body } = await createRoom(ash);
    const [a, b] = await Promise.all([
      request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(misty)),
      request(ctx.app).post(`/rooms/${body.code}/join`).set(auth(brock)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});
```

`server/test/realtime/client.ts` (servidor de prueba y cliente que recuerda lo que recibe):

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Socket, io } from "socket.io-client";
import { type GameIoServer, attachRealtime } from "../../src/realtime/server.js";
import { type TestContextOptions, buildTestContext } from "../helpers/app.js";

const DEFAULT_TIMEOUT_MS = 3000;

export interface RunningServer extends ReturnType<typeof buildTestContext> {
  url: string;
  io: GameIoServer;
  close(): Promise<void>;
}

/** Levanta la app completa con Socket.io en un puerto libre. */
export async function startServer(
  overrides: Record<string, string> = {},
  options: TestContextOptions & { eventsPerSecond?: number } = {},
): Promise<RunningServer> {
  const ctx = buildTestContext(overrides, options);
  const server = createServer(ctx.app);
  const realtime = attachRealtime(server, {
    env: ctx.env,
    tokens: ctx.tokens,
    manager: ctx.roomManager,
    broadcaster: ctx.broadcaster,
    eventsPerSecond: options.eventsPerSecond,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { ...ctx, url: `http://localhost:${port}`, io: realtime, close: () => realtime.close() };
}

interface Received {
  name: string;
  payload: unknown;
}

/** Cliente de Socket.io que guarda todo lo que recibe y deja esperar eventos concretos. */
export class TestClient {
  readonly socket: Socket;
  readonly received: Received[] = [];
  private readonly consumed = new Set<number>();
  private readonly waiters = new Set<() => void>();

  constructor(url: string, token: string | null) {
    this.socket = io(url, {
      auth: token === null ? {} : { token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    this.socket.onAny((name: string, payload: unknown) => {
      this.received.push({ name, payload });
      for (const wake of this.waiters) wake();
    });
  }

  /** Resuelve al conectar; si el servidor rechaza el handshake, rechaza con su mensaje. */
  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error) => reject(error));
    });
  }

  emit(name: string, payload?: unknown): void {
    this.socket.emit(name, payload);
  }

  /** Espera el siguiente evento con ese nombre que aún no se haya consumido. */
  next<T = unknown>(name: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const check = (): boolean => {
        const index = this.received.findIndex((r, i) => r.name === name && !this.consumed.has(i));
        if (index === -1) return false;
        this.consumed.add(index);
        cleanup();
        resolve(this.received[index]!.payload as T);
        return true;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`No llegó el evento "${name}" en ${timeoutMs} ms. Recibidos: ${this.received.map((r) => r.name).join(", ")}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(check);
      };
      if (!check()) this.waiters.add(check);
    });
  }

  /** Eventos recibidos con ese nombre, consumidos o no. */
  all<T = unknown>(name: string): T[] {
    return this.received.filter((r) => r.name === name).map((r) => r.payload as T);
  }

  /** Da tiempo a que llegue algo que NO debería llegar y comprueba que no llegó. */
  async expectNone(name: string, waitMs = 150): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (this.all(name).length > 0) throw new Error(`Llegó un evento inesperado "${name}"`);
  }

  wasDisconnected(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.disconnected) return resolve();
      const timer = setTimeout(() => reject(new Error("El socket no se desconectó")), timeoutMs);
      this.socket.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
```

`server/test/realtime/realtime.test.ts`:

```ts
import type { GameEndedPayload, RoomStateView, RoundResultPayload, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "../helpers/db.js";
import { sequenceRng } from "../helpers/rng.js";
import { registerUser, type TestUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "./client.js";

let server: RunningServer;
let clients: TestClient[] = [];
let ash: TestUser;
let misty: TestUser;
let brock: TestUser;

const ONE_ROUND = { typeMode: "random", lengthMode: "custom", roundsLimit: 1 };

async function boot(options: Parameters<typeof startServer>[1] = {}) {
  server = await startServer({}, { rng: sequenceRng([0, 0, 0]), generateCode: () => "ABC234", ...options });
  ash = await registerUser(server.app, "ash");
  misty = await registerUser(server.app, "misty");
  brock = await registerUser(server.app, "brock");
}

async function connect(user: TestUser | null): Promise<TestClient> {
  const client = new TestClient(server.url, user?.token ?? null);
  clients.push(client);
  await client.connected();
  return client;
}

async function createRoom(body: object = ONE_ROUND): Promise<string> {
  const response = await request(server.app).post("/rooms").set("Authorization", `Bearer ${ash.token}`).send(body);
  await request(server.app).post(`/rooms/${response.body.code}/join`).set("Authorization", `Bearer ${misty.token}`);
  return response.body.code as string;
}

/** Los dos jugadores entran a la sala por socket y empieza la cuenta atrás. */
async function joinBoth(code: string) {
  const one = await connect(ash);
  const two = await connect(misty);
  one.emit("join-room", { code });
  await one.next("room-state");
  two.emit("join-room", { code });
  await two.next("room-state");
  await one.next("game-starting");
  await two.next("game-starting");
  return { one, two };
}

beforeEach(async () => {
  await resetDatabase();
  await boot();
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server.close();
});
afterAll(() => prisma.$disconnect());

describe("autenticación del handshake", () => {
  it("rechaza la conexión sin token", async () => {
    await expect(connect(null)).rejects.toThrow("UNAUTHORIZED");
  });

  it("rechaza un token inválido o de otro secreto", async () => {
    const client = new TestClient(server.url, "no-es-un-jwt");
    clients.push(client);
    await expect(client.connected()).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("entrar a una sala", () => {
  it("ROOM_NOT_FOUND si el código no existe", async () => {
    const client = await connect(ash);
    client.emit("join-room", { code: "ZZZZZZ" });
    expect(await client.next("error")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("NOT_IN_ROOM si el usuario no participa en esa sala", async () => {
    const code = await createRoom();
    const client = await connect(brock);
    client.emit("join-room", { code });
    expect(await client.next("error")).toMatchObject({ code: "NOT_IN_ROOM" });
  });

  it("VALIDATION_ERROR con una carga mal formada", async () => {
    const client = await connect(ash);
    client.emit("join-room", { code: 123 });
    client.emit("join-room");
    expect(await client.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await client.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("NOT_IN_ROOM si se elige un tipo o se responde sin haber entrado", async () => {
    const client = await connect(ash);
    client.emit("choose-type", { type: "fire" });
    client.emit("submit-pokemon", { text: "Alfa" });
    client.emit("leave-room");
    for (let i = 0; i < 3; i++) expect(await client.next("error")).toMatchObject({ code: "NOT_IN_ROOM" });
  });

  it("al entrar cada jugador recibe su estado; al estar ambos empieza la cuenta atrás", async () => {
    const code = await createRoom();
    const one = await connect(ash);
    one.emit("join-room", { code: code.toLowerCase() });
    const state = await one.next<RoomStateView>("room-state");
    expect(state).toMatchObject({ code: "ABC234", phase: "waiting", mySeat: 1 });
    expect(state.players.map((p) => p.username)).toEqual(["ash", "misty"]);

    const two = await connect(misty);
    two.emit("join-room", { code });
    expect(await two.next<RoomStateView>("room-state")).toMatchObject({ mySeat: 2 });
    expect(await one.next("game-starting")).toMatchObject({ startsAt: expect.any(Number) });
    expect(await two.next("game-starting")).toMatchObject({ startsAt: expect.any(Number) });
  });
});

describe("una ronda por sockets", () => {
  it("cuenta atrás, ronda, respuestas y resultado", async () => {
    const code = await createRoom();
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);

    const started = await one.next<RoundStartedPayload>("round-started");
    expect(started).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    await two.next("round-started");

    one.emit("submit-pokemon", { text: "Alfa" });
    expect(await one.next("answer-received")).toEqual({ round: 1 });
    await two.expectNone("answer-received");
    two.emit("submit-pokemon", { text: "Beta" });
    await two.next("answer-received");

    const result = await one.next<RoundResultPayload>("round-result");
    expect(result.results[1]).toMatchObject({ result: "VALID", totalStats: 500 });
    expect(result.results[2]).toMatchObject({ result: "VALID", totalStats: 400 });
    expect(await two.next("round-result")).toEqual(result);

    // La partida era de una sola ronda: termina.
    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: 1, reason: "completed", totals: { 1: 500, 2: 400 } });
    await two.next("game-ended");
  });

  it("responder dos veces da ALREADY_ANSWERED", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    one.emit("submit-pokemon", { text: "Beto" });
    expect(await one.next("error")).toMatchObject({ code: "ALREADY_ANSWERED" });
  });

  it("rechaza textos de más de 100 caracteres con VALIDATION_ERROR", async () => {
    const code = await createRoom();
    const { one } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    one.emit("submit-pokemon", { text: "x".repeat(101) });
    expect(await one.next("error")).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("límite de frecuencia", () => {
  it("más de 5 eventos por segundo reciben RATE_LIMITED", async () => {
    const client = await connect(ash);
    for (let i = 0; i < 8; i++) client.emit("submit-pokemon", { text: "x" });
    await client.next("error");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const codes = client.all<{ code: string }>("error").map((e) => e.code);
    expect(codes.filter((c) => c === "NOT_IN_ROOM")).toHaveLength(5);
    expect(codes.filter((c) => c === "RATE_LIMITED")).toHaveLength(3);
  });
});

describe("desconexión y reconexión", () => {
  it("si un jugador se cae el rival recibe el aviso; al volver recibe su estado y el rival un aviso", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    await two.next("round-started");

    two.close();
    const away = await one.next<{ graceEndsAt: number }>("opponent-disconnected");
    expect(away.graceEndsAt).toBe(server.time.now() + 30_000);

    const back = await connect(misty);
    back.emit("join-room", { code });
    const state = await back.next<RoomStateView>("room-state");
    expect(state).toMatchObject({ mySeat: 2, phase: "round_active", round: { number: 1, answered: false } });
    await one.next("opponent-reconnected");

    // Sigue jugando con normalidad con el socket nuevo.
    back.emit("submit-pokemon", { text: "Beto" });
    expect(await back.next("answer-received")).toEqual({ round: 1 });
  });

  it("si no vuelve en 30 s pierde por desconexión", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    two.close();
    await one.next("opponent-disconnected");
    server.time.advance(30_000);
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "disconnect" });
  });

  it("una segunda pestaña reemplaza a la primera sin que el rival vea una caída", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    const secondTab = await connect(misty);
    secondTab.emit("join-room", { code });
    await secondTab.next("room-state");
    await two.wasDisconnected(); // la pestaña anterior se cierra
    await one.expectNone("opponent-disconnected");

    secondTab.emit("submit-pokemon", { text: "Beto" });
    expect(await secondTab.next("answer-received")).toEqual({ round: 1 });
  });
});

describe("salir de la sala", () => {
  it("leave-room en plena partida da la victoria al rival y ambos reciben el resumen", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");

    two.emit("leave-room");
    expect(await two.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "forfeit" });
    expect(await one.next<GameEndedPayload>("game-ended")).toMatchObject({ winnerSeat: 1, reason: "forfeit" });
  });

  it("una sala terminada ya no admite conexiones: ROOM_NOT_FOUND", async () => {
    const code = await createRoom({ typeMode: "random", lengthMode: "custom", roundsLimit: 3 });
    const { one, two } = await joinBoth(code);
    server.time.advance(5000);
    await one.next("round-started");
    two.emit("leave-room");
    await two.next("game-ended");

    const late = await connect(ash);
    late.emit("join-room", { code });
    expect(await late.next("error")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

```bash
npm test -w server -- test/app test/rooms test/realtime
```

Expected: FAIL — no existen `src/rooms/...`, `src/realtime/...` y `createApp` todavía no acepta `{ env, prisma, tokens, roomManager }`.

- [ ] **Step 4: Implementar las rutas REST de salas**

`server/src/rooms/rooms.schemas.ts`:

```ts
import type { RoomConfig } from "@pokemon-minigames/shared";
import { z } from "zod";
import {
  CUSTOM_ROUNDS_MAX,
  CUSTOM_ROUNDS_MIN,
  CUSTOM_STATS_GOAL_MAX,
  CUSTOM_STATS_GOAL_MIN,
  FIXED_ROUNDS_OPTIONS,
} from "../game/constants.js";

/** Cuerpo de `POST /rooms`. Las mismas reglas que el CHECK de la tabla `games`, con sus rangos. */
export const createRoomSchema = z
  .object({
    typeMode: z.enum(["random", "chosen"]),
    lengthMode: z.enum(["fixed_rounds", "custom"]),
    roundsLimit: z.number().int().optional(),
    statsGoal: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    const { lengthMode, roundsLimit, statsGoal } = value;
    const fail = (path: "roundsLimit" | "statsGoal", message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (lengthMode === "fixed_rounds") {
      if (roundsLimit === undefined || !(FIXED_ROUNDS_OPTIONS as readonly number[]).includes(roundsLimit)) {
        fail("roundsLimit", `Las rondas fijas son ${FIXED_ROUNDS_OPTIONS.join(" o ")}`);
      }
      if (statsGoal !== undefined) fail("statsGoal", "Las rondas fijas no admiten una meta de stats");
      return;
    }

    if ((roundsLimit === undefined) === (statsGoal === undefined)) {
      fail("roundsLimit", "El modo personalizado necesita exactamente una condición de fin: roundsLimit o statsGoal");
      return;
    }
    if (roundsLimit !== undefined && (roundsLimit < CUSTOM_ROUNDS_MIN || roundsLimit > CUSTOM_ROUNDS_MAX)) {
      fail("roundsLimit", `El máximo de rondas va de ${CUSTOM_ROUNDS_MIN} a ${CUSTOM_ROUNDS_MAX}`);
    }
    if (statsGoal !== undefined && (statsGoal < CUSTOM_STATS_GOAL_MIN || statsGoal > CUSTOM_STATS_GOAL_MAX)) {
      fail("statsGoal", `La meta de stats va de ${CUSTOM_STATS_GOAL_MIN} a ${CUSTOM_STATS_GOAL_MAX}`);
    }
  })
  .transform(
    (value): RoomConfig => ({
      typeMode: value.typeMode,
      lengthMode: value.lengthMode,
      roundsLimit: value.roundsLimit ?? null,
      statsGoal: value.statsGoal ?? null,
    }),
  );
```

`server/src/rooms/rooms.routes.ts`:

```ts
import { Router } from "express";
import { createRequireAuth, getAuth } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/tokens.js";
import type { RoomManager } from "../game/room-manager.js";
import { createRoomSchema } from "./rooms.schemas.js";

export interface RoomsRouterDeps {
  manager: RoomManager;
  tokens: TokenService;
}

/** Todas las rutas de salas exigen `Authorization: Bearer <accessToken>`. */
export function createRoomsRouter({ manager, tokens }: RoomsRouterDeps): Router {
  const router = Router();
  router.use(createRequireAuth(tokens));

  router.post("/", async (req, res) => {
    const config = createRoomSchema.parse(req.body);
    const { userId, username } = getAuth(res);
    const { code } = await manager.createRoom({ userId, username }, config);
    res.status(201).json({ code });
  });

  router.get("/:code", (req, res) => {
    res.json(manager.getPublicInfo(req.params.code));
  });

  router.post("/:code/join", (req, res) => {
    const { userId, username } = getAuth(res);
    res.json(manager.joinRoom({ userId, username }, req.params.code));
  });

  return router;
}
```

- [ ] **Step 5: Implementar Socket.io**

`server/src/realtime/rate-limiter.ts`:

```ts
export interface RateLimiter {
  /** Registra un evento y dice si está dentro del límite. Los eventos rechazados no cuentan. */
  allow(): boolean;
}

/** Ventana deslizante: como mucho `limit` eventos en cualquier intervalo de `windowMs`. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const stamps: number[] = [];
  return {
    allow() {
      const current = now();
      while (stamps.length > 0 && current - stamps[0]! >= windowMs) stamps.shift();
      if (stamps.length >= limit) return false;
      stamps.push(current);
      return true;
    },
  };
}
```

`server/src/realtime/broadcaster.ts`:

```ts
import type {
  ClientToServerEvents,
  Seat,
  ServerEvent,
  ServerToClientEvents,
} from "@pokemon-minigames/shared";
import type { Socket } from "socket.io";
import type { Broadcaster } from "../game/ports.js";
import type { RoomUser } from "../game/room.js";

export interface SocketData {
  user: RoomUser;
}

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const keyOf = (code: string, seat: Seat): string => `${code}:${seat}`;

/** Sabe qué socket está sentado en cada asiento de cada sala y les entrega los eventos. */
export class SocketBroadcaster implements Broadcaster {
  private readonly sockets = new Map<string, GameSocket>();

  /** Sienta el socket en el asiento. Devuelve el socket anterior de ese asiento, si lo había. */
  bind(code: string, seat: Seat, socket: GameSocket): GameSocket | undefined {
    const previous = this.sockets.get(keyOf(code, seat));
    this.sockets.set(keyOf(code, seat), socket);
    return previous;
  }

  /** Levanta el socket de su asiento, pero solo si sigue siendo el que lo ocupa. */
  unbind(code: string, seat: Seat, socket: GameSocket): boolean {
    if (this.sockets.get(keyOf(code, seat)) !== socket) return false;
    this.sockets.delete(keyOf(code, seat));
    return true;
  }

  toSeat(code: string, seat: Seat, event: ServerEvent): void {
    const socket = this.sockets.get(keyOf(code, seat));
    // El tipo de `emit` no admite una unión de eventos; `ServerEvent` garantiza que nombre y carga concuerdan.
    (socket?.emit as ((name: string, payload: unknown) => boolean) | undefined)?.call(socket, event.name, event.payload);
  }

  toAll(code: string, event: ServerEvent): void {
    this.toSeat(code, 1, event);
    this.toSeat(code, 2, event);
  }
}
```

`server/src/realtime/server.ts`:

```ts
import type { Server as HttpServer } from "node:http";
import type { ClientToServerEvents, ErrorCode, Seat, ServerToClientEvents } from "@pokemon-minigames/shared";
import { Server } from "socket.io";
import { z } from "zod";
import type { TokenService } from "../auth/tokens.js";
import type { Env } from "../config/env.js";
import { MAX_ANSWER_LENGTH, SOCKET_EVENTS_PER_SECOND } from "../game/constants.js";
import type { GameRoom } from "../game/room.js";
import type { RoomManager } from "../game/room-manager.js";
import { AppError } from "../http/errors.js";
import type { SocketBroadcaster, GameSocket, SocketData } from "./broadcaster.js";
import { createRateLimiter } from "./rate-limiter.js";

export interface RealtimeDeps {
  env: Env;
  tokens: TokenService;
  manager: RoomManager;
  broadcaster: SocketBroadcaster;
  eventsPerSecond?: number;
  logger?: { error(message: string, error?: unknown): void };
}

const joinSchema = z.object({ code: z.string().min(1).max(20) });
const chooseSchema = z.object({ type: z.string().min(1).max(30) });
const submitSchema = z.object({ text: z.string().max(MAX_ANSWER_LENGTH) });

export type GameIoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Monta Socket.io sobre el servidor HTTP. Cada evento se valida y se delega en la sala. */
export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): GameIoServer {
  const io: GameIoServer = new Server(httpServer, {
    cors: { origin: deps.env.CORS_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("UNAUTHORIZED"));
    try {
      const payload = deps.tokens.verifyAccessToken(token);
      socket.data.user = { userId: payload.sub, username: payload.username };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => registerHandlers(socket, deps));
  return io;
}

function toErrorPayload(error: unknown, deps: RealtimeDeps): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { code: "VALIDATION_ERROR", message: "Datos inválidos" };
  deps.logger?.error("Error inesperado en un evento de socket", error);
  return { code: "INTERNAL_ERROR", message: "Error interno del servidor" };
}

function registerHandlers(socket: GameSocket, deps: RealtimeDeps): void {
  const { manager, broadcaster } = deps;
  const user = socket.data.user;
  const limiter = createRateLimiter(deps.eventsPerSecond ?? SOCKET_EVENTS_PER_SECOND, 1000);
  let binding: { room: GameRoom; seat: Seat } | null = null;

  /** Ejecuta un evento del cliente: límite de frecuencia, validación y manejo de errores. */
  function handle<T>(schema: z.ZodType<T> | null, action: (payload: T) => void) {
    return (raw?: unknown) => {
      if (!limiter.allow()) {
        socket.emit("error", { code: "RATE_LIMITED", message: "Demasiados eventos seguidos" });
        return;
      }
      try {
        action(schema ? schema.parse(raw) : (undefined as T));
      } catch (error) {
        socket.emit("error", toErrorPayload(error, deps));
      }
    };
  }

  function requireBinding(): { room: GameRoom; seat: Seat } {
    if (!binding) throw new AppError(403, "NOT_IN_ROOM", "Primero entra a una sala");
    return binding;
  }

  /** Suelta el asiento que este socket ocupaba, avisando a la sala si sigue siendo suyo. */
  function release(): void {
    if (!binding) return;
    const { room, seat } = binding;
    binding = null;
    if (broadcaster.unbind(room.code, seat, socket)) {
      room.dispatch({ type: "PLAYER_DISCONNECTED", seat });
    }
  }

  socket.on(
    "join-room",
    handle(joinSchema, ({ code }) => {
      const { room, seat } = deps.manager.connect(user, code);
      if (binding && (binding.room !== room || binding.seat !== seat)) release();

      const previous = broadcaster.bind(room.code, seat, socket);
      binding = { room, seat };
      // Otra pestaña del mismo jugador queda reemplazada. Se desconecta sin avisar a la sala:
      // el asiento no se cae, solo cambia de socket.
      if (previous && previous !== socket) previous.disconnect(true);
      room.dispatch({ type: "PLAYER_CONNECTED", seat });
    }),
  );

  socket.on(
    "choose-type",
    handle(chooseSchema, ({ type }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "CHOOSE_TYPE", seat, typeName: type });
    }),
  );

  socket.on(
    "submit-pokemon",
    handle(submitSchema, ({ text }) => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "SUBMIT", seat, text });
    }),
  );

  socket.on(
    "leave-room",
    handle(null, () => {
      const { room, seat } = requireBinding();
      room.dispatch({ type: "LEAVE", seat });
      // Después del LEAVE, para que quien se va también reciba el resumen final.
      binding = null;
      broadcaster.unbind(room.code, seat, socket);
    }),
  );

  socket.on("disconnect", () => release());
}
```

- [ ] **Step 6: Cablear la aplicación y el arranque real**

`server/src/app.ts` (reemplaza la versión de la etapa 1):

```ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./auth/auth.routes.js";
import { AuthService } from "./auth/auth.service.js";
import { createPasswordHasher } from "./auth/password.js";
import type { TokenService } from "./auth/tokens.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/prisma.js";
import type { RoomManager } from "./game/room-manager.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createRoomsRouter } from "./rooms/rooms.routes.js";

export interface AppDeps {
  env: Env;
  prisma: PrismaClient;
  /** El mismo servicio de tokens que usa Socket.io para autenticar el handshake. */
  tokens: TokenService;
  roomManager: RoomManager;
}

export function createApp({ env, prisma, tokens, roomManager }: AppDeps): Express {
  const authService = new AuthService({
    prisma,
    hasher: createPasswordHasher(env.BCRYPT_COST),
    tokens,
    refreshTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/auth", createAuthRouter({ env, authService, tokens }));
  app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

`server/src/index.ts` (reemplaza la versión de la etapa 1: abandona las partidas pendientes, carga el catálogo, monta Socket.io y cierra limpio):

```ts
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createTokenService } from "./auth/tokens.js";
import { loadCatalog } from "./catalog/pokemon-catalog.js";
import { loadEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { createPrismaGameRepository } from "./game/prisma-game-repository.js";
import { systemClock, timerScheduler } from "./game/ports.js";
import { cryptoRng } from "./game/rng.js";
import { RoomManager } from "./game/room-manager.js";
import { InMemoryRoomStore } from "./game/room-store.js";
import { SocketBroadcaster } from "./realtime/broadcaster.js";
import { attachRealtime } from "./realtime/server.js";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const repository = createPrismaGameRepository(prisma);

// Las salas viven en memoria: lo que quedó a medias antes de reiniciar ya no se puede retomar.
const abandoned = await repository.abandonUnfinished();
if (abandoned > 0) console.log(`${abandoned} partida(s) sin terminar marcadas como abandonadas`);

const catalog = await loadCatalog(prisma);
if (catalog.size === 0) {
  console.error("El catálogo de Pokémon está vacío. Ejecuta `npm run db:seed -w server` y reinicia.");
  process.exit(1);
}
console.log(`Catálogo cargado: ${catalog.size} Pokémon`);

const tokens = createTokenService({
  secret: env.JWT_ACCESS_SECRET,
  accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
});
const broadcaster = new SocketBroadcaster();
const roomManager = new RoomManager({
  clock: systemClock,
  scheduler: timerScheduler,
  broadcaster,
  repository,
  catalog,
  rng: cryptoRng,
  store: new InMemoryRoomStore(),
  logger: console,
});

const app = createApp({ env, prisma, tokens, roomManager });
const server = createServer(app);
const io = attachRealtime(server, { env, tokens, manager: roomManager, broadcaster, logger: console });

server.listen(env.PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido, cerrando...`);
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

- [ ] **Step 7: Ejecutar y verificar que pasan**

```bash
npm test
npm run typecheck
```

Expected: PASS — `rate-limiter` 3, `rooms.routes` 33, `realtime` 16, `health` 2 y el resto de la suite; `tsc` sin errores. (Las pruebas de tiempo real se ejecutan en segundos: el tiempo de las salas es simulado.)

- [ ] **Step 8: Comprobar que las pruebas detectan fallos**

En `server/src/realtime/server.ts`, una por una (restaurar con `git checkout -- server/src/realtime/server.ts` tras cada una): (a) borrar la línea `if (previous && previous !== socket) previous.disconnect(true);` → debe fallar "una segunda pestaña reemplaza a la primera"; (b) cambiar `if (broadcaster.unbind(room.code, seat, socket)) {` por `broadcaster.unbind(room.code, seat, socket); {` → debe fallar esa misma prueba (el rival vería una caída falsa).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(realtime): salas por REST, Socket.io con rate limit y aplicación cableada" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Partidas completas de punta a punta

**Files:**
- Test: `server/test/e2e/full-game.test.ts`

**Interfaces:**
- Consumes: todo lo anterior; `seedCatalog`, `loadCatalog`, `fixtureSnapshot`, `startServer`, `TestClient`, `registerUser`, `sequenceRng`.
- Produces: tres escenarios de punta a punta contra PostgreSQL real con el catálogo cargado desde la base de datos: (1) modo aleatorio de 3 rondas fijas con ganador, (2) modo elegido personalizado de 2 rondas con empate, (3) sala en espera que caduca y queda `abandoned`.

Esta tarea no tiene un ciclo RED propio: verifica integrado lo que ya construyeron las tareas 1–8. Su valor se comprueba en el Step 3.

- [ ] **Step 1: Escribir las pruebas**

`server/test/e2e/full-game.test.ts`:

```ts
import type { GameEndedPayload, RoundResultPayload, RoundStartedPayload } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PokemonCatalog, loadCatalog } from "../../src/catalog/pokemon-catalog.js";
import { seedCatalog } from "../../src/catalog/seed.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { registerUser, type TestUser } from "../helpers/users.js";
import { type RunningServer, TestClient, startServer } from "../realtime/client.js";

let catalog: PokemonCatalog;
let server: RunningServer;
let clients: TestClient[] = [];
let ash: TestUser;
let misty: TestUser;

beforeAll(async () => {
  // El catálogo de pruebas también en la base de datos: las respuestas guardadas lo referencian.
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
  catalog = await loadCatalog(prisma);
});
beforeEach(async () => {
  await resetDatabase();
});
afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await server?.close();
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

async function play(config: object, rngValues: number[]) {
  server = await startServer({}, { rng: sequenceRng(rngValues), generateCode: () => "GAME01", catalog });
  ash = await registerUser(server.app, "ash");
  misty = await registerUser(server.app, "misty");

  const created = await request(server.app).post("/rooms").set("Authorization", `Bearer ${ash.token}`).send(config);
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  const room = server.store.get(code)!;
  await request(server.app).post(`/rooms/${code}/join`).set("Authorization", `Bearer ${misty.token}`).expect(200);

  const connect = async (user: TestUser) => {
    const client = new TestClient(server.url, user.token);
    clients.push(client);
    await client.connected();
    client.emit("join-room", { code });
    await client.next("room-state");
    return client;
  };
  const one = await connect(ash);
  const two = await connect(misty);
  await one.next("game-starting");
  server.time.advance(5000);
  return { code, room, one, two };
}

describe("partida completa de punta a punta", () => {
  it("modo aleatorio, 3 rondas fijas: gana misty y todo queda guardado en la base de datos", async () => {
    const { code, room, one, two } = await play({ typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 }, [0, 1, 0]);

    // Ronda 1: volador/fuego. Ronda 2: tierra/agua. Ronda 3: veneno/planta.
    const plan: [string, string, string, string][] = [
      ["flying", "fire", "Alfa", "Beto"], // 500 - 400
      ["ground", "water", "Delta", "Épsilon"], // 450 - 350
      ["poison", "grass", "Eta", "Zeta"], // 200 - 600
    ];
    for (const [i, [type1, type2, a, b]] of plan.entries()) {
      expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: i + 1, type1, type2 });
      await two.next("round-started");
      one.emit("submit-pokemon", { text: a });
      two.emit("submit-pokemon", { text: b });
      await one.next("round-result");
      await two.next("round-result");
      if (i < 2) server.time.advance(6000);
    }

    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: 2, reason: "completed", totals: { 1: 1150, 2: 1350 } });
    await two.next("game-ended");
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({
      where: { roomCode: code },
      include: {
        players: { orderBy: { seat: "asc" } },
        rounds: { orderBy: { number: "asc" }, include: { picks: true, type1: true, type2: true } },
      },
    });
    expect(game).toMatchObject({ status: "completed", winnerId: misty.userId });
    expect(game.endedAt).toBeInstanceOf(Date);
    expect(game.players.map((p) => [p.userId, p.seat, p.finalStats])).toEqual([
      [ash.userId, 1, 1150],
      [misty.userId, 2, 1350],
    ]);
    expect(game.rounds.map((r) => [r.number, r.type1.name, r.type2.name])).toEqual([
      [1, "flying", "fire"],
      [2, "ground", "water"],
      [3, "poison", "grass"],
    ]);
    expect(game.rounds.flatMap((r) => r.picks).filter((p) => p.result === "VALID")).toHaveLength(6);
    const firstRound = game.rounds[0]!;
    const ashPick = firstRound.picks.find((p) => p.userId === ash.userId)!;
    expect(ashPick).toMatchObject({ submittedText: "Alfa", pokemonId: 1, result: "VALID" });
    expect(ashPick.submittedAt).toBeInstanceOf(Date);
  });

  it("modo elegido, personalizada de 2 rondas: empate, sin ganador, y se guarda así", async () => {
    const { code, room, one, two } = await play({ typeMode: "chosen", lengthMode: "custom", roundsLimit: 2 }, [0]);

    // Ronda 1: eligen fuego y volador. Ronda 2: agua y tierra.
    expect(await one.next("choose-types")).toMatchObject({ round: 1 });
    await two.next("choose-types");
    one.emit("choose-type", { type: "fire" });
    expect(await one.next("type-received")).toEqual({ round: 1 });
    two.emit("choose-type", { type: "flying" });
    expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: 1, type1: "flying", type2: "fire" });
    await two.next("round-started");
    one.emit("submit-pokemon", { text: "Alfa" });
    two.emit("submit-pokemon", { text: "Beto" });
    await one.next("round-result");
    server.time.advance(6000);

    expect(await one.next("choose-types")).toMatchObject({ round: 2 });
    one.emit("choose-type", { type: "water" });
    two.emit("choose-type", { type: "ground" });
    expect(await one.next<RoundStartedPayload>("round-started")).toMatchObject({ round: 2, type1: "ground", type2: "water" });
    one.emit("submit-pokemon", { text: "Épsilon" });
    two.emit("submit-pokemon", { text: "Delta" });
    await one.next("round-result");

    const ended = await one.next<GameEndedPayload>("game-ended");
    expect(ended).toMatchObject({ winnerSeat: null, reason: "completed", totals: { 1: 850, 2: 850 } });
    // No hay una tercera ronda: aunque pase el tiempo no llega ningún anuncio nuevo.
    server.time.advance(60_000);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(one.all<RoundResultPayload>("round-result")).toHaveLength(2);
    expect(one.all("choose-types")).toHaveLength(2);
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: code }, include: { rounds: true } });
    expect(game).toMatchObject({ status: "completed", winnerId: null, typeMode: "chosen", lengthMode: "custom", roundsLimit: 2 });
    expect(game.rounds).toHaveLength(2);
  }, 15_000);

  it("una partida abandonada por falta de oponente queda marcada como abandonada", async () => {
    let next = 2;
    server = await startServer({}, { rng: sequenceRng([0]), generateCode: () => `GAME0${next++}`, catalog });
    ash = await registerUser(server.app, "ash");
    const created = await request(server.app)
      .post("/rooms")
      .set("Authorization", `Bearer ${ash.token}`)
      .send({ typeMode: "random", lengthMode: "custom", roundsLimit: 1 });
    const room = server.store.get(created.body.code)!;

    server.time.advance(10 * 60 * 1000); // la sala en espera caduca
    await room.idle();

    const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: "GAME02" } });
    expect(game).toMatchObject({ status: "abandoned", winnerId: null });
    expect(game.endedAt).toBeInstanceOf(Date);
    // El creador puede abrir otra sala.
    const again = await request(server.app)
      .post("/rooms")
      .set("Authorization", `Bearer ${ash.token}`)
      .send({ typeMode: "random", lengthMode: "custom", roundsLimit: 1 });
    expect(again.status).toBe(201);
  });
});
```

- [ ] **Step 2: Ejecutar**

```bash
npm test -w server -- test/e2e
```

Expected: PASS (3 pruebas). Comprueban, contra la base de datos real: estado y ganador de la partida, `final_stats` por asiento, las rondas con su par de tipos ordenado, las respuestas (`VALID`, texto, `submitted_at`) y que una sala caducada queda `abandoned` y libera al creador.

- [ ] **Step 3: Comprobar que detectan fallos**

En `server/src/game/prisma-game-repository.ts`, cambiar `winnerId: input.winnerUserId` por `winnerId: null` dentro de `finish` → debe fallar la prueba del modo aleatorio (`winnerId` esperado de misty). Restaurar con `git checkout -- server/src/game/prisma-game-repository.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): partidas completas por sockets contra PostgreSQL" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Prueba de humo real, documentación y cierre

**Files:**
- Create: `server/scripts/smoke-game.ts`
- Modify: `server/package.json` (script `smoke`), `README.md`, `docs/superpowers/specs/2026-09-30-etapa-2-motor-de-juego-design.md`

- [ ] **Step 1: Agregar el script de prueba de humo**

`server/scripts/smoke-game.ts` (juega una partida real de una ronda contra el servidor en marcha; tarda unos 6 s):

```ts
/**
 * Prueba de humo manual: juega una partida de una ronda contra el servidor que ya está
 * corriendo (`npm run dev`), con el catálogo real y temporizadores reales (tarda ~6 s).
 * Deja en la base de datos de desarrollo dos usuarios `smoke*` y una partida: al final
 * imprime el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const snapshot = JSON.parse(readFileSync(new URL("../data/catalog.snapshot.json", import.meta.url), "utf8")) as {
  pokemon: { id: number; types: string[]; names: { es: string; en: string } }[];
};

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const tag = Math.random().toString(36).slice(2, 7);
const register = async (name: string) =>
  (await api("/auth/register", { email: `${name}@smoke.test`, username: name, password: "pikachu-123" })).body;
const a = await register(`smokea_${tag}`);
const b = await register(`smokeb_${tag}`);

const created = await api("/rooms", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }, a.accessToken);
console.log("crear sala:", created.status, created.body);
const code = created.body.code as string;
console.log("unirse:", (await api(`/rooms/${code}/join`, {}, b.accessToken)).status);

const connect = (token: string) => io(BASE, { auth: { token }, transports: ["websocket"], reconnection: false });
const one = connect(a.accessToken);
const two = connect(b.accessToken);
const once = <T>(socket: ReturnType<typeof connect>, event: string) =>
  new Promise<T>((resolve) => socket.once(event, resolve as never));

const roundStarted = once<any>(one, "round-started");
const gameEnded = once<any>(one, "game-ended");
await Promise.all([once(one, "connect"), once(two, "connect")]);
one.emit("join-room", { code });
two.emit("join-room", { code });
console.log("esperando la cuenta atrás real de 5 s...");

const round = await roundStarted;
console.log("ronda 1:", round.type1, round.type2);
const valid = snapshot.pokemon.filter(
  (p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2),
);
console.log("Pokémon válidos para el par:", valid.map((p) => p.names.es).join(", "));
one.emit("submit-pokemon", { text: valid[0]!.names.es });
two.emit("submit-pokemon", { text: valid[1]!.names.en });

const result = await once<any>(one, "round-result");
console.log("resultado:", result.results[1].result, "|", result.results[2].result);
const ended = await gameEnded;
console.log("fin:", ended.reason, "— ganador: asiento", ended.winnerSeat, "— totales", ended.totals);
one.close();
two.close();

console.log(`\nPara limpiar la base de datos de desarrollo:`);
console.log(`DELETE FROM games WHERE room_code = '${code}'; DELETE FROM users WHERE email LIKE '%@smoke.test';`);
```

En `server/package.json`, dentro de `scripts`, agregar `"smoke": "tsx scripts/smoke-game.ts"` (por ejemplo, después de `"catalog:fetch"`).

- [ ] **Step 2: Probar el servidor real con el catálogo real**

En una terminal: `npm run dev`. En otra (con el servidor ya escuchando):

```bash
npm run smoke -w server
```

Expected: imprime `crear sala: 201`, `unirse: 200`, la cuenta atrás, el par de la ronda y los Pokémon válidos para ese par, `resultado: VALID | VALID` y `fin: completed`. El script imprime al final el SQL para borrar lo que dejó en la base de datos de desarrollo: ejecútalo (con `psql`, el mismo usuario de tu `.env`) y detén el servidor con Ctrl+C.

- [ ] **Step 3: Actualizar el README**

Reemplazar `README.md` completo:

````markdown
# Pokémon Minigames

Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos. Gana quien acumule más stats base. El diseño completo está en [`docs/superpowers/specs/`](docs/superpowers/specs/).

**Estado:** etapa 2 de 5 (servidor completo: autenticación, catálogo, salas y motor de juego en tiempo real). Falta el cliente web, las estadísticas y el despliegue.

## Estructura

| Carpeta | Contenido |
|---|---|
| `server/` | API REST (Express) y tiempo real (Socket.io), motor de juego, Prisma y PostgreSQL |
| `shared/` | Tipos de eventos, payloads y códigos de error compartidos con el futuro cliente |

## Requisitos

- Node 24 o superior
- PostgreSQL 18 (local, sin Docker)

## Puesta en marcha

```bash
npm install
```

1. Crea dos bases de datos: `pokemon_minigames` y `pokemon_minigames_test`.
2. Copia `server/.env.example` a `server/.env` y `server/.env.test.example` a `server/.env.test`; completa las credenciales de PostgreSQL y `JWT_ACCESS_SECRET` (mínimo 32 caracteres).
3. Aplica las migraciones y carga el catálogo:

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

4. Arranca el servidor (`http://localhost:3000`):

```bash
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en modo desarrollo con recarga |
| `npm test` | Todas las pruebas (usan la base `pokemon_minigames_test`) |
| `npm run typecheck` | Verifica los tipos con `tsc` |
| `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
| `npm run db:seed -w server` | Carga el catálogo desde `server/data/catalog.snapshot.json` |
| `npm run catalog:fetch -w server` | Vuelve a descargar el catálogo de PokéAPI al snapshot |
| `npm run smoke -w server` | Juega una partida real de una ronda contra el servidor en marcha |

## API REST

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servidor |
| `POST /auth/register` | Crea la cuenta; devuelve `user` y `accessToken` y fija la cookie de refresco |
| `POST /auth/login` | Inicia sesión |
| `POST /auth/refresh` | Renueva la sesión con la cookie (rota el refresh token) |
| `POST /auth/logout` | Cierra la sesión y borra la cookie |
| `GET /auth/me` | Usuario actual |
| `POST /rooms` | Crea una sala: `{ typeMode: "random" \| "chosen", lengthMode: "fixed_rounds" \| "custom", roundsLimit?, statsGoal? }`; devuelve `{ code }` |
| `GET /rooms/:code` | Información pública de la sala |
| `POST /rooms/:code/join` | Reserva el asiento 2 |

Las rutas de `/auth/me` y `/rooms` exigen `Authorization: Bearer <accessToken>`. Los errores tienen la forma `{ "error": { "code", "message", "details"? } }`.

## Tiempo real (Socket.io)

Se conecta a `http://localhost:3000` con `auth: { token: <accessToken> }`. Un token inválido rechaza el handshake con `UNAUTHORIZED`. Los nombres y cargas exactos están tipados en [`shared/src/events.ts`](shared/src/events.ts).

| Cliente → servidor | Carga |
|---|---|
| `join-room` | `{ code }` (también sirve para reconectar; una segunda pestaña reemplaza a la primera) |
| `choose-type` | `{ type }` (modo elegido) |
| `submit-pokemon` | `{ text }` (un intento por ronda, máximo 100 caracteres) |
| `leave-room` | — |

| Servidor → cliente | Cuándo |
|---|---|
| `room-state` | Al entrar o reconectar: estado completo de la partida |
| `player-joined`, `game-starting`, `choose-types`, `round-started` | Avance de la partida |
| `type-received`, `answer-received` | Confirman la recepción, sin decir si acertaste |
| `round-result` | Resultado de ambos jugadores al cerrar la ronda |
| `game-ended` | Ganador, motivo, equipos y totales |
| `opponent-disconnected`, `opponent-reconnected` | Caída y vuelta del rival |
| `error` | `{ code, message }` |
````

- [ ] **Step 4: Actualizar la spec de la etapa 2 con lo que se decidió al implementar**

En `docs/superpowers/specs/2026-09-30-etapa-2-motor-de-juego-design.md`, tres cambios.

(a) En la sección 4.3, reemplazar la línea:

```
Resultados posibles: `VALID`, `NOT_FOUND`, `WRONG_TYPES`, `ALREADY_OWNED`, `TAKEN`, `NO_ANSWER`. Las respuestas de un jugador desconectado que llegaron antes de caerse sí cuentan.
```

por:

```
Resultados posibles: `VALID`, `NOT_FOUND`, `WRONG_TYPES`, `ALREADY_OWNED`, `TAKEN`, `NO_ANSWER`. `ALREADY_OWNED` significa que el Pokémon ya está en tu propio equipo; `TAKEN`, que lo tiene el rival (de una ronda anterior) o que perdiste la carrera de esta ronda. Las respuestas de un jugador desconectado que llegaron antes de caerse sí cuentan.
```

(b) En la sección 4.1, después de la línea que empieza con `- El creador ocupa el asiento 1`, agregar:

```
- Si quien se unió sale antes de empezar (`leave-room`), su asiento queda libre y otra persona puede entrar; si sale el creador, la sala se cancela (`cancelled`). Un cliente que quiera cancelar una sala en espera se conecta por socket, hace `join-room` y luego `leave-room`; si no, la sala caduca a los 10 minutos.
```

(c) En la sección 6, en la tabla de eventos servidor → cliente, agregar esta fila después de la de `choose-types`:

```
| `type-received` | `{ round }` (solo a quien eligió; confirma la recepción sin revelar el tipo) |
```

- [ ] **Step 5: Verificación final completa**

```bash
npm test
npm run typecheck
git status
```

Expected: **344 pruebas pasan** (31 archivos); `tsc` sin errores; `git status` solo muestra `README.md`, `server/package.json`, `server/scripts/smoke-game.ts` y la spec (nada de `.env` ni `.env.test`).

- [ ] **Step 6: Commit y publicar la rama**

```bash
git add -A
git commit -m "docs: README y spec tras la etapa 2; script de prueba de humo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin etapa-2-motor
```

Expected: rama `etapa-2-motor` en `https://github.com/marcovinir/pokemon-minigames`. La integración a `main` la decide Marco.

---

## Self-Review

**Cobertura de la spec de la etapa 2:**

| Requisito | Tarea |
|---|---|
| `shared/` con eventos, payloads y códigos de error (verificado con TS 7/Vitest/tsx) | 1 |
| Constantes de tiempo y límites; `Rng` inyectable | 2 |
| `PokemonCatalog` en memoria, filtro de Pokémon incompletos, pares jugables | 3 |
| Resolución de ronda: normalizar, validar, carrera con ventana de 500 ms, códigos de resultado | 4 |
| Fases, cuenta atrás, modo aleatorio y elegido (reemplazo de pares con aviso), 4 condiciones de fin, agotamiento de pares | 5 |
| Desconexión (reloj sigue, gracia de 30 s, ambos caídos → abandonada), abandono voluntario, caducidad de la sala | 5 |
| Visibilidad (equipo rival oculto) y `room-state` | 5 |
| `GameRoom`, puertos, guardado ordenado con reintentos, persistencia ronda a ronda | 6 |
| `abandonUnfinished` al arrancar | 6 (repositorio) y 8 (`index.ts`) |
| Código de sala, una partida activa por usuario, unirse, `ROOM_*` | 7 |
| REST de salas con validación de rangos, Socket.io, rate limit, reconexión, segunda pestaña | 8 |
| E2E de una partida completa aleatoria y otra elegida, con lo guardado en BD | 9 |
| Prueba con el catálogo real y temporizadores reales | 10 |

**Decisiones tomadas al escribir el plan (la spec las recoge en la Task 10):** el evento `type-received` (confirmación de recepción del tipo elegido, análoga a `answer-received`); la definición de `TAKEN` frente a `ALREADY_OWNED`; y qué ocurre cuando sale quien se unió antes de empezar.

**Fuera de esta etapa:** cliente React (etapa 3), estadísticas y perfil (etapa 4), despliegue, límite de intentos de login y los pendientes de endurecimiento heredados de la etapa 1 (etapa 5), Redis.

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 344 pruebas en verde, `tsc` sin errores, 10 mutaciones a propósito detectadas por las pruebas, y una partida real contra el catálogo de 1025 Pokémon con temporizadores reales.
