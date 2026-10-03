# Pokémon Minigames — Etapa 4: Estadísticas y perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada persona vea cómo le va (partidas ganadas, empatadas y perdidas, rachas, Pokémon más ganados, poder promedio), repase su historial y abra el perfil de su rival, y que su preferencia de tema quede guardada en su perfil.

**Architecture:** Las estadísticas no se guardan: se calculan al pedirlas a partir de `games`, `game_players` y `round_picks`, con una capa de datos de consultas finas (`StatsService`) y una capa de cálculo de funciones puras (`calculate.ts`) que usa el `PokemonCatalog` en memoria. Una migración agrega el motivo del fin de cada partida (`games.end_reason`), la preferencia de tema (`users.theme`, `users.theme_mode`) y dos índices por jugador, con restricciones que mantienen todo coherente. El cliente agrega una pantalla de perfil (propio, con historial paginado por cursor, y ajeno, solo estadísticas) y `syncThemeWithSession`, que mantiene de acuerdo el tema del perfil y el del navegador.

**Tech Stack:** Sin cambios: Node 24, TypeScript 7, Express 5, Prisma 7.10.0, PostgreSQL 18, Zod 4, Vitest 5; React 19, React Router 8, Zustand 5, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-03-etapa-4-estadisticas-design.md` (complementa la general y las de las etapas 2 y 3; donde la de la etapa 4 es más específica, manda).

## Global Constraints

- Solo cuentan las partidas `completed`. Las `abandoned`, `waiting` e `in_progress` no cuentan para ninguna estadística ni aparecen en el historial.
- Los datos no se duplican: no hay tablas de estadísticas ni vistas materializadas; todo se calcula al pedirlo.
- Todas las rutas nuevas exigen sesión (`Authorization: Bearer`). El perfil de otra persona nunca incluye correo, historial, identificadores internos ni códigos de sala; el historial propio nunca incluye códigos de sala.
- El perfil ajeno vive en `GET /users/:username/stats` y no en `/stats/:username`, porque `history` es un nombre de usuario válido y chocaría con `/stats/history`.
- `GET /stats/history`: `limit` de 1 a 50 (por defecto 20); `before` es un cursor opaco; orden por fecha de fin descendente y luego por id descendente.
- La racha se cuenta desde la partida más reciente: un empate o una derrota la corta. Con la misma fecha de fin, la partida de id mayor es la más reciente.
- Los Pokémon más ganados son 3; con igual cantidad gana el de id más bajo. El poder promedio y el porcentaje llevan la definición de la spec (un decimal / empates cuentan como jugadas).
- La base de datos hace cumplir la coherencia: `end_reason` según `status`, y tema y modo siempre juntos (los dos nulos o los dos con valor).
- Mensajes al usuario en español; identificadores de código en inglés. Los colores salen de los tokens de tema; el texto cumple contraste AA y no usa opacidad.
- Se sigue TDD: cada comportamiento se prueba antes de implementarlo.
- Versiones: `prisma`, `@prisma/client` y `@prisma/adapter-pg` siguen fijadas en **7.10.0**. No ejecutes `npm audit fix --force`. Las credenciales de PostgreSQL y los secretos nunca se versionan.

## Review Focus

Condiciones que la spec no detalla pero que muerden a una persona real; cada una tiene su prueba en la tarea indicada.

1. **Estadísticas correctas.** Las partidas abandonadas, en espera o en curso no cuentan; un empate corta la racha; la racha sigue el orden de fin y no el de creación, ni siquiera con partidas que terminan en el mismo instante; los Pokémon de otra persona o de partidas no completadas no se mezclan; un id que ya no está en el catálogo no rompe nada. → Task 4 (`calculate.test.ts`) y Task 5 (`stats.service.test.ts`).
2. **Privacidad.** El perfil ajeno no filtra correo, ids, historial ni códigos de sala; el guion bajo de un nombre no actúa como comodín; un usuario llamado `history` no choca con la ruta del historial; un nombre que nunca podría existir da 404, no un error del servidor. → Task 5 y Task 6 (`stats.routes.test.ts`).
3. **Paginación del historial.** El cursor no repite ni salta partidas aunque dos terminen en el mismo instante; el límite acepta 1 y 50 y rechaza 0, 51, decimales y texto; un cursor inválido es un 400; con exactamente tantas partidas como el límite no hay página siguiente; dos pulsaciones seguidas de "Cargar más" piden la página una sola vez, un fallo conserva lo ya cargado y, al llegar la página, el foco pasa a su primera partida (el botón puede desaparecer con la última página) y se anuncia. → Task 5, Task 6 y Task 10 (`profile.test.tsx`).
4. **Integridad en la base de datos.** El motivo del fin no puede contradecir el estado de la partida y guardar el final es atómico (un motivo incoherente no deja la partida a medias); tema y modo no pueden guardarse por separado; los enums de la base son los mismos que los de `shared/`; la migración no se desvía del esquema de Prisma. → Task 1, Task 2 y Task 3.
5. **Tema entre dispositivos y estados de la pantalla.** La preferencia del servidor gana al iniciar sesión; aplicarla no se vuelve a guardar (sin eco ni bucle) y un cambio del tema del sistema tampoco; los valores por defecto nunca se suben como si fueran una elección; un fallo de red al guardar se ignora; cerrar sesión conserva el tema; una respuesta que llega tarde a la pantalla de perfil no pisa a la nueva; carga, error con reintento, 404 y vacío tienen su pantalla. → Task 9 y Task 10.

---

## File Structure

```
pokemon-minigames/
├── shared/src/ preferences.ts  stats.ts            # NUEVOS: tema y modo; Stats, HistoryEntry, HistoryPage
│               (errors.ts USER_NOT_FOUND; types.ts GAME_END_REASONS)
├── server/
│   ├── prisma/ schema.prisma  migrations/20261003120000_game_end_reason_and_theme_preferences/
│   ├── src/
│   │   ├── stats/ calculate.ts  cursor.ts  stats.service.ts  stats.schemas.ts  stats.routes.ts   # NUEVO
│   │   ├── auth/  (preferencias de tema: schemas, service, routes)
│   │   └── game/  (FinishInput.reason: ports, room, prisma-game-repository)
│   └── test/ stats/  helpers/games.ts  auth/preferences.test.ts  shared/db-contract.test.ts
└── client/
    ├── scripts/ dev-games.mjs                       # NUEVO: partidas reales con resultado controlado
    ├── src/
    │   ├── pages/profile/ ProfilePage  StatsView  HistoryList  format.ts  use-load.ts   # NUEVO
    │   ├── theme/ theme-sync.ts                      # NUEVO (theme-store: setPreference, hasChoice)
    │   ├── api/ (stats y preferencias)  i18n/es.ts (textos del historial)
    │   └── routes.tsx  components/Header.tsx  pages/room/SummaryView.tsx
    └── test/ pages/profile*.test.tsx  theme/theme-sync.test.ts  i18n/  services.test.ts  api/proxy.test.ts
```

La capa de cálculo (`calculate.ts`) no toca la base de datos ni Express: recibe filas ya leídas y el catálogo. El servicio hace las consultas y la ruta solo valida y delega.

## Notas de entorno (leer antes de empezar)

- Se parte de `main` con las etapas 1 a 3 completas (669 pruebas). Trabaja en una rama `etapa-4-estadisticas`.
- `server/.env` y `server/.env.test` ya existen (rol `pokemon_app`). Las pruebas del servidor usan `pokemon_minigames_test` y **borran datos**; su preparación global aplica las migraciones pendientes a esa base.
- La migración de esta etapa es aditiva (columnas nulas, enums, índices y restricciones). Para tu base de desarrollo, aplícala con `npm run db:deploy -w server` (la Task 11 lo indica). Después de cambiar `schema.prisma` hay que regenerar el cliente de Prisma: `npm run db:generate -w server` (también lo hace `npm install`).
- Todo el código de este plan se ejecutó antes de incluirlo, tarea por tarea, en un clon limpio de `main`: 487 pruebas de servidor y 392 de cliente en verde, `tsc` sin errores y `vite build` correcto; además se recorrió en un navegador real contra el servidor real con partidas de resultado controlado.
- Si el equipo va justo de CPU, las pruebas de interfaz del cliente pueden agotar los 5 s por defecto: ejecútalas con `npx vitest run --testTimeout=30000 --maxWorkers=2` desde `client/` (no hace falta cambiar nada en el repositorio).
- Puertos: servidor del juego 3000, cliente (Vite) 5173. Si el 3000 está ocupado por un servidor viejo, detenlo antes de arrancar.
- npm 12 bloquea los scripts de instalación de algunas dependencias y lo avisa: es normal.
- La verificación de la Task 11 deja usuarios `anfitrion_x` y `rival_y` y sus partidas en la base de **desarrollo**; el script imprime el SQL para borrarlos.

---

### Task 1: Esquema y migración (motivo del fin, tema en el perfil, índices)

**Files:**
- Create: `server/prisma/migrations/20261003120000_game_end_reason_and_theme_preferences/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Test: `server/test/db/schema.test.ts`

**Interfaces:**
- Produces (cliente de Prisma regenerado): `Game.endReason: GameEndReason | null`; `User.theme: ThemeName | null`, `User.themeMode: ThemeMode | null`; enums de base de datos `game_end_reason` (`completed`, `forfeit`, `disconnect`, `exhausted`, `cancelled`, `expired`, `abandoned`), `theme_name` (`clasico`, `pokedex`) y `theme_mode` (`auto`, `claro`, `oscuro`); índices `game_players_user_id_idx` y `round_picks_user_id_idx`.
- Restricciones: `games_end_reason_check` (`waiting` e `in_progress` sin motivo; `completed` solo con `completed`, `forfeit`, `disconnect` o `exhausted`; `abandoned` solo con `cancelled`, `expired` o `abandoned`; nulo siempre vale) y `users_theme_pair_check` (tema y modo, los dos nulos o los dos con valor).

- [ ] **Step 1: Escribir las pruebas que fallan**

Las pruebas del esquema comprueban las restricciones por su efecto (una escritura incoherente se rechaza) y que existen los índices:

```diff
diff --git a/server/test/db/schema.test.ts b/server/test/db/schema.test.ts
index 1b3a964..683f741 100644
--- a/server/test/db/schema.test.ts
+++ b/server/test/db/schema.test.ts
@@ -74,6 +74,75 @@ describe("games", () => {
   });
 });
 
+describe("motivo del fin de la partida", () => {
+  const base = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 } as const;
+  let n = 0;
+  const create = (status: "waiting" | "in_progress" | "completed" | "abandoned", endReason?: string) =>
+    prisma.game.create({
+      data: { ...base, roomCode: `END${++n}`, status, endReason: endReason as never },
+    });
+
+  it("acepta una partida sin motivo en cualquier estado (las anteriores a la migración no lo tienen)", async () => {
+    for (const status of ["waiting", "in_progress", "completed", "abandoned"] as const) {
+      await expect(create(status)).resolves.toBeTruthy();
+    }
+  });
+
+  it("una partida terminada solo admite los motivos de una partida terminada", async () => {
+    for (const reason of ["completed", "forfeit", "disconnect", "exhausted"]) {
+      await expect(create("completed", reason)).resolves.toBeTruthy();
+    }
+    for (const reason of ["cancelled", "expired", "abandoned"]) {
+      await expect(create("completed", reason)).rejects.toThrow();
+    }
+  });
+
+  it("una partida abandonada solo admite los motivos de una sala que no llegó a terminar", async () => {
+    for (const reason of ["cancelled", "expired", "abandoned"]) {
+      await expect(create("abandoned", reason)).resolves.toBeTruthy();
+    }
+    for (const reason of ["completed", "forfeit", "disconnect", "exhausted"]) {
+      await expect(create("abandoned", reason)).rejects.toThrow();
+    }
+  });
+
+  it("una partida en espera o en curso no puede tener motivo", async () => {
+    await expect(create("waiting", "completed")).rejects.toThrow();
+    await expect(create("in_progress", "forfeit")).rejects.toThrow();
+  });
+});
+
+describe("preferencia de tema", () => {
+  const user = (n: number, extra: object) =>
+    prisma.user.create({ data: { email: `t${n}@example.com`, username: `tema${n}`, passwordHash: "h", ...extra } });
+
+  it("un usuario nuevo no tiene preferencia", async () => {
+    const created = await user(1, {});
+    expect(created).toMatchObject({ theme: null, themeMode: null });
+  });
+
+  it("acepta tema y modo juntos", async () => {
+    await expect(user(2, { theme: "pokedex", themeMode: "oscuro" })).resolves.toMatchObject({
+      theme: "pokedex",
+      themeMode: "oscuro",
+    });
+  });
+
+  it("rechaza guardar el tema sin el modo o el modo sin el tema", async () => {
+    await expect(user(3, { theme: "clasico" })).rejects.toThrow();
+    await expect(user(4, { themeMode: "auto" })).rejects.toThrow();
+  });
+});
+
+describe("índices por jugador", () => {
+  it("existen los índices para buscar partidas y respuestas por usuario", async () => {
+    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
+      SELECT indexname FROM pg_indexes
+      WHERE indexname IN ('game_players_user_id_idx', 'round_picks_user_id_idx') ORDER BY indexname`;
+    expect(rows.map((r) => r.indexname)).toEqual(["game_players_user_id_idx", "round_picks_user_id_idx"]);
+  });
+});
+
 describe("rondas y respuestas", () => {
   async function setupRound() {
     await prisma.type.createMany({
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
git switch -c etapa-4-estadisticas
npm test -w server -- test/db/schema.test.ts
```

Expected: FAIL — `PrismaClientValidationError` (el cliente todavía no conoce `endReason`, `theme` ni `themeMode`) y el índice no existe.

- [ ] **Step 3: Implementar el esquema y la migración**

`server/prisma/schema.prisma` (tres enums nuevos, las columnas y los dos índices; `prisma format` realinea las columnas, por eso el diff toca más líneas de las que cambian):

```diff
diff --git a/server/prisma/schema.prisma b/server/prisma/schema.prisma
index 53228b3..982df3f 100644
--- a/server/prisma/schema.prisma
+++ b/server/prisma/schema.prisma
@@ -48,6 +48,33 @@ enum PickResult {
   @@map("pick_result")
 }
 
+enum GameEndReason {
+  completed
+  forfeit
+  disconnect
+  exhausted
+  cancelled
+  expired
+  abandoned
+
+  @@map("game_end_reason")
+}
+
+enum ThemeName {
+  clasico
+  pokedex
+
+  @@map("theme_name")
+}
+
+enum ThemeMode {
+  auto
+  claro
+  oscuro
+
+  @@map("theme_mode")
+}
+
 model Type {
   id   Int    @id
   name String @unique
@@ -104,11 +131,14 @@ model PokemonName {
 }
 
 model User {
-  id           String   @id @default(uuid()) @db.Uuid
-  email        String   @unique
+  id           String     @id @default(uuid()) @db.Uuid
+  email        String     @unique
   username     String
-  passwordHash String   @map("password_hash")
-  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
+  passwordHash String     @map("password_hash")
+  createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
+  // Preferencia de tema: los dos nulos o los dos con valor (lo exige una restricción).
+  theme        ThemeName?
+  themeMode    ThemeMode? @map("theme_mode")
 
   refreshTokens RefreshToken[]
   gamePlayers   GamePlayer[]
@@ -133,16 +163,18 @@ model RefreshToken {
 }
 
 model Game {
-  id          String     @id @default(uuid()) @db.Uuid
-  roomCode    String     @unique @map("room_code") @db.VarChar(10)
-  typeMode    TypeMode   @map("type_mode")
-  lengthMode  LengthMode @map("length_mode")
-  roundsLimit Int?       @map("rounds_limit")
-  statsGoal   Int?       @map("stats_goal")
-  status      GameStatus @default(waiting)
-  winnerId    String?    @map("winner_id") @db.Uuid
-  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
-  endedAt     DateTime?  @map("ended_at") @db.Timestamptz(3)
+  id          String         @id @default(uuid()) @db.Uuid
+  roomCode    String         @unique @map("room_code") @db.VarChar(10)
+  typeMode    TypeMode       @map("type_mode")
+  lengthMode  LengthMode     @map("length_mode")
+  roundsLimit Int?           @map("rounds_limit")
+  statsGoal   Int?           @map("stats_goal")
+  status      GameStatus     @default(waiting)
+  // Nulo mientras la partida no termina y en las anteriores a esta columna; la restricción lo liga a `status`.
+  endReason   GameEndReason? @map("end_reason")
+  winnerId    String?        @map("winner_id") @db.Uuid
+  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
+  endedAt     DateTime?      @map("ended_at") @db.Timestamptz(3)
 
   winner  User?        @relation(fields: [winnerId], references: [id])
   players GamePlayer[]
@@ -162,6 +194,7 @@ model GamePlayer {
 
   @@id([gameId, seat])
   @@unique([gameId, userId])
+  @@index([userId])
   @@map("game_players")
 }
 
@@ -195,5 +228,6 @@ model RoundPick {
   pokemon Pokemon? @relation(fields: [pokemonId], references: [id])
 
   @@unique([roundId, userId])
+  @@index([userId])
   @@map("round_picks")
 }
```

La migración, a mano: las restricciones `CHECK` no se pueden expresar en el esquema de Prisma, así que la migración las agrega junto con lo demás, `server/prisma/migrations/20261003120000_game_end_reason_and_theme_preferences/migration.sql`:

```
-- Motivo del fin de cada partida y preferencia de tema de cada usuario (etapa 4).

-- CreateEnum
CREATE TYPE "game_end_reason" AS ENUM ('completed', 'forfeit', 'disconnect', 'exhausted', 'cancelled', 'expired', 'abandoned');

-- CreateEnum
CREATE TYPE "theme_name" AS ENUM ('clasico', 'pokedex');

-- CreateEnum
CREATE TYPE "theme_mode" AS ENUM ('auto', 'claro', 'oscuro');

-- AlterTable
ALTER TABLE "games" ADD COLUMN "end_reason" "game_end_reason";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme" "theme_name",
ADD COLUMN "theme_mode" "theme_mode";

-- CreateIndex
CREATE INDEX "game_players_user_id_idx" ON "game_players"("user_id");

-- CreateIndex
CREATE INDEX "round_picks_user_id_idx" ON "round_picks"("user_id");

-- El motivo debe ser coherente con el estado: una partida en espera o en curso no tiene motivo;
-- una terminada solo admite los motivos de una partida terminada y una abandonada, los de una
-- sala que no llegó a terminar (el mismo reparto que hace el motor). Nulo vale siempre: las
-- partidas anteriores a esta migración no lo tienen.
ALTER TABLE "games" ADD CONSTRAINT "games_end_reason_check" CHECK (
  "end_reason" IS NULL
  OR ("status" = 'completed' AND "end_reason" IN ('completed', 'forfeit', 'disconnect', 'exhausted'))
  OR ("status" = 'abandoned' AND "end_reason" IN ('cancelled', 'expired', 'abandoned'))
);

-- La preferencia de tema se guarda entera o no se guarda.
ALTER TABLE "users" ADD CONSTRAINT "users_theme_pair_check" CHECK (("theme" IS NULL) = ("theme_mode" IS NULL));
```

Regenerar el cliente de Prisma:

```bash
npm run db:generate -w server
```

- [ ] **Step 4: Ejecutar y verificar que pasa, y que la migración no se desvía del esquema**

```bash
npm test -w server -- test/db/schema.test.ts
cd server && node --env-file=.env.test ../node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; cd ..
npm run typecheck
```

Expected: PASS (22 pruebas); `migrate diff` imprime `No difference detected.` (la base de pruebas ya tiene la migración aplicada por la preparación global de Vitest y coincide con `schema.prisma`); `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): motivo del fin de la partida, preferencia de tema e índices por jugador" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Contrato compartido y textos en español

**Files:**
- Create: `shared/src/preferences.ts`, `shared/src/stats.ts`, `server/test/shared/db-contract.test.ts`, `client/test/i18n/es.test.ts`
- Modify: `shared/src/errors.ts`, `shared/src/types.ts`, `shared/src/index.ts`, `client/src/i18n/es.ts`
- Test: `server/test/shared/contract.test.ts`

**Interfaces:**
- Produces (paquete `@pokemon-minigames/shared`): `THEME_NAMES`, `ThemeName`, `THEME_MODES`, `ThemeMode`, `ThemePreferences { theme, themeMode }`; `GAME_END_REASONS` (`as const`, mismo orden que el enum de la base) y `GameEndReason`; el código de error `USER_NOT_FOUND`; `GameResult` (`"won" | "drawn" | "lost"`), `HISTORY_DEFAULT_LIMIT` (20), `HISTORY_MAX_LIMIT` (50), `TopPokemon { pokemon: PokemonView; wins }`, `Stats`, `StatsResponse { username, stats }`, `HistoryEntry`, `HistoryPage { games, nextCursor }`.
- Produces (cliente, `i18n/es.ts`): `RESULT_LABELS: Record<GameResult, string>`, `HISTORY_REASON_LABELS: Record<GameEndReason, Record<GameResult, string>>` (exhaustivo), `historyReason(reason | null, result)` (un motivo nulo se muestra como una partida normal), `describeConfig(config)` ("Tipos aleatorios · 3 rondas", "Tipos elegidos · hasta 1 ronda", "… · meta de 2500 puntos") y el mensaje de `USER_NOT_FOUND` ("No encontramos a ese jugador.").
- El tipo de error del cliente (`Record<ErrorCode, string>`) obliga a traducir el código nuevo en la misma tarea que se agrega.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/shared/contract.test.ts` (el código de error y las listas sin repetir):

```diff
diff --git a/server/test/shared/contract.test.ts b/server/test/shared/contract.test.ts
index e14b326..6c814e3 100644
--- a/server/test/shared/contract.test.ts
+++ b/server/test/shared/contract.test.ts
@@ -1,4 +1,11 @@
-import { ERROR_CODES, TYPE_NAMES, normalizeName as sharedNormalizeName } from "@pokemon-minigames/shared";
+import {
+  ERROR_CODES,
+  GAME_END_REASONS,
+  THEME_MODES,
+  THEME_NAMES,
+  TYPE_NAMES,
+  normalizeName as sharedNormalizeName,
+} from "@pokemon-minigames/shared";
 import { describe, expect, it } from "vitest";
 import { normalizeName as serverNormalizeName } from "../../src/catalog/normalize.js";
 import { TYPE_NAMES as SNAPSHOT_TYPE_NAMES, typeId } from "../../src/catalog/snapshot.js";
@@ -18,6 +25,17 @@ describe("paquete shared", () => {
     expect(sharedNormalizeName("  Épsilon ")).toBe("epsilon");
   });
 
+  it("incluye el código de jugador inexistente", () => {
+    expect(ERROR_CODES).toContain("USER_NOT_FOUND");
+  });
+
+  it("los motivos de fin y las opciones de tema no se repiten", () => {
+    expect(new Set(GAME_END_REASONS).size).toBe(GAME_END_REASONS.length);
+    expect(GAME_END_REASONS).toHaveLength(7);
+    expect(THEME_NAMES).toEqual(["clasico", "pokedex"]);
+    expect(THEME_MODES).toEqual(["auto", "claro", "oscuro"]);
+  });
+
   it("los códigos de error no se repiten e incluyen los de salas y partida", () => {
     expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
     for (const code of ["ALREADY_IN_GAME", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_CLOSED", "NOT_IN_ROOM", "WRONG_PHASE", "ALREADY_ANSWERED", "ALREADY_CHOSEN", "INVALID_TYPE", "RATE_LIMITED"]) {
```

`server/test/shared/db-contract.test.ts` (los enums de la base de datos son los de `shared/`, en el mismo orden):

```ts
import { GAME_END_REASONS, THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";

afterAll(() => prisma.$disconnect());

async function enumValues(typeName: "game_end_reason" | "theme_name" | "theme_mode"): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
    `SELECT unnest(enum_range(NULL::${typeName}))::text AS value`,
  );
  return rows.map((row) => row.value);
}

describe("los enums de la base de datos son los de shared", () => {
  it("motivos de fin de la partida", async () => {
    expect(await enumValues("game_end_reason")).toEqual([...GAME_END_REASONS]);
  });

  it("tema y modo", async () => {
    expect(await enumValues("theme_name")).toEqual([...THEME_NAMES]);
    expect(await enumValues("theme_mode")).toEqual([...THEME_MODES]);
  });
});
```

`client/test/i18n/es.test.ts`:

```ts
import { GAME_END_REASONS, type GameResult } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { RESULT_LABELS, describeConfig, errorMessage, historyReason } from "../../src/i18n/es";

const RESULTS: GameResult[] = ["won", "drawn", "lost"];

describe("textos del historial", () => {
  it("cada resultado tiene su palabra", () => {
    expect(RESULT_LABELS).toEqual({ won: "Ganaste", drawn: "Empate", lost: "Perdiste" });
  });

  it("todos los motivos de fin tienen un texto para cada resultado, y ninguno está vacío", () => {
    for (const reason of GAME_END_REASONS) {
      for (const result of RESULTS) {
        expect(historyReason(reason, result), `${reason}/${result}`).not.toBe("");
      }
    }
  });

  it("el motivo se cuenta desde el lado de quien mira", () => {
    expect(historyReason("forfeit", "won")).toBe("Tu rival abandonó");
    expect(historyReason("forfeit", "lost")).toBe("Abandonaste la partida");
    expect(historyReason("disconnect", "won")).toBe("Tu rival se desconectó");
    expect(historyReason("disconnect", "lost")).toBe("Te desconectaste");
    expect(historyReason("exhausted", "won")).toBe("Se agotaron los pares de tipos jugables");
  });

  it("una partida sin motivo guardado se muestra como una partida normal", () => {
    expect(historyReason(null, "won")).toBe(historyReason("completed", "won"));
    expect(historyReason("completed", "drawn")).toBe("La partida terminó");
  });

  it("describe la configuración de la partida", () => {
    const base = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null } as const;
    expect(describeConfig(base)).toBe("Tipos aleatorios · 3 rondas");
    expect(describeConfig({ ...base, typeMode: "chosen", lengthMode: "custom", roundsLimit: 7 })).toBe(
      "Tipos elegidos · hasta 7 rondas",
    );
    expect(describeConfig({ ...base, lengthMode: "custom", roundsLimit: null, statsGoal: 2500 })).toBe(
      "Tipos aleatorios · meta de 2500 puntos",
    );
  });

  it("concuerda en singular cuando el máximo es una sola ronda", () => {
    const base = { typeMode: "random", lengthMode: "custom", roundsLimit: 1, statsGoal: null } as const;
    expect(describeConfig(base)).toBe("Tipos aleatorios · hasta 1 ronda");
  });
});

describe("mensajes de error", () => {
  it("un jugador inexistente tiene su propio mensaje, no el genérico", () => {
    expect(errorMessage("USER_NOT_FOUND")).toBe("No encontramos a ese jugador.");
    expect(errorMessage("USER_NOT_FOUND")).not.toBe(errorMessage("INTERNAL_ERROR"));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/shared
npm test -w client -- test/i18n
```

Expected: FAIL — `USER_NOT_FOUND`, `GAME_END_REASONS`, `THEME_NAMES` y `THEME_MODES` no existen en `shared/`; `RESULT_LABELS`, `historyReason` y `describeConfig` no existen en el cliente.

- [ ] **Step 3: Implementar**

`shared/src/errors.ts`:

```diff
diff --git a/shared/src/errors.ts b/shared/src/errors.ts
index 6589192..71960f6 100644
--- a/shared/src/errors.ts
+++ b/shared/src/errors.ts
@@ -7,6 +7,7 @@ export const ERROR_CODES = [
   "UNAUTHORIZED",
   "INVALID_REFRESH_TOKEN",
   "NOT_FOUND",
+  "USER_NOT_FOUND",
   "INTERNAL_ERROR",
   // Salas (REST)
   "ALREADY_IN_GAME",
```

`shared/src/types.ts` (el tipo `GameEndReason` pasa a salir de una lista, para poder compararla con la base de datos):

```diff
diff --git a/shared/src/types.ts b/shared/src/types.ts
index ed10b58..3a191b7 100644
--- a/shared/src/types.ts
+++ b/shared/src/types.ts
@@ -45,7 +45,16 @@ export type GamePhase = "waiting" | "starting" | "choosing_types" | "round_activ
  * Por qué terminó la partida. completed, forfeit, disconnect y exhausted son partidas
  * terminadas; cancelled, expired y abandoned quedan como abandonadas.
  */
-export type GameEndReason = "completed" | "forfeit" | "disconnect" | "exhausted" | "cancelled" | "expired" | "abandoned";
+export const GAME_END_REASONS = [
+  "completed",
+  "forfeit",
+  "disconnect",
+  "exhausted",
+  "cancelled",
+  "expired",
+  "abandoned",
+] as const;
+export type GameEndReason = (typeof GAME_END_REASONS)[number];
 
 export interface RoomConfig {
   typeMode: TypeMode;
```

`shared/src/preferences.ts`:

```ts
export const THEME_NAMES = ["clasico", "pokedex"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_MODES = ["auto", "claro", "oscuro"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Preferencia de tema guardada en el perfil: siempre los dos valores juntos. */
export interface ThemePreferences {
  theme: ThemeName;
  themeMode: ThemeMode;
}
```

`shared/src/stats.ts`:

```ts
import type { GameEndReason, PokemonView, RoomConfig } from "./types.js";

/** Cómo terminó una partida para quien la mira. */
export type GameResult = "won" | "drawn" | "lost";

export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

export interface TopPokemon {
  pokemon: PokemonView;
  /** Veces que la persona ganó este Pokémon en una ronda. */
  wins: number;
}

/** Estadísticas de una persona; solo cuentan las partidas completadas. */
export interface Stats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** De 0 a 1; nulo si no ha jugado ninguna. */
  winRate: number | null;
  /** Victorias consecutivas más recientes; un empate o una derrota la corta. */
  currentStreak: number;
  bestStreak: number;
  /** Promedio de total_stats de los Pokémon ganados, con un decimal; nulo si no ganó ninguno. */
  averagePower: number | null;
  /** Mayor puntaje final de una partida completada; nulo si no ha jugado. */
  bestGameScore: number | null;
  topPokemon: TopPokemon[];
}

/** Respuesta de `GET /stats` y `GET /users/:username/stats`. */
export interface StatsResponse {
  username: string;
  stats: Stats;
}

export interface HistoryEntry {
  id: string;
  /** Fecha de fin, en ISO 8601. */
  endedAt: string;
  result: GameResult;
  /** Nulo en las partidas anteriores a que se guardara el motivo. */
  reason: GameEndReason | null;
  opponent: { username: string };
  myScore: number | null;
  opponentScore: number | null;
  config: RoomConfig;
}

/** Respuesta de `GET /stats/history`. */
export interface HistoryPage {
  games: HistoryEntry[];
  /** Cursor opaco para pedir la página siguiente; nulo en la última. */
  nextCursor: string | null;
}
```

`shared/src/index.ts`:

```diff
diff --git a/shared/src/index.ts b/shared/src/index.ts
index 2e7b68d..9c6e213 100644
--- a/shared/src/index.ts
+++ b/shared/src/index.ts
@@ -1,5 +1,7 @@
 export * from "./errors.js";
 export * from "./events.js";
 export * from "./normalize.js";
+export * from "./preferences.js";
 export * from "./rooms.js";
+export * from "./stats.js";
 export * from "./types.js";
```

`client/src/i18n/es.ts` (mensaje del código nuevo, textos del historial y descripción de la configuración):

```diff
diff --git a/client/src/i18n/es.ts b/client/src/i18n/es.ts
index 5194c42..910a9f2 100644
--- a/client/src/i18n/es.ts
+++ b/client/src/i18n/es.ts
@@ -1,4 +1,4 @@
-import type { BaseStats, ErrorCode, GameEndReason, PickResult, TypeName } from "@pokemon-minigames/shared";
+import type { BaseStats, ErrorCode, GameEndReason, GameResult, PickResult, RoomConfig, TypeName } from "@pokemon-minigames/shared";
 
 export const TYPE_LABELS: Record<TypeName, string> = {
   normal: "normal",
@@ -31,6 +31,7 @@ const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
   UNAUTHORIZED: "Tu sesión expiró. Inicia sesión de nuevo.",
   INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
   NOT_FOUND: "No encontramos lo que buscas.",
+  USER_NOT_FOUND: "No encontramos a ese jugador.",
   INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
   ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
   ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
@@ -73,6 +74,38 @@ export const END_REASON_LABELS: Record<GameEndReason, string> = {
   abandoned: "La partida se abandonó",
 };
 
+export const RESULT_LABELS: Record<GameResult, string> = { won: "Ganaste", drawn: "Empate", lost: "Perdiste" };
+
+const SAME_FOR_ALL = (text: string): Record<GameResult, string> => ({ won: text, drawn: text, lost: text });
+
+/** El motivo del fin contado desde el lado de quien mira su historial. */
+export const HISTORY_REASON_LABELS: Record<GameEndReason, Record<GameResult, string>> = {
+  completed: SAME_FOR_ALL("La partida terminó"),
+  forfeit: { won: "Tu rival abandonó", drawn: "Un jugador abandonó la partida", lost: "Abandonaste la partida" },
+  disconnect: { won: "Tu rival se desconectó", drawn: "Un jugador se desconectó", lost: "Te desconectaste" },
+  exhausted: SAME_FOR_ALL("Se agotaron los pares de tipos jugables"),
+  cancelled: SAME_FOR_ALL("La sala se canceló"),
+  expired: SAME_FOR_ALL("La sala caducó"),
+  abandoned: SAME_FOR_ALL("La partida se abandonó"),
+};
+
+/** Las partidas anteriores a que se guardara el motivo (nulo) se muestran como una partida normal. */
+export function historyReason(reason: GameEndReason | null, result: GameResult): string {
+  return HISTORY_REASON_LABELS[reason ?? "completed"][result];
+}
+
+/** "Tipos aleatorios · 3 rondas", "Tipos elegidos · hasta 7 rondas", "Tipos aleatorios · meta de 2500 puntos". */
+export function describeConfig(config: RoomConfig): string {
+  const types = config.typeMode === "random" ? "Tipos aleatorios" : "Tipos elegidos";
+  const length =
+    config.statsGoal !== null
+      ? `meta de ${config.statsGoal} puntos`
+      : config.lengthMode === "fixed_rounds"
+        ? `${config.roundsLimit} rondas`
+        : `hasta ${config.roundsLimit} ${config.roundsLimit === 1 ? "ronda" : "rondas"}`;
+  return `${types} · ${length}`;
+}
+
 export const STAT_LABELS: Record<keyof BaseStats, string> = {
   hp: "PS",
   attack: "Ataque",
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/shared
npm test -w client -- test/i18n
npm run typecheck
```

Expected: PASS (7 pruebas de servidor y 7 de cliente) y `tsc` sin errores en los tres paquetes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): contrato de estadísticas, tema y motivos de fin; textos del historial en español" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: El motivo del fin llega a la base de datos

**Files:**
- Modify: `server/src/game/ports.ts`, `server/src/game/room.ts`, `server/src/game/prisma-game-repository.ts`
- Test (modificar): `server/test/game/room.test.ts`, `server/test/game/prisma-game-repository.test.ts`, `server/test/e2e/full-game.test.ts`

**Interfaces:**
- `FinishInput` gana `reason: GameEndReason` (el motor ya lo conoce en `outcome.reason`); `GameRoom` lo pasa al repositorio; `finish` guarda `endReason` junto con el estado en la misma transacción; `abandonUnfinished` marca `endReason: "abandoned"`.
- Una combinación incoherente (p. ej. `completed` con `expired`) la rechaza la base de datos y, como `finish` es una transacción, la partida no queda a medias.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/test/game/room.test.ts` (el motivo se guarda por cada camino: completada, abandono voluntario y sala caducada):

```diff
diff --git a/server/test/game/room.test.ts b/server/test/game/room.test.ts
index 62f5b5f..f2f8e08 100644
--- a/server/test/game/room.test.ts
+++ b/server/test/game/room.test.ts
@@ -75,7 +75,12 @@ describe("GameRoom", () => {
     await room.idle();
     expect(repository.calls).toEqual(["addSecondPlayer:u2", "markStarted", "saveRound:1", "finish:completed"]);
     expect(repository.rounds[0]!.picks.map((p) => p.result)).toEqual(["VALID", "NO_ANSWER"]);
-    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: "u1", finalStats: { 1: 500, 2: 0 } });
+    expect(repository.finishInput).toEqual({
+      status: "completed",
+      reason: "completed",
+      winnerUserId: "u1",
+      finalStats: { 1: 500, 2: 0 },
+    });
   });
 
   it("un empate se guarda sin ganador", async () => {
@@ -83,7 +88,20 @@ describe("GameRoom", () => {
     startGame(room, time);
     time.advance(15_000); // nadie responde
     await room.idle();
-    expect(repository.finishInput).toEqual({ status: "completed", winnerUserId: null, finalStats: { 1: 0, 2: 0 } });
+    expect(repository.finishInput).toEqual({
+      status: "completed",
+      reason: "completed",
+      winnerUserId: null,
+      finalStats: { 1: 0, 2: 0 },
+    });
+  });
+
+  it("un abandono voluntario se guarda con su motivo y le da la victoria al rival", async () => {
+    const { room, time, repository } = setup();
+    startGame(room, time);
+    room.dispatch({ type: "LEAVE", seat: 2 });
+    await room.idle();
+    expect(repository.finishInput).toMatchObject({ status: "completed", reason: "forfeit", winnerUserId: "u1" });
   });
 
   it("al terminar cancela los temporizadores pendientes y avisa una sola vez", () => {
@@ -110,7 +128,7 @@ describe("GameRoom", () => {
     expect(room.phase).toBe("finished");
     expect(onFinished).toHaveBeenCalledTimes(1);
     await room.idle();
-    expect(repository.finishInput).toMatchObject({ status: "abandoned", winnerUserId: null });
+    expect(repository.finishInput).toMatchObject({ status: "abandoned", reason: "expired", winnerUserId: null });
   });
 
   describe("guardado en la base de datos", () => {
```

`server/test/game/prisma-game-repository.test.ts`:

```diff
diff --git a/server/test/game/prisma-game-repository.test.ts b/server/test/game/prisma-game-repository.test.ts
index 13775c7..985c0bc 100644
--- a/server/test/game/prisma-game-repository.test.ts
+++ b/server/test/game/prisma-game-repository.test.ts
@@ -102,25 +102,34 @@ describe("createPrismaGameRepository", () => {
     expect(await prisma.round.count({ where: { gameId: id } })).toBe(0);
   });
 
-  it("finish guarda el resultado, el ganador y los stats finales por asiento", async () => {
+  it("finish guarda el resultado, el motivo, el ganador y los stats finales por asiento", async () => {
     const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
     await repository.addSecondPlayer(id, misty);
-    await repository.finish(id, { status: "completed", winnerUserId: misty, finalStats: { 1: 900, 2: 1200 } });
+    await repository.finish(id, { status: "completed", reason: "forfeit", winnerUserId: misty, finalStats: { 1: 900, 2: 1200 } });
 
     const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: { orderBy: { seat: "asc" } } } });
-    expect(game).toMatchObject({ status: "completed", winnerId: misty });
+    expect(game).toMatchObject({ status: "completed", endReason: "forfeit", winnerId: misty });
     expect(game.endedAt).toBeInstanceOf(Date);
     expect(game.players.map((p) => p.finalStats)).toEqual([900, 1200]);
   });
 
   it("finish de una partida abandonada no tiene ganador y solo actualiza los asientos que existen", async () => {
     const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
-    await repository.finish(id, { status: "abandoned", winnerUserId: null, finalStats: { 1: 0 } });
+    await repository.finish(id, { status: "abandoned", reason: "cancelled", winnerUserId: null, finalStats: { 1: 0 } });
     const game = await prisma.game.findUniqueOrThrow({ where: { id }, include: { players: true } });
-    expect(game).toMatchObject({ status: "abandoned", winnerId: null });
+    expect(game).toMatchObject({ status: "abandoned", endReason: "cancelled", winnerId: null });
     expect(game.players).toHaveLength(1);
   });
 
+  it("finish rechaza un motivo que no corresponde al estado y no deja la partida a medias", async () => {
+    const id = await repository.createGame({ roomCode: "ABC234", config, creatorUserId: ash });
+    await expect(
+      repository.finish(id, { status: "completed", reason: "expired", winnerUserId: null, finalStats: { 1: 0 } }),
+    ).rejects.toThrow();
+    const game = await prisma.game.findUniqueOrThrow({ where: { id } });
+    expect(game).toMatchObject({ status: "waiting", endReason: null, endedAt: null });
+  });
+
   it("abandonUnfinished marca como abandonadas solo las partidas en espera o en curso", async () => {
     const waiting = await repository.createGame({ roomCode: "AAAAAA", config, creatorUserId: ash });
     const playing = await repository.createGame({ roomCode: "BBBBBB", config, creatorUserId: misty });
@@ -135,6 +144,10 @@ describe("createPrismaGameRepository", () => {
     expect(await status(waiting)).toBe("abandoned");
     expect(await status(playing)).toBe("abandoned");
     expect(await status(done.id)).toBe("completed");
+    const reason = async (id: string) => (await prisma.game.findUniqueOrThrow({ where: { id } })).endReason;
+    expect(await reason(waiting)).toBe("abandoned");
+    expect(await reason(playing)).toBe("abandoned");
+    expect(await reason(done.id)).toBeNull();
     expect((await prisma.game.findUniqueOrThrow({ where: { id: waiting } })).endedAt).toBeInstanceOf(Date);
     await expect(repository.abandonUnfinished()).resolves.toBe(0);
   });
```

`server/test/e2e/full-game.test.ts` (partidas completas contra PostgreSQL):

```diff
diff --git a/server/test/e2e/full-game.test.ts b/server/test/e2e/full-game.test.ts
index c52ceff..cfddc02 100644
--- a/server/test/e2e/full-game.test.ts
+++ b/server/test/e2e/full-game.test.ts
@@ -92,7 +92,7 @@ describe("partida completa de punta a punta", () => {
         rounds: { orderBy: { number: "asc" }, include: { picks: true, type1: true, type2: true } },
       },
     });
-    expect(game).toMatchObject({ status: "completed", winnerId: misty.userId });
+    expect(game).toMatchObject({ status: "completed", endReason: "completed", winnerId: misty.userId });
     expect(game.endedAt).toBeInstanceOf(Date);
     expect(game.players.map((p) => [p.userId, p.seat, p.finalStats])).toEqual([
       [ash.userId, 1, 1150],
@@ -144,7 +144,14 @@ describe("partida completa de punta a punta", () => {
     await room.idle();
 
     const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: code }, include: { rounds: true } });
-    expect(game).toMatchObject({ status: "completed", winnerId: null, typeMode: "chosen", lengthMode: "custom", roundsLimit: 2 });
+    expect(game).toMatchObject({
+      status: "completed",
+      endReason: "completed",
+      winnerId: null,
+      typeMode: "chosen",
+      lengthMode: "custom",
+      roundsLimit: 2,
+    });
     expect(game.rounds).toHaveLength(2);
   }, 15_000);
 
@@ -162,7 +169,7 @@ describe("partida completa de punta a punta", () => {
     await room.idle();
 
     const game = await prisma.game.findUniqueOrThrow({ where: { roomCode: "GAME02" } });
-    expect(game).toMatchObject({ status: "abandoned", winnerId: null });
+    expect(game).toMatchObject({ status: "abandoned", endReason: "expired", winnerId: null });
     expect(game.endedAt).toBeInstanceOf(Date);
     // El creador puede abrir otra sala.
     const again = await request(server.app)
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/game/room.test.ts test/game/prisma-game-repository.test.ts test/e2e
```

Expected: FAIL — `finishInput` no trae `reason` y la base de datos guarda `endReason` nulo.

- [ ] **Step 3: Implementar**

`server/src/game/ports.ts`:

```diff
diff --git a/server/src/game/ports.ts b/server/src/game/ports.ts
index 4194676..96580a1 100644
--- a/server/src/game/ports.ts
+++ b/server/src/game/ports.ts
@@ -1,4 +1,4 @@
-import type { RoomConfig, Seat, ServerEvent } from "@pokemon-minigames/shared";
+import type { GameEndReason, RoomConfig, Seat, ServerEvent } from "@pokemon-minigames/shared";
 import type { RoundRecord } from "./engine/types.js";
 
 /** Reloj inyectable: en las pruebas se controla a mano. */
@@ -19,6 +19,8 @@ export interface Broadcaster {
 
 export interface FinishInput {
   status: "completed" | "abandoned";
+  /** Por qué terminó; la base de datos exige que sea coherente con `status`. */
+  reason: GameEndReason;
   winnerUserId: string | null;
   finalStats: Partial<Record<Seat, number>>;
 }
```

`server/src/game/room.ts`:

```diff
diff --git a/server/src/game/room.ts b/server/src/game/room.ts
index fb9a08b..dc5e0b5 100644
--- a/server/src/game/room.ts
+++ b/server/src/game/room.ts
@@ -153,6 +153,7 @@ export class GameRoom {
           this.persist("guardar el final", () =>
             repository.finish(this.gameId, {
               status: effect.status,
+              reason: effect.outcome.reason,
               winnerUserId,
               finalStats: effect.finalStats,
             }),
```

`server/src/game/prisma-game-repository.ts`:

```diff
diff --git a/server/src/game/prisma-game-repository.ts b/server/src/game/prisma-game-repository.ts
index e23e160..b80f35b 100644
--- a/server/src/game/prisma-game-repository.ts
+++ b/server/src/game/prisma-game-repository.ts
@@ -57,7 +57,7 @@ export function createPrismaGameRepository(prisma: PrismaClient): GameRepository
       await prisma.$transaction(async (tx) => {
         await tx.game.update({
           where: { id: gameId },
-          data: { status: input.status, winnerId: input.winnerUserId, endedAt: new Date() },
+          data: { status: input.status, endReason: input.reason, winnerId: input.winnerUserId, endedAt: new Date() },
         });
         for (const seat of [1, 2] as const) {
           const finalStats = input.finalStats[seat];
@@ -71,7 +71,7 @@ export function createPrismaGameRepository(prisma: PrismaClient): GameRepository
     async abandonUnfinished() {
       const result = await prisma.game.updateMany({
         where: { status: { in: ["waiting", "in_progress"] } },
-        data: { status: "abandoned", endedAt: new Date() },
+        data: { status: "abandoned", endReason: "abandoned", endedAt: new Date() },
       });
       return result.count;
     },
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/game test/e2e test/realtime
npm run typecheck
```

Expected: PASS (156 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): guardar el motivo del fin de cada partida" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cálculo de estadísticas (funciones puras)

**Files:**
- Create: `server/src/stats/calculate.ts`
- Test: `server/test/stats/calculate.test.ts`

**Interfaces:**
- Produces: `FinishedGame { id, endedAt: Date, result: GameResult, score: number | null }`; `resultFor(winnerId | null, userId)` (nulo es empate); `sortRecentFirst(games)` (fecha de fin descendente, luego id descendente; no modifica la lista); `computeRecord(games)` → jugadas, ganadas, empatadas, perdidas, `winRate` (nulo sin partidas), `currentStreak`, `bestStreak`, `bestGameScore` (ignora los puntajes nulos); `computeTopPokemon(pokemonIds, catalog, limit = 3)` (más ganados primero, empate por id más bajo, ignora ids que no están en el catálogo); `computeAveragePower(pokemonIds, catalog)` (un decimal; nulo si no hay ninguno); `buildStats(games, wonPokemonIds, catalog): Stats`.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/stats/calculate.test.ts` (por tablas: sin partidas, solo empates, rachas cortadas por empate o derrota, la mejor racha anterior a la actual, orden independiente de cómo lleguen las partidas, empates de fecha, desempates del top 3, sin Pokémon ganados, ids desconocidos):

```ts
import type { GameResult } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import {
  type FinishedGame,
  buildStats,
  computeAveragePower,
  computeRecord,
  computeTopPokemon,
  resultFor,
  sortRecentFirst,
} from "../../src/stats/calculate.js";
import { fixtureCatalog } from "../helpers/fixtures.js";

const catalog = fixtureCatalog();
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1);

/** Partidas en orden cronológico (la primera es la más antigua); cada una termina un día después. */
function history(...results: GameResult[]): FinishedGame[] {
  return results.map((result, i) => ({ id: `g${i}`, endedAt: new Date(T0 + i * DAY), result, score: 100 * (i + 1) }));
}

const W = "won";
const D = "drawn";
const L = "lost";

describe("resultFor", () => {
  it("compara el ganador con la persona: ganó, empató (sin ganador) o perdió", () => {
    expect(resultFor("u1", "u1")).toBe("won");
    expect(resultFor(null, "u1")).toBe("drawn");
    expect(resultFor("u2", "u1")).toBe("lost");
  });
});

describe("sortRecentFirst", () => {
  it("ordena por fecha de fin descendente y, a igual fecha, por id descendente", () => {
    const same = new Date(T0);
    const games = [
      { id: "a", endedAt: same },
      { id: "c", endedAt: new Date(T0 - DAY) },
      { id: "b", endedAt: same },
      { id: "d", endedAt: new Date(T0 + DAY) },
    ];
    expect(sortRecentFirst(games).map((g) => g.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("no modifica la lista original", () => {
    const games = history(W, L);
    sortRecentFirst(games);
    expect(games.map((g) => g.id)).toEqual(["g0", "g1"]);
  });
});

describe("computeRecord", () => {
  it("sin partidas: todo en cero y sin porcentaje ni mejor partida", () => {
    expect(computeRecord([])).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      currentStreak: 0,
      bestStreak: 0,
      bestGameScore: null,
    });
  });

  it("cuenta ganadas, empatadas y perdidas; los empates cuentan como jugadas en el porcentaje", () => {
    const record = computeRecord(history(W, W, D, L));
    expect(record).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1, winRate: 0.5 });
  });

  it.each([
    ["una victoria sola", [W], 1, 1],
    ["varias victorias seguidas", [L, W, W, W], 3, 3],
    ["una derrota reciente corta la racha actual pero no la mejor", [W, W, W, L], 0, 3],
    ["un empate reciente también corta la racha", [W, W, W, D], 0, 3],
    ["un empate en medio parte la racha en dos", [W, W, D, W], 1, 2],
    ["la mejor racha puede ser anterior a la actual", [W, W, W, L, W], 1, 3],
    ["sin victorias no hay racha", [L, D, L], 0, 0],
  ] as [string, GameResult[], number, number][])("racha: %s", (_name, results, current, best) => {
    const record = computeRecord(history(...results));
    expect({ current: record.currentStreak, best: record.bestStreak }).toEqual({ current, best });
  });

  it("no depende del orden en que llegan las partidas", () => {
    const games = history(W, W, D, W);
    expect(computeRecord([...games].reverse())).toEqual(computeRecord(games));
  });

  it("con la misma fecha de fin, la partida de id mayor es la más reciente", () => {
    const at = new Date(T0);
    const lostLast: FinishedGame[] = [
      { id: "a", endedAt: at, result: "won", score: 1 },
      { id: "b", endedAt: at, result: "lost", score: 1 },
    ];
    const wonLast: FinishedGame[] = [
      { id: "a", endedAt: at, result: "lost", score: 1 },
      { id: "b", endedAt: at, result: "won", score: 1 },
    ];
    expect(computeRecord(lostLast).currentStreak).toBe(0);
    expect(computeRecord(wonLast).currentStreak).toBe(1);
  });

  it("la mejor partida es el mayor puntaje; ignora los puntajes que no se guardaron", () => {
    const games = history(W, L, W);
    games[1]!.score = null;
    expect(computeRecord(games).bestGameScore).toBe(300);
    expect(computeRecord(games.map((g) => ({ ...g, score: null }))).bestGameScore).toBeNull();
  });
});

describe("computeTopPokemon", () => {
  it("devuelve los 3 más ganados con sus veces, del que más al que menos", () => {
    const top = computeTopPokemon([2, 2, 2, 6, 6, 1, 1, 1, 1, 3], catalog);
    expect(top.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 4],
      [2, 3],
      [6, 2],
    ]);
  });

  it("a igual cantidad gana el de id más bajo, para que el resultado sea siempre el mismo", () => {
    const top = computeTopPokemon([6, 6, 2, 2, 1, 1, 3, 3], catalog);
    expect(top.map((t) => t.pokemon.id)).toEqual([1, 2, 3]);
  });

  it("incluye los datos completos del Pokémon para poder mostrarlo", () => {
    const [first] = computeTopPokemon([1], catalog);
    expect(first).toEqual({
      wins: 1,
      pokemon: {
        id: 1,
        names: { es: "Alfa", en: "Alpha" },
        spriteUrl: "https://example.com/1.png",
        types: ["fire", "flying"],
        stats: expect.objectContaining({ hp: expect.any(Number) }),
        totalStats: 500,
      },
    });
  });

  it("sin Pokémon ganados, o solo ids que ya no existen en el catálogo, la lista está vacía", () => {
    expect(computeTopPokemon([], catalog)).toEqual([]);
    expect(computeTopPokemon([999, 999], catalog)).toEqual([]);
  });

  it("respeta el límite pedido", () => {
    expect(computeTopPokemon([1, 2, 3, 4], catalog, 2)).toHaveLength(2);
  });
});

describe("computeAveragePower", () => {
  it("promedia el total_stats de cada Pokémon ganado, contando las repeticiones", () => {
    expect(computeAveragePower([1, 2], catalog)).toBe(450);
    expect(computeAveragePower([1, 1, 2], catalog)).toBe(466.7);
  });

  it("sin Pokémon ganados no hay promedio", () => {
    expect(computeAveragePower([], catalog)).toBeNull();
    expect(computeAveragePower([999], catalog)).toBeNull();
  });

  it("ignora los ids que no están en el catálogo", () => {
    expect(computeAveragePower([1, 999], catalog)).toBe(500);
  });
});

describe("buildStats", () => {
  it("junta el récord, el top y el promedio", () => {
    const stats = buildStats(history(W, W, L), [1, 1, 6], catalog);
    expect(stats).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      currentStreak: 0,
      bestStreak: 2,
      bestGameScore: 300,
      averagePower: 533.3,
    });
    expect(stats.topPokemon.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 2],
      [6, 1],
    ]);
  });

  it("una persona sin partidas tiene ceros, nulos y listas vacías", () => {
    expect(buildStats([], [], catalog)).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      currentStreak: 0,
      bestStreak: 0,
      averagePower: null,
      bestGameScore: null,
      topPokemon: [],
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/stats/calculate.test.ts
```

Expected: FAIL — no existe `src/stats/calculate.js`.

- [ ] **Step 3: Implementar**

`server/src/stats/calculate.ts`:

```ts
import type { GameResult, Stats, TopPokemon } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import { toPokemonView } from "../game/engine/view.js";

/** Cuántos Pokémon se muestran en "los más ganados". */
export const TOP_POKEMON_LIMIT = 3;

/** Una partida completada, vista por una de las dos personas que la jugaron. */
export interface FinishedGame {
  id: string;
  endedAt: Date;
  result: GameResult;
  /** Puntaje final de esta persona; nulo si no se guardó. */
  score: number | null;
}

export type GameRecord = Pick<
  Stats,
  "played" | "wins" | "draws" | "losses" | "winRate" | "currentStreak" | "bestStreak" | "bestGameScore"
>;

/** Un ganador nulo es un empate; si no, gana quien coincide con `winnerId`. */
export function resultFor(winnerId: string | null, userId: string): GameResult {
  if (winnerId === null) return "drawn";
  return winnerId === userId ? "won" : "lost";
}

/** De la más reciente a la más antigua; con la misma fecha de fin, la de id mayor es la más reciente. */
export function sortRecentFirst<T extends { id: string; endedAt: Date }>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => {
    const byDate = b.endedAt.getTime() - a.endedAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function computeRecord(games: readonly FinishedGame[]): GameRecord {
  const recentFirst = sortRecentFirst(games);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let bestGameScore: number | null = null;
  for (const game of recentFirst) {
    if (game.result === "won") wins++;
    else if (game.result === "drawn") draws++;
    else losses++;
    if (game.score !== null && (bestGameScore === null || game.score > bestGameScore)) bestGameScore = game.score;
  }

  // La racha actual son las victorias seguidas desde la partida más reciente; un empate o una derrota la corta.
  let currentStreak = 0;
  for (const game of recentFirst) {
    if (game.result !== "won") break;
    currentStreak++;
  }
  let bestStreak = 0;
  let run = 0;
  for (const game of recentFirst) {
    run = game.result === "won" ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const played = games.length;
  return {
    played,
    wins,
    draws,
    losses,
    winRate: played === 0 ? null : wins / played,
    currentStreak,
    bestStreak,
    bestGameScore,
  };
}

/** Los Pokémon que más veces se ganaron; con la misma cantidad, el de id más bajo. Ignora ids que no están en el catálogo. */
export function computeTopPokemon(
  pokemonIds: readonly number[],
  catalog: PokemonCatalog,
  limit: number = TOP_POKEMON_LIMIT,
): TopPokemon[] {
  const wins = new Map<number, number>();
  for (const id of pokemonIds) {
    if (catalog.get(id)) wins.set(id, (wins.get(id) ?? 0) + 1);
  }
  return [...wins.entries()]
    .sort(([idA, winsA], [idB, winsB]) => winsB - winsA || idA - idB)
    .slice(0, limit)
    .map(([id, count]) => ({ pokemon: toPokemonView(catalog.get(id)!), wins: count }));
}

/** Promedio del total_stats de los Pokémon ganados (cada victoria cuenta), con un decimal; nulo si no hay ninguno. */
export function computeAveragePower(pokemonIds: readonly number[], catalog: PokemonCatalog): number | null {
  let sum = 0;
  let count = 0;
  for (const id of pokemonIds) {
    const pokemon = catalog.get(id);
    if (!pokemon) continue;
    sum += pokemon.totalStats;
    count++;
  }
  return count === 0 ? null : Math.round((sum / count) * 10) / 10;
}

export function buildStats(games: readonly FinishedGame[], wonPokemonIds: readonly number[], catalog: PokemonCatalog): Stats {
  return {
    ...computeRecord(games),
    averagePower: computeAveragePower(wonPokemonIds, catalog),
    topPokemon: computeTopPokemon(wonPokemonIds, catalog),
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/stats/calculate.test.ts
npm run typecheck
```

Expected: PASS (25 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(stats): cálculo de estadísticas con funciones puras" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `StatsService` (consultas, historial y cursor)

**Files:**
- Create: `server/src/stats/cursor.ts`, `server/src/stats/stats.service.ts`, `server/test/helpers/games.ts`, `server/test/stats/cursor.test.ts`, `server/test/stats/stats.service.test.ts`

**Interfaces:**
- Consumes: `buildStats`, `resultFor`, `FinishedGame` (Task 4); `StatsResponse`, `HistoryEntry`, `HistoryPage` (Task 2); `AppError`.
- Produces: `encodeCursor({ endedAt, id })` (texto opaco seguro para una URL), `decodeCursor(text)` (lanza `InvalidCursorError` si no es un cursor válido, incluidas las fechas que JavaScript acepta pero PostgreSQL no: años negativos, de seis cifras o cero; así un cursor fabricado a mano da 400 y no un error del servidor); `StatsService({ prisma, catalog })` con `findUserByUsername(username)` (sin distinguir mayúsculas y sin tratar `_` como comodín; `null` si no existe), `getStats(userId): Promise<StatsResponse>` (lanza `USER_NOT_FOUND` 404) y `getHistory(userId, { limit, before? }): Promise<HistoryPage>` (un cursor inválido lanza `VALIDATION_ERROR` 400; pide una fila de más para saber si hay página siguiente).
- Ayudante de pruebas: `seedGame({ code, endedAt, players: [SeedPlayer, SeedPlayer], winner?, status?, reason?, config? })` siembra una partida ya guardada con una ronda por cada Pokémon ganado.

- [ ] **Step 1: Escribir las pruebas que fallan**

Ayudante para sembrar partidas, `server/test/helpers/games.ts`:

```ts
import type { GameEndReason, RoomConfig } from "@pokemon-minigames/shared";
import { prisma } from "./db.js";

export interface SeedPlayer {
  userId: string;
  /** Puntaje final guardado; nulo si no se guardó. */
  score: number | null;
  /** Pokémon que ganó, uno por ronda. */
  wonPokemon?: number[];
}

export interface SeedGame {
  code: string;
  endedAt: Date;
  players: [SeedPlayer, SeedPlayer];
  /** Índice (0 o 1) de quien ganó; nulo o ausente es un empate. */
  winner?: 0 | 1 | null;
  status?: "completed" | "abandoned" | "in_progress" | "waiting";
  reason?: GameEndReason | null;
  config?: RoomConfig;
}

const DEFAULT_CONFIG: RoomConfig = { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null };

/**
 * Siembra una partida ya guardada en la base de datos, con sus dos jugadores y una ronda por cada
 * Pokémon ganado (el par de tipos es siempre el mismo: aquí no importa). Requiere el catálogo de pruebas.
 */
export async function seedGame(game: SeedGame): Promise<string> {
  const config = game.config ?? DEFAULT_CONFIG;
  const status = game.status ?? "completed";
  const finished = status === "completed" || status === "abandoned";
  const created = await prisma.game.create({
    data: {
      roomCode: game.code,
      typeMode: config.typeMode,
      lengthMode: config.lengthMode,
      roundsLimit: config.roundsLimit,
      statsGoal: config.statsGoal,
      status,
      endReason: game.reason ?? null,
      winnerId: game.winner === undefined || game.winner === null ? null : game.players[game.winner].userId,
      endedAt: finished ? game.endedAt : null,
      players: {
        create: game.players.map((player, i) => ({ userId: player.userId, seat: i + 1, finalStats: player.score })),
      },
    },
    select: { id: true },
  });

  const rounds = Math.max(game.players[0].wonPokemon?.length ?? 0, game.players[1].wonPokemon?.length ?? 0);
  for (let i = 0; i < rounds; i++) {
    const round = await prisma.round.create({
      data: { gameId: created.id, number: i + 1, type1Id: 1, type2Id: 2 },
      select: { id: true },
    });
    for (const player of game.players) {
      const pokemonId = player.wonPokemon?.[i];
      await prisma.roundPick.create({
        data: {
          roundId: round.id,
          userId: player.userId,
          result: pokemonId === undefined ? "NO_ANSWER" : "VALID",
          pokemonId: pokemonId ?? null,
        },
      });
    }
  }
  return created.id;
}
```

`server/test/stats/cursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidCursorError, decodeCursor, encodeCursor } from "../../src/stats/cursor.js";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("cursor del historial", () => {
  it("se puede codificar y volver a leer, sin perder los milisegundos", () => {
    const endedAt = new Date("2026-10-01T12:34:56.789Z");
    const text = encodeCursor({ endedAt, id });
    expect(decodeCursor(text)).toEqual({ endedAt, id });
  });

  it("es un texto opaco que se puede poner en una URL", () => {
    const text = encodeCursor({ endedAt: new Date("2026-10-01T12:34:56.789Z"), id });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["vacío", ""],
    ["texto cualquiera", "hola"],
    ["base64 que no es un cursor", Buffer.from("otra cosa").toString("base64url")],
    ["fecha inválida", Buffer.from(`no-es-fecha|${id}`).toString("base64url")],
    ["id que no es un uuid", Buffer.from("2026-10-01T12:34:56.789Z|123").toString("base64url")],
    ["sin id", Buffer.from("2026-10-01T12:34:56.789Z|").toString("base64url")],
    ["con partes de más", Buffer.from(`2026-10-01T12:34:56.789Z|${id}|x`).toString("base64url")],
    // Fechas que JavaScript acepta y escribe igual, pero que PostgreSQL no admite en un timestamptz.
    ["año negativo", Buffer.from(`-271821-04-20T00:00:00.000Z|${id}`).toString("base64url")],
    ["año de seis cifras", Buffer.from(`+010000-01-01T00:00:00.000Z|${id}`).toString("base64url")],
    ["año cero", Buffer.from(`0000-01-01T00:00:00.000Z|${id}`).toString("base64url")],
  ])("rechaza un cursor inválido: %s", (_name, text) => {
    expect(() => decodeCursor(text)).toThrow(InvalidCursorError);
  });
});
```

`server/test/stats/stats.service.test.ts` (contra la base de pruebas real: conteos, abandonadas que no cuentan, racha por orden de fin, top y promedio solo de jugadas válidas propias, aislamiento entre personas, historial sin código de sala y paginación con partidas que terminan en el mismo instante):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import { StatsService } from "../../src/stats/stats.service.js";
import { AppError } from "../../src/http/errors.js";
import { fixtureCatalog, fixtureSnapshot } from "../helpers/fixtures.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { seedGame } from "../helpers/games.js";

const service = new StatsService({ prisma, catalog: fixtureCatalog() });
const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY);

let ash: string;
let misty: string;
let brock: string;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  const user = async (name: string) =>
    (await prisma.user.create({ data: { email: `${name}@example.com`, username: name, passwordHash: "h" } })).id;
  ash = await user("ash");
  misty = await user("misty");
  brock = await user("brock");
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

describe("StatsService.findUserByUsername", () => {
  it("busca sin distinguir mayúsculas y devuelve el nombre tal como se escribió al registrarse", async () => {
    await expect(service.findUserByUsername("ASH")).resolves.toEqual({ id: ash, username: "ash" });
  });

  it("el guion bajo no actúa como comodín", async () => {
    await prisma.user.create({ data: { email: "a_b@example.com", username: "a_b", passwordHash: "h" } });
    await prisma.user.create({ data: { email: "axb@example.com", username: "axb", passwordHash: "h" } });
    await expect(service.findUserByUsername("a_b")).resolves.toMatchObject({ username: "a_b" });
    await expect(service.findUserByUsername("a_c")).resolves.toBeNull();
  });

  it("un nombre que no existe da null", async () => {
    await expect(service.findUserByUsername("nadie")).resolves.toBeNull();
  });
});

describe("StatsService.getStats", () => {
  it("una persona sin partidas tiene todo en cero", async () => {
    const { username, stats } = await service.getStats(ash);
    expect(username).toBe("ash");
    expect(stats).toMatchObject({ played: 0, wins: 0, winRate: null, averagePower: null, bestGameScore: null, topPokemon: [] });
  });

  it("un usuario que no existe da USER_NOT_FOUND", async () => {
    await expect(service.getStats("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
      code: "USER_NOT_FOUND",
    });
    await expect(service.getStats("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(AppError);
  });

  it("cuenta ganadas, empatadas y perdidas, y la mejor partida", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 900 }, { userId: misty, score: 400 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: misty, score: 700 }, { userId: ash, score: 300 }], winner: 0 });
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 500 }, { userId: brock, score: 500 }], winner: null });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ played: 3, wins: 1, draws: 1, losses: 1, bestGameScore: 900 });
    expect(stats.winRate).toBeCloseTo(1 / 3);
    expect(stats).toMatchObject({ currentStreak: 0, bestStreak: 1 });
  });

  it("las partidas abandonadas, en espera o en curso no cuentan para nada", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 100, wonPokemon: [1] }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), status: "abandoned", reason: "expired", players: [{ userId: ash, score: 999, wonPokemon: [6] }, { userId: misty, score: 0 }] });
    await seedGame({ code: "G00003", endedAt: day(3), status: "in_progress", players: [{ userId: ash, score: null }, { userId: misty, score: null }] });
    await seedGame({ code: "G00004", endedAt: day(4), status: "waiting", players: [{ userId: ash, score: null }, { userId: misty, score: null }] });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ played: 1, wins: 1, bestGameScore: 100 });
    expect(stats.topPokemon.map((t) => t.pokemon.id)).toEqual([1]);
  });

  it("la racha sigue el orden de fin de las partidas, no el de creación", async () => {
    // Se crean primero las recientes: la actual debe contar las victorias más nuevas.
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 0 }, { userId: misty, score: 1 }], winner: 1 });

    const { stats } = await service.getStats(ash);
    expect(stats).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });

  it("los Pokémon más ganados y el poder promedio salen solo de las jugadas válidas propias", async () => {
    await seedGame({
      code: "G00001",
      endedAt: day(1),
      players: [
        { userId: ash, score: 1, wonPokemon: [1, 1, 6] },
        { userId: misty, score: 1, wonPokemon: [2, 2, 2, 2] },
      ],
      winner: 0,
    });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1, wonPokemon: [1] }, { userId: brock, score: 1, wonPokemon: [3] }], winner: 0 });

    const { stats } = await service.getStats(ash);
    expect(stats.topPokemon.map((t) => [t.pokemon.id, t.wins])).toEqual([
      [1, 3],
      [6, 1],
    ]);
    // Ganó Alfa (500) tres veces y Zeta (600) una: (500 * 3 + 600) / 4 = 525.
    expect(stats.averagePower).toBe(525);
  });

  it("cada persona ve solo lo suyo", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 900, wonPokemon: [1] }, { userId: misty, score: 400 }], winner: 0 });
    const mistyStats = (await service.getStats(misty)).stats;
    expect(mistyStats).toMatchObject({ played: 1, wins: 0, losses: 1, topPokemon: [], averagePower: null });
    expect((await service.getStats(brock)).stats.played).toBe(0);
  });
});

describe("StatsService.getHistory", () => {
  const config = { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 } as const;

  it("devuelve el rival, el marcador visto desde el lado de la persona, el motivo y la configuración", async () => {
    const id = await seedGame({
      code: "SECRET",
      endedAt: day(5),
      reason: "forfeit",
      config,
      players: [{ userId: misty, score: 700 }, { userId: ash, score: 300 }],
      winner: 0,
    });
    const page = await service.getHistory(ash, { limit: 20 });
    expect(page.nextCursor).toBeNull();
    expect(page.games).toEqual([
      {
        id,
        endedAt: day(5).toISOString(),
        result: "lost",
        reason: "forfeit",
        opponent: { username: "misty" },
        myScore: 300,
        opponentScore: 700,
        config,
      },
    ]);
  });

  it("nunca incluye el código de sala ni nada que identifique a la sala", async () => {
    await seedGame({ code: "SECRET", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    const [entry] = (await service.getHistory(ash, { limit: 20 })).games;
    expect(JSON.stringify(entry)).not.toContain("SECRET");
    expect(Object.keys(entry!).sort()).toEqual(["config", "endedAt", "id", "myScore", "opponent", "opponentScore", "reason", "result"]);
  });

  it("una partida anterior a que se guardara el motivo lo trae como null", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    expect((await service.getHistory(ash, { limit: 20 })).games[0]!.reason).toBeNull();
  });

  it("solo trae las partidas completadas de esa persona, de la más reciente a la más antigua", async () => {
    await seedGame({ code: "G00001", endedAt: day(1), players: [{ userId: ash, score: 1 }, { userId: misty, score: 0 }], winner: 0 });
    await seedGame({ code: "G00003", endedAt: day(3), players: [{ userId: ash, score: 0 }, { userId: misty, score: 1 }], winner: 1 });
    await seedGame({ code: "G00002", endedAt: day(2), players: [{ userId: ash, score: 1 }, { userId: brock, score: 1 }], winner: null });
    await seedGame({ code: "G00004", endedAt: day(4), status: "abandoned", reason: "cancelled", players: [{ userId: ash, score: 0 }, { userId: misty, score: 0 }] });
    await seedGame({ code: "G00005", endedAt: day(5), players: [{ userId: misty, score: 1 }, { userId: brock, score: 0 }], winner: 0 });

    const page = await service.getHistory(ash, { limit: 20 });
    expect(page.games.map((g) => [g.result, g.opponent.username])).toEqual([
      ["lost", "misty"],
      ["drawn", "brock"],
      ["won", "misty"],
    ]);
  });

  describe("paginación", () => {
    async function fiveGames() {
      // Dos partidas terminan en el mismo instante: el cursor no puede saltarse ni repetir ninguna.
      const ids: string[] = [];
      const dates = [day(1), day(2), day(3), day(3), day(4)];
      for (const [i, endedAt] of dates.entries()) {
        ids.push(await seedGame({ code: `P0000${i}`, endedAt, players: [{ userId: ash, score: i }, { userId: misty, score: 0 }], winner: 0 }));
      }
      return ids;
    }

    it("recorre todas las partidas por páginas, sin repetir ni saltarse ninguna", async () => {
      const ids = await fiveGames();
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await service.getHistory(ash, { limit: 2, before: cursor });
        seen.push(...page.games.map((g) => g.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor !== null && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());
    });

    it("el orden de las páginas es el mismo que el de pedirlo todo de una vez", async () => {
      await fiveGames();
      const all = (await service.getHistory(ash, { limit: 50 })).games.map((g) => g.id);
      const first = await service.getHistory(ash, { limit: 3 });
      const second = await service.getHistory(ash, { limit: 3, before: first.nextCursor });
      expect([...first.games, ...second.games].map((g) => g.id)).toEqual(all);
    });

    it("si el límite es justo la cantidad de partidas, no hay página siguiente", async () => {
      await fiveGames();
      const page = await service.getHistory(ash, { limit: 5 });
      expect(page.games).toHaveLength(5);
      expect(page.nextCursor).toBeNull();
    });

    it("un cursor que ya pasó la última partida da una página vacía", async () => {
      await fiveGames();
      const last = await service.getHistory(ash, { limit: 4 });
      const page = await service.getHistory(ash, { limit: 4, before: last.nextCursor });
      expect(page.games).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it("un cursor inválido es un error 400", async () => {
      await expect(service.getHistory(ash, { limit: 5, before: "basura" })).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("un cursor con una fecha que la base de datos no admite también es un 400, no un error del servidor", async () => {
      const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
      for (const date of ["-271821-04-20T00:00:00.000Z", "+010000-01-01T00:00:00.000Z", "0000-01-01T00:00:00.000Z"]) {
        const before = Buffer.from(`${date}|${id}`).toString("base64url");
        await expect(service.getHistory(ash, { limit: 5, before })).rejects.toMatchObject({
          status: 400,
          code: "VALIDATION_ERROR",
        });
      }
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/stats/cursor.test.ts test/stats/stats.service.test.ts
```

Expected: FAIL — no existen `src/stats/cursor.js` ni `src/stats/stats.service.js`.

- [ ] **Step 3: Implementar**

`server/src/stats/cursor.ts`:

```ts
/** Posición en el historial: la fecha de fin y el id de la última partida entregada. */
export interface HistoryCursor {
  endedAt: Date;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor inválido");
    this.name = "InvalidCursorError";
  }
}

/** La forma que escribe `toISOString()` para años de cuatro cifras. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto opaco y seguro para una URL; el cliente solo lo devuelve tal cual. */
export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(`${cursor.endedAt.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeCursor(text: string): HistoryCursor {
  const parts = Buffer.from(text, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) throw new InvalidCursorError();
  const [date, id] = parts as [string, string];
  const endedAt = new Date(date);
  // Un año negativo, de seis cifras o el cero los acepta JavaScript pero no el timestamptz de PostgreSQL: darían un 500.
  if (!ISO_DATE.test(date) || Number.isNaN(endedAt.getTime()) || endedAt.getUTCFullYear() < 1 || endedAt.toISOString() !== date || !UUID.test(id)) {
    throw new InvalidCursorError();
  }
  return { endedAt, id };
}
```

`server/src/stats/stats.service.ts`:

```ts
import type { HistoryEntry, HistoryPage, StatsResponse } from "@pokemon-minigames/shared";
import type { PokemonCatalog } from "../catalog/pokemon-catalog.js";
import type { PrismaClient } from "../db/prisma.js";
import { AppError } from "../http/errors.js";
import { type FinishedGame, buildStats, resultFor } from "./calculate.js";
import { type HistoryCursor, InvalidCursorError, decodeCursor, encodeCursor } from "./cursor.js";

export interface StatsServiceDeps {
  prisma: PrismaClient;
  catalog: PokemonCatalog;
}

export interface HistoryOptions {
  limit: number;
  /** Cursor de la página anterior; ausente o nulo para la primera. */
  before?: string | null;
}

/** Estadísticas e historial, calculados al pedirlos a partir de las partidas completadas. */
export class StatsService {
  private readonly prisma: PrismaClient;
  private readonly catalog: PokemonCatalog;

  constructor(deps: StatsServiceDeps) {
    this.prisma = deps.prisma;
    this.catalog = deps.catalog;
  }

  /** Busca por nombre sin distinguir mayúsculas, con la misma comparación que el índice único lower(username). */
  async findUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
    // No se usa `mode: "insensitive"`: Prisma lo traduce a ILIKE y el guion bajo actuaría como comodín.
    const rows = await this.prisma.$queryRaw<{ id: string; username: string }[]>`
      SELECT id, username FROM users WHERE lower(username) = lower(${username}) LIMIT 1`;
    return rows[0] ?? null;
  }

  async getStats(userId: string): Promise<StatsResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No existe ese jugador");

    const rows = await this.prisma.gamePlayer.findMany({
      where: { userId, game: { status: "completed", endedAt: { not: null } } },
      select: { finalStats: true, game: { select: { id: true, endedAt: true, winnerId: true } } },
    });
    const games: FinishedGame[] = rows.map((row) => ({
      id: row.game.id,
      endedAt: row.game.endedAt!,
      result: resultFor(row.game.winnerId, userId),
      score: row.finalStats,
    }));

    const picks = await this.prisma.roundPick.findMany({
      where: { userId, result: "VALID", round: { game: { status: "completed" } } },
      select: { pokemonId: true },
    });
    const wonPokemonIds = picks.flatMap((pick) => (pick.pokemonId === null ? [] : [pick.pokemonId]));

    return { username: user.username, stats: buildStats(games, wonPokemonIds, this.catalog) };
  }

  async getHistory(userId: string, { limit, before }: HistoryOptions): Promise<HistoryPage> {
    let cursor: HistoryCursor | null = null;
    if (before) {
      try {
        cursor = decodeCursor(before);
      } catch (error) {
        if (error instanceof InvalidCursorError) throw new AppError(400, "VALIDATION_ERROR", "El cursor no es válido");
        throw error;
      }
    }

    // Se pide una partida de más para saber si hay página siguiente.
    const rows = await this.prisma.gamePlayer.findMany({
      where: {
        userId,
        game: {
          status: "completed",
          endedAt: { not: null },
          ...(cursor
            ? { OR: [{ endedAt: { lt: cursor.endedAt } }, { endedAt: cursor.endedAt, id: { lt: cursor.id } }] }
            : {}),
        },
      },
      orderBy: [{ game: { endedAt: "desc" } }, { game: { id: "desc" } }],
      take: limit + 1,
      select: {
        finalStats: true,
        game: {
          select: {
            id: true,
            endedAt: true,
            endReason: true,
            winnerId: true,
            typeMode: true,
            lengthMode: true,
            roundsLimit: true,
            statsGoal: true,
            players: { select: { userId: true, finalStats: true, user: { select: { username: true } } } },
          },
        },
      },
    });

    const page = rows.slice(0, limit);
    const games = page.map((row): HistoryEntry => {
      const { game } = row;
      const opponent = game.players.find((player) => player.userId !== userId);
      return {
        id: game.id,
        endedAt: game.endedAt!.toISOString(),
        result: resultFor(game.winnerId, userId),
        reason: game.endReason,
        opponent: { username: opponent?.user.username ?? "?" },
        myScore: row.finalStats,
        opponentScore: opponent?.finalStats ?? null,
        config: {
          typeMode: game.typeMode,
          lengthMode: game.lengthMode,
          roundsLimit: game.roundsLimit,
          statsGoal: game.statsGoal,
        },
      };
    });

    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last ? encodeCursor({ endedAt: last.game.endedAt!, id: last.game.id }) : null;
    return { games, nextCursor };
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/stats
npm run typecheck
```

Expected: PASS (57 pruebas: las de `calculate`, `cursor` y `stats.service`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(stats): StatsService con estadísticas, historial paginado y cursor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rutas de estadísticas

**Files:**
- Create: `server/src/stats/stats.schemas.ts`, `server/src/stats/stats.routes.ts`, `server/test/stats/stats.routes.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `StatsService` (Task 5), `createRequireAuth` y `getAuth` de la autenticación existente.
- Produces: `GET /stats` → `{ username, stats }`; `GET /stats/history?limit=&before=` → `{ games, nextCursor }` (`limit` 1 a 50, por defecto 20; inválido → 400 `VALIDATION_ERROR`); `GET /users/:username/stats` → la misma forma que `/stats` (un nombre que no existe, o que nunca podría existir, → 404 `USER_NOT_FOUND`). Todas exigen sesión; la autenticación va ruta por ruta para que una ruta desconocida siga dando 404.
- `createApp` monta el router en la raíz y construye el `StatsService` con el `prisma` y el `catalog` que ya recibe (la firma de `AppDeps` no cambia).

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/stats/stats.routes.test.ts`:

```ts
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../../src/catalog/seed.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetCatalog, resetDatabase } from "../helpers/db.js";
import { fixtureSnapshot } from "../helpers/fixtures.js";
import { seedGame } from "../helpers/games.js";
import { type TestUser, registerUser } from "../helpers/users.js";

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * DAY);

let ctx = buildTestContext();
let ash: TestUser;
let misty: TestUser;

beforeAll(async () => {
  await resetCatalog();
  await seedCatalog(prisma, fixtureSnapshot());
});
beforeEach(async () => {
  await resetDatabase();
  ctx = buildTestContext();
  ash = await registerUser(ctx.app, "ash");
  misty = await registerUser(ctx.app, "misty");
});
afterAll(async () => {
  await resetCatalog();
  await prisma.$disconnect();
});

const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const get = (path: string, user: TestUser = ash) => request(ctx.app).get(path).set(auth(user));

/** Una partida ganada por ash contra misty, con Alfa (500) y Zeta (600) en su equipo. */
async function ashBeatsMisty(code = "G00001", endedAt = day(1)) {
  return seedGame({
    code,
    endedAt,
    reason: "completed",
    players: [
      { userId: ash.userId, score: 1100, wonPokemon: [1, 6] },
      { userId: misty.userId, score: 0 },
    ],
    winner: 0,
  });
}

describe("autenticación de las rutas de estadísticas", () => {
  it.each([
    ["GET /stats", () => request(ctx.app).get("/stats")],
    ["GET /stats/history", () => request(ctx.app).get("/stats/history")],
    ["GET /users/:username/stats", () => request(ctx.app).get("/users/misty/stats")],
  ])("%s responde 401 sin token", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("responde 401 con un token inválido", async () => {
    const response = await request(ctx.app).get("/stats").set("Authorization", "Bearer basura");
    expect(response.status).toBe(401);
  });
});

describe("GET /stats", () => {
  it("una persona sin partidas recibe todo en cero", async () => {
    const response = await get("/stats");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      username: "ash",
      stats: {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: null,
        currentStreak: 0,
        bestStreak: 0,
        averagePower: null,
        bestGameScore: null,
        topPokemon: [],
      },
    });
  });

  it("refleja las partidas completadas de quien pregunta", async () => {
    await ashBeatsMisty();
    const { stats } = (await get("/stats")).body;
    expect(stats).toMatchObject({ played: 1, wins: 1, winRate: 1, currentStreak: 1, bestGameScore: 1100, averagePower: 550 });
    expect(stats.topPokemon.map((t: { pokemon: { id: number }; wins: number }) => [t.pokemon.id, t.wins])).toEqual([
      [1, 1],
      [6, 1],
    ]);
    expect((await get("/stats", misty)).body.stats).toMatchObject({ played: 1, wins: 0, losses: 1 });
  });
});

describe("GET /users/:username/stats", () => {
  it("devuelve las estadísticas de otra persona, sin distinguir mayúsculas en el nombre", async () => {
    await ashBeatsMisty();
    const response = await get("/users/ASH/stats", misty);
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("ash");
    expect(response.body.stats).toMatchObject({ played: 1, wins: 1 });
  });

  it("no revela nada privado: ni correo, ni identificadores, ni historial, ni códigos de sala", async () => {
    await seedGame({
      code: "SECRET",
      endedAt: day(1),
      players: [
        { userId: ash.userId, score: 1, wonPokemon: [1] },
        { userId: misty.userId, score: 0 },
      ],
      winner: 0,
    });
    const response = await get("/users/ash/stats", misty);
    const text = JSON.stringify(response.body);
    expect(Object.keys(response.body).sort()).toEqual(["stats", "username"]);
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain(ash.userId);
    expect(text).not.toContain("SECRET");
    expect(text).not.toMatch(/passwordHash|email|history|roomCode/);
  });

  it("un nombre que no existe responde 404 con USER_NOT_FOUND", async () => {
    const response = await get("/users/nadie/stats");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it.each(["a", "x".repeat(31), "con espacio", "raro!", "%25", "ñandú"])(
    "un nombre que nunca podría existir (%s) también responde 404",
    async (name) => {
      const response = await get(`/users/${encodeURIComponent(name)}/stats`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("USER_NOT_FOUND");
    },
  );

  it("el guion bajo del nombre no se toma por un comodín", async () => {
    await registerUser(ctx.app, "a_b");
    expect((await get("/users/a_b/stats")).status).toBe(200);
    expect((await get("/users/a_c/stats")).status).toBe(404);
  });

  it("un usuario llamado history no choca con /stats/history", async () => {
    const history = await registerUser(ctx.app, "history");
    expect((await get("/users/history/stats")).body.username).toBe("history");
    const own = await get("/stats/history", history);
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ games: [], nextCursor: null });
  });
});

describe("GET /stats/history", () => {
  it("sin partidas devuelve una lista vacía y sin cursor", async () => {
    const response = await get("/stats/history");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ games: [], nextCursor: null });
  });

  it("lista las partidas completadas con el rival, el marcador y la configuración, sin el código de sala", async () => {
    const id = await ashBeatsMisty("SECRET");
    const response = await get("/stats/history");
    expect(response.body.games).toEqual([
      {
        id,
        endedAt: day(1).toISOString(),
        result: "won",
        reason: "completed",
        opponent: { username: "misty" },
        myScore: 1100,
        opponentScore: 0,
        config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });

  it("cada persona ve solo su propio historial", async () => {
    await ashBeatsMisty();
    const brock = await registerUser(ctx.app, "brock");
    expect((await get("/stats/history", brock)).body.games).toEqual([]);
    expect((await get("/stats/history", misty)).body.games).toHaveLength(1);
  });

  it("pagina con el cursor que devuelve la página anterior", async () => {
    for (const n of [1, 2, 3]) await ashBeatsMisty(`G0000${n}`, day(n));
    const first = await get("/stats/history?limit=2");
    expect(first.body.games).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(`/stats/history?limit=2&before=${first.body.nextCursor}`);
    expect(second.body.games).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.games[0].endedAt).toBe(day(1).toISOString());
  });

  it("el límite por defecto es 20", async () => {
    for (let n = 1; n <= 21; n++) await ashBeatsMisty(`G${String(n).padStart(5, "0")}`, day(n));
    const response = await get("/stats/history");
    expect(response.body.games).toHaveLength(20);
    expect(response.body.nextCursor).not.toBeNull();
  });

  it.each(["0", "51", "-1", "1.5", "abc", ""])("un límite inválido (%s) responde 400", async (limit) => {
    const response = await get(`/stats/history?limit=${limit}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("acepta los límites de los extremos: 1 y 50", async () => {
    await ashBeatsMisty();
    expect((await get("/stats/history?limit=1")).status).toBe(200);
    expect((await get("/stats/history?limit=50")).status).toBe(200);
  });

  it("un cursor inválido responde 400", async () => {
    for (const before of ["basura", "x".repeat(300)]) {
      const response = await get(`/stats/history?before=${before}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/stats/stats.routes.test.ts
```

Expected: FAIL — las rutas no existen (404 en todas).

- [ ] **Step 3: Implementar**

`server/src/stats/stats.schemas.ts`:

```ts
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from "@pokemon-minigames/shared";
import { z } from "zod";

/** Los nombres de usuario válidos (los mismos que acepta el registro); cualquier otro no puede existir. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
  before: z.string().min(1).max(200).optional(),
});
```

`server/src/stats/stats.routes.ts`:

```ts
import { Router } from "express";
import { createRequireAuth, getAuth } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/tokens.js";
import { AppError } from "../http/errors.js";
import { USERNAME_PATTERN, historyQuerySchema } from "./stats.schemas.js";
import type { StatsService } from "./stats.service.js";

export interface StatsRouterDeps {
  service: StatsService;
  tokens: TokenService;
}

/**
 * Se monta en la raíz porque agrupa `/stats` y `/users/:username/stats`. La autenticación va ruta por
 * ruta (no con `router.use`) para que una ruta desconocida siga dando 404 y no 401.
 */
export function createStatsRouter({ service, tokens }: StatsRouterDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokens);

  router.get("/stats", requireAuth, async (_req, res) => {
    res.json(await service.getStats(getAuth(res).userId));
  });

  router.get("/stats/history", requireAuth, async (req, res) => {
    const { limit, before } = historyQuerySchema.parse(req.query);
    res.json(await service.getHistory(getAuth(res).userId, { limit, before }));
  });

  // Bajo /users y no bajo /stats/:username: "history" es un nombre de usuario válido y chocaría.
  router.get("/users/:username/stats", requireAuth, async (req, res) => {
    const username = String(req.params.username);
    const user = USERNAME_PATTERN.test(username) ? await service.findUserByUsername(username) : null;
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No existe ese jugador");
    res.json(await service.getStats(user.id));
  });

  return router;
}
```

`server/src/app.ts` (monta el router y crea el servicio):

```diff
diff --git a/server/src/app.ts b/server/src/app.ts
index ae9272f..ebdf6e2 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -12,6 +12,8 @@ import type { PrismaClient } from "./db/prisma.js";
 import type { RoomManager } from "./game/room-manager.js";
 import { errorHandler, notFoundHandler } from "./http/errors.js";
 import { createRoomsRouter } from "./rooms/rooms.routes.js";
+import { createStatsRouter } from "./stats/stats.routes.js";
+import { StatsService } from "./stats/stats.service.js";
 
 export interface AppDeps {
   env: Env;
@@ -42,6 +44,7 @@ export function createApp({ env, prisma, tokens, roomManager, catalog }: AppDeps
   app.use("/auth", createAuthRouter({ env, authService, tokens }));
   app.use("/rooms", createRoomsRouter({ manager: roomManager, tokens }));
   app.use("/pokemon", createCatalogRouter({ catalog }));
+  app.use(createStatsRouter({ service: new StatsService({ prisma, catalog }), tokens }));
 
   app.use(notFoundHandler);
   app.use(errorHandler);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server -- test/stats
npm run typecheck
```

Expected: PASS (87 pruebas de `test/stats`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(stats): rutas GET /stats, /stats/history y /users/:username/stats" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Preferencias de tema en el servidor

**Files:**
- Create: `server/test/auth/preferences.test.ts`
- Modify: `server/src/auth/auth.schemas.ts`, `server/src/auth/auth.service.ts`, `server/src/auth/auth.routes.ts`

**Interfaces:**
- Consumes: `THEME_NAMES`, `THEME_MODES`, `ThemePreferences` (Task 2) y las columnas `users.theme` / `users.theme_mode` (Task 1).
- Produces: `AuthUser.preferences: ThemePreferences | null` (nulo mientras no se haya guardado); el DTO de usuario de registro, login, refresh y `GET /auth/me` incluye `preferences`; `AuthService.savePreferences(userId, preferences)` (si la cuenta ya no existe → 401 `UNAUTHORIZED`); `PUT /auth/me/preferences` con `{ theme, themeMode }` (ambos obligatorios y válidos) → `200 { preferences }`, con sesión obligatoria.

- [ ] **Step 1: Escribir la prueba que falla**

`server/test/auth/preferences.test.ts`:

```ts
import { THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp();
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const misty = { email: "misty@example.com", username: "misty", password: "pikachu-123" };

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function refreshCookie(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("refresh_token="))!.split(";")[0]!;
}

async function register(user = ash) {
  const response = await request(app).post("/auth/register").send(user);
  return { token: response.body.accessToken as string, cookie: refreshCookie(response), userId: response.body.user.id as string };
}

const save = (token: string, body: unknown) =>
  request(app).put("/auth/me/preferences").set("Authorization", `Bearer ${token}`).send(body as object);

describe("la preferencia de tema en la respuesta del usuario", () => {
  it("un usuario nuevo no tiene preferencia (null) en registro, login, refresh y /auth/me", async () => {
    const registered = await request(app).post("/auth/register").send(ash);
    expect(registered.body.user.preferences).toBeNull();

    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.preferences).toBeNull();

    const refreshed = await request(app).post("/auth/refresh").set("Cookie", refreshCookie(registered));
    expect(refreshed.body.user.preferences).toBeNull();

    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${registered.body.accessToken}`);
    expect(me.body.user.preferences).toBeNull();
  });
});

describe("PUT /auth/me/preferences", () => {
  it("exige sesión", async () => {
    const response = await request(app).put("/auth/me/preferences").send({ theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("guarda la preferencia y la devuelve", async () => {
    const { token, userId } = await register();
    const response = await save(token, { theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences: { theme: "pokedex", themeMode: "oscuro" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ theme: "pokedex", themeMode: "oscuro" });
  });

  it("después llega en /auth/me, en el login y en el refresh", async () => {
    const { token, cookie } = await register();
    await save(token, { theme: "clasico", themeMode: "claro" });
    const expected = { theme: "clasico", themeMode: "claro" };

    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.user.preferences).toEqual(expected);
    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.body.user.preferences).toEqual(expected);
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", cookie);
    expect(refreshed.body.user.preferences).toEqual(expected);
  });

  it("una preferencia nueva reemplaza a la anterior", async () => {
    const { token } = await register();
    await save(token, { theme: "pokedex", themeMode: "oscuro" });
    const response = await save(token, { theme: "clasico", themeMode: "auto" });
    expect(response.body.preferences).toEqual({ theme: "clasico", themeMode: "auto" });
  });

  it.each(THEME_NAMES.flatMap((theme) => THEME_MODES.map((themeMode) => [theme, themeMode] as const)))(
    "acepta la combinación %s + %s",
    async (theme, themeMode) => {
      const { token } = await register();
      expect((await save(token, { theme, themeMode })).status).toBe(200);
    },
  );

  it("cada persona guarda la suya", async () => {
    const one = await register(ash);
    const two = await register(misty);
    await save(one.token, { theme: "pokedex", themeMode: "oscuro" });
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${two.token}`);
    expect(me.body.user.preferences).toBeNull();
  });

  it.each([
    ["sin modo", { theme: "pokedex" }],
    ["sin tema", { themeMode: "oscuro" }],
    ["tema inexistente", { theme: "neon", themeMode: "oscuro" }],
    ["modo inexistente", { theme: "pokedex", themeMode: "sepia" }],
    ["valores que no son texto", { theme: 1, themeMode: null }],
    ["cuerpo vacío", {}],
    ["un texto en vez de un objeto", "pokedex"],
  ])("rechaza %s con 400 y no cambia nada", async (_name, body) => {
    const { token, userId } = await register();
    await save(token, { theme: "clasico", themeMode: "claro" });
    const response = await save(token, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ theme: "clasico", themeMode: "claro" });
  });

  it("si la cuenta ya no existe responde 401, no 500", async () => {
    const { token, userId } = await register();
    await prisma.user.delete({ where: { id: userId } });
    const response = await save(token, { theme: "pokedex", themeMode: "oscuro" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w server -- test/auth/preferences.test.ts
```

Expected: FAIL — `user.preferences` no existe en las respuestas y `PUT /auth/me/preferences` responde 404.

- [ ] **Step 3: Implementar**

`server/src/auth/auth.schemas.ts`:

```diff
diff --git a/server/src/auth/auth.schemas.ts b/server/src/auth/auth.schemas.ts
index 0048765..39b4e90 100644
--- a/server/src/auth/auth.schemas.ts
+++ b/server/src/auth/auth.schemas.ts
@@ -1,3 +1,4 @@
+import { THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
 import { z } from "zod";
 import { MAX_PASSWORD_BYTES } from "./password.js";
 
@@ -22,5 +23,10 @@ export const loginSchema = z.object({
   password: z.string().min(1, "La contraseña es obligatoria").max(1024),
 });
 
+export const preferencesSchema = z.object({
+  theme: z.enum(THEME_NAMES),
+  themeMode: z.enum(THEME_MODES),
+});
+
 export type RegisterInput = z.infer<typeof registerSchema>;
 export type LoginInput = z.infer<typeof loginSchema>;
```

`server/src/auth/auth.service.ts`:

```diff
diff --git a/server/src/auth/auth.service.ts b/server/src/auth/auth.service.ts
index 10cc110..b564644 100644
--- a/server/src/auth/auth.service.ts
+++ b/server/src/auth/auth.service.ts
@@ -1,4 +1,5 @@
 import { randomBytes } from "node:crypto";
+import type { ThemeMode, ThemeName, ThemePreferences } from "@pokemon-minigames/shared";
 import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
 import { AppError } from "../http/errors.js";
 import type { PasswordHasher } from "./password.js";
@@ -9,6 +10,18 @@ export interface AuthUser {
   email: string;
   username: string;
   createdAt: Date;
+  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
+  preferences: ThemePreferences | null;
+}
+
+/** Lo que el servicio necesita de una fila de `users`. */
+interface UserRow {
+  id: string;
+  email: string;
+  username: string;
+  createdAt: Date;
+  theme: ThemeName | null;
+  themeMode: ThemeMode | null;
 }
 
 export interface AuthResult {
@@ -30,8 +43,15 @@ export interface AuthServiceDeps {
 const INVALID_REFRESH = () =>
   new AppError(401, "INVALID_REFRESH_TOKEN", "Sesión inválida o expirada. Inicia sesión de nuevo.");
 
-function toAuthUser(user: { id: string; email: string; username: string; createdAt: Date }): AuthUser {
-  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
+function toAuthUser(user: UserRow): AuthUser {
+  return {
+    id: user.id,
+    email: user.email,
+    username: user.username,
+    createdAt: user.createdAt,
+    // La base de datos exige que tema y modo vayan juntos, así que basta con mirar uno.
+    preferences: user.theme && user.themeMode ? { theme: user.theme, themeMode: user.themeMode } : null,
+  };
 }
 
 export class AuthService {
@@ -124,6 +144,22 @@ export class AuthService {
     return toAuthUser(user);
   }
 
+  /** Guarda la preferencia de tema; si la cuenta ya no existe es lo mismo que una sesión inválida. */
+  async savePreferences(userId: string, preferences: ThemePreferences): Promise<ThemePreferences> {
+    try {
+      await this.prisma.user.update({
+        where: { id: userId },
+        data: { theme: preferences.theme, themeMode: preferences.themeMode },
+      });
+    } catch (error) {
+      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
+        throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
+      }
+      throw error;
+    }
+    return { theme: preferences.theme, themeMode: preferences.themeMode };
+  }
+
   private async assertAvailable(email: string, username: string): Promise<void> {
     const emailTaken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
     if (emailTaken) {
@@ -140,7 +176,7 @@ export class AuthService {
 
   private async issueSession(
     db: Prisma.TransactionClient | PrismaClient,
-    user: { id: string; email: string; username: string; createdAt: Date },
+    user: UserRow,
   ): Promise<AuthResult> {
     const refreshToken = this.tokens.generateRefreshToken();
     const refreshExpiresAt = new Date(this.now().getTime() + this.refreshTtlMs);
```

`server/src/auth/auth.routes.ts`:

```diff
diff --git a/server/src/auth/auth.routes.ts b/server/src/auth/auth.routes.ts
index 4aff5cf..11a792d 100644
--- a/server/src/auth/auth.routes.ts
+++ b/server/src/auth/auth.routes.ts
@@ -2,7 +2,7 @@ import { type CookieOptions, type Response, Router } from "express";
 import type { Env } from "../config/env.js";
 import { AppError } from "../http/errors.js";
 import { createRequireAuth, getAuth } from "./auth.middleware.js";
-import { loginSchema, registerSchema } from "./auth.schemas.js";
+import { loginSchema, preferencesSchema, registerSchema } from "./auth.schemas.js";
 import type { AuthResult, AuthService, AuthUser } from "./auth.service.js";
 import type { TokenService } from "./tokens.js";
 
@@ -15,7 +15,13 @@ export interface AuthRouterDeps {
 }
 
 function toUserDto(user: AuthUser) {
-  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt.toISOString() };
+  return {
+    id: user.id,
+    email: user.email,
+    username: user.username,
+    createdAt: user.createdAt.toISOString(),
+    preferences: user.preferences,
+  };
 }
 
 export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps): Router {
@@ -79,5 +85,10 @@ export function createAuthRouter({ env, authService, tokens }: AuthRouterDeps):
     res.json({ user: toUserDto(user) });
   });
 
+  router.put("/me/preferences", requireAuth, async (req, res) => {
+    const preferences = preferencesSchema.parse(req.body);
+    res.json({ preferences: await authService.savePreferences(getAuth(res).userId, preferences) });
+  });
+
   return router;
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w server
npm run typecheck
```

Expected: PASS (**487 pruebas** en 38 archivos, todo el servidor) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): guardar la preferencia de tema en el perfil" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Capa de datos del cliente (estadísticas y preferencias)

**Files:**
- Create: `client/test/api/proxy.test.ts`
- Modify: `client/src/api/types.ts`, `client/src/api/endpoints.ts`, `client/vite.config.ts`
- Test (modificar): `client/test/api/client.test.ts`, `client/test/api/endpoints.test.ts`, `client/test/helpers/services.tsx`

**Interfaces:**
- Consumes: `StatsResponse`, `HistoryPage`, `ThemePreferences` (Task 2).
- Produces: `AuthUser.preferences: ThemePreferences | null`; `Endpoints.stats.{ mine(), forUser(username), history({ before?, limit? }) }` (el nombre se codifica en la ruta; un cursor nulo o ausente no agrega parámetros) y `Endpoints.auth.savePreferences(preferences)`; el proxy de desarrollo de Vite reenvía también `/stats` y `/users`.
- Ayudantes de prueba: `ASH` pasa a llevar `preferences: null`, `NO_STATS` (estadísticas de quien no ha jugado) y `fakeServices()` trae `stats.{ mine, forUser, history }` y `auth.savePreferences` como espías.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/api/endpoints.test.ts`:

```diff
diff --git a/client/test/api/endpoints.test.ts b/client/test/api/endpoints.test.ts
index 272b2c0..67f748e 100644
--- a/client/test/api/endpoints.test.ts
+++ b/client/test/api/endpoints.test.ts
@@ -82,6 +82,74 @@ describe("endpoints de salas", () => {
   });
 });
 
+describe("endpoints de estadísticas", () => {
+  const statsResponse = { username: "ash", stats: { played: 0 } };
+
+  it("mine pide tus estadísticas con la sesión", async () => {
+    const { api, endpoints, fetchMock } = setup(() => json(200, statsResponse));
+    api.setToken("tok");
+    await expect(endpoints.stats.mine()).resolves.toEqual(statsResponse);
+    expect(lastCall(fetchMock)).toMatchObject({ url: "/stats", method: "GET" });
+    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
+  });
+
+  it("forUser codifica el nombre en la ruta", async () => {
+    const { endpoints, fetchMock } = setup(() => json(200, statsResponse));
+    await endpoints.stats.forUser("ash_99");
+    expect(lastCall(fetchMock)).toMatchObject({ url: "/users/ash_99/stats", method: "GET" });
+    await endpoints.stats.forUser("a b/c?x");
+    expect(lastCall(fetchMock).url).toBe("/users/a%20b%2Fc%3Fx/stats");
+  });
+
+  it("un jugador que no existe llega como un error con su mensaje en español", async () => {
+    const { endpoints } = setup(() => json(404, { error: { code: "USER_NOT_FOUND", message: "x" } }));
+    await expect(endpoints.stats.forUser("nadie")).rejects.toMatchObject({
+      status: 404,
+      code: "USER_NOT_FOUND",
+      message: "No encontramos a ese jugador.",
+    });
+  });
+
+  it("history sin opciones no añade parámetros", async () => {
+    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
+    await expect(endpoints.stats.history()).resolves.toEqual({ games: [], nextCursor: null });
+    expect(lastCall(fetchMock)).toMatchObject({ url: "/stats/history", method: "GET" });
+  });
+
+  it("history envía el límite y el cursor, codificado, cuando se piden", async () => {
+    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
+    await endpoints.stats.history({ limit: 10, before: "a+b/c=" });
+    expect(lastCall(fetchMock).url).toBe("/stats/history?limit=10&before=a%2Bb%2Fc%3D");
+    await endpoints.stats.history({ before: "abc" });
+    expect(lastCall(fetchMock).url).toBe("/stats/history?before=abc");
+  });
+
+  it("history ignora un cursor nulo (la primera página)", async () => {
+    const { endpoints, fetchMock } = setup(() => json(200, { games: [], nextCursor: null }));
+    await endpoints.stats.history({ before: null });
+    expect(lastCall(fetchMock).url).toBe("/stats/history");
+  });
+});
+
+describe("endpoint de preferencias", () => {
+  it("savePreferences envía tema y modo con la sesión", async () => {
+    const { api, endpoints, fetchMock } = setup(() => json(200, { preferences: { theme: "pokedex", themeMode: "oscuro" } }));
+    api.setToken("tok");
+    await expect(endpoints.auth.savePreferences({ theme: "pokedex", themeMode: "oscuro" })).resolves.toBeUndefined();
+    expect(lastCall(fetchMock)).toEqual({
+      url: "/auth/me/preferences",
+      method: "PUT",
+      body: { theme: "pokedex", themeMode: "oscuro" },
+    });
+    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
+  });
+
+  it("si el servidor la rechaza, el error llega a quien llamó", async () => {
+    const { endpoints } = setup(() => json(400, { error: { code: "VALIDATION_ERROR", message: "x" } }));
+    await expect(endpoints.auth.savePreferences({ theme: "clasico", themeMode: "auto" })).rejects.toMatchObject({ status: 400 });
+  });
+});
+
 describe("endpoint del catálogo", () => {
   it("names pide la lista sin enviar credenciales de sesión", async () => {
     const { api, endpoints, fetchMock } = setup(() => json(200, [{ id: 1, es: "Alfa", en: "Alpha" }]));
```

`client/test/api/proxy.test.ts` (cada prefijo de la API debe estar en el proxy de desarrollo; las pantallas del cliente, no):

```ts
import { describe, expect, it } from "vitest";
import config from "../../vite.config";

describe("proxy de desarrollo", () => {
  const proxy = (config.server?.proxy ?? {}) as Record<string, unknown>;

  it.each(["/auth", "/rooms", "/pokemon", "/stats", "/users", "/socket.io"])(
    "reenvía %s al servidor del juego (con la API en el mismo origen la cookie de sesión funciona)",
    (prefix) => {
      expect(Object.keys(proxy)).toContain(prefix);
    },
  );

  it("las pantallas del cliente no se reenvían al servidor", () => {
    for (const route of ["/perfil", "/jugador", "/sala", "/login", "/registro"]) {
      expect(Object.keys(proxy)).not.toContain(route);
    }
  });

  it("el WebSocket de Socket.io va con ws activado", () => {
    expect(proxy["/socket.io"]).toMatchObject({ ws: true });
  });
});
```

`client/test/api/client.test.ts` (el usuario de la sesión de prueba ahora lleva `preferences`):

```diff
diff --git a/client/test/api/client.test.ts b/client/test/api/client.test.ts
index 1f8002a..cdfb39d 100644
--- a/client/test/api/client.test.ts
+++ b/client/test/api/client.test.ts
@@ -3,7 +3,7 @@ import { ApiClient, ApiError } from "../../src/api/client";
 import type { AuthSession } from "../../src/api/types";
 
 const session = (token: string): AuthSession => ({
-  user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" },
+  user: { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z", preferences: null },
   accessToken: token,
 });
```

`client/test/helpers/services.tsx` (servicios falsos con los endpoints nuevos):

```diff
diff --git a/client/test/helpers/services.tsx b/client/test/helpers/services.tsx
index 904c7d7..d5aad22 100644
--- a/client/test/helpers/services.tsx
+++ b/client/test/helpers/services.tsx
@@ -1,3 +1,4 @@
+import type { Stats } from "@pokemon-minigames/shared";
 import { render } from "@testing-library/react";
 import type { ReactElement } from "react";
 import { MemoryRouter, Route, Routes, useLocation } from "react-router";
@@ -10,7 +11,27 @@ import { ServicesProvider, type Services } from "../../src/services";
 import { createSessionStore } from "../../src/session/session-store";
 import { createThemeStore } from "../../src/theme/theme-store";
 
-export const ASH: AuthUser = { id: "u1", email: "ash@example.com", username: "ash", createdAt: "2026-01-01T00:00:00.000Z" };
+export const ASH: AuthUser = {
+  id: "u1",
+  email: "ash@example.com",
+  username: "ash",
+  createdAt: "2026-01-01T00:00:00.000Z",
+  preferences: null,
+};
+
+/** Estadísticas de una persona que todavía no ha jugado. */
+export const NO_STATS: Stats = {
+  played: 0,
+  wins: 0,
+  draws: 0,
+  losses: 0,
+  winRate: null,
+  currentStreak: 0,
+  bestStreak: 0,
+  averagePower: null,
+  bestGameScore: null,
+  topPokemon: [],
+};
 
 export const NAMES: PokemonName[] = [
   { id: 1, es: "Alfa", en: "Alpha" },
@@ -35,6 +56,7 @@ export function fakeServices(): FakeServices {
       login: vi.fn(async () => ({ user: ASH, accessToken: "tok" })),
       refresh: vi.fn(async () => null),
       logout: vi.fn(async () => {}),
+      savePreferences: vi.fn(async () => {}),
     },
     rooms: {
       create: vi.fn(async () => ({ code: "ABC234" })),
@@ -43,6 +65,11 @@ export function fakeServices(): FakeServices {
       current: vi.fn(async () => null),
     },
     catalog: { names: vi.fn(async () => NAMES) },
+    stats: {
+      mine: vi.fn(async () => ({ username: "ash", stats: NO_STATS })),
+      forUser: vi.fn(async (username: string) => ({ username, stats: NO_STATS })),
+      history: vi.fn(async () => ({ games: [], nextCursor: null })),
+    },
   };
   const client = { join: vi.fn(), chooseType: vi.fn(), submit: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
   const themeRoot = document.createElement("html");
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/api
```

Expected: FAIL — `endpoints.stats` y `endpoints.auth.savePreferences` no existen, y el proxy no incluye `/stats` ni `/users`.

- [ ] **Step 3: Implementar**

`client/src/api/types.ts`:

```diff
diff --git a/client/src/api/types.ts b/client/src/api/types.ts
index bf1b4a4..342205c 100644
--- a/client/src/api/types.ts
+++ b/client/src/api/types.ts
@@ -1,8 +1,12 @@
+import type { ThemePreferences } from "@pokemon-minigames/shared";
+
 export interface AuthUser {
   id: string;
   email: string;
   username: string;
   createdAt: string;
+  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
+  preferences: ThemePreferences | null;
 }
 
 /** Respuesta de /auth/register, /auth/login y /auth/refresh. */
```

`client/src/api/endpoints.ts`:

```diff
diff --git a/client/src/api/endpoints.ts b/client/src/api/endpoints.ts
index 8ef7029..dcf66b3 100644
--- a/client/src/api/endpoints.ts
+++ b/client/src/api/endpoints.ts
@@ -1,4 +1,12 @@
-import type { CreateRoomRequest, CreateRoomResponse, GamePhase, PublicRoomInfo } from "@pokemon-minigames/shared";
+import type {
+  CreateRoomRequest,
+  CreateRoomResponse,
+  GamePhase,
+  HistoryPage,
+  PublicRoomInfo,
+  StatsResponse,
+  ThemePreferences,
+} from "@pokemon-minigames/shared";
 import type { ApiClient } from "./client";
 import type { AuthSession, PokemonName } from "./types";
 
@@ -24,6 +32,8 @@ export interface Endpoints {
     /** Renueva la sesión con la cookie de refresco; `null` si no hay sesión. */
     refresh(): Promise<AuthSession | null>;
     logout(): Promise<void>;
+    /** Guarda el tema y el modo en el perfil. */
+    savePreferences(preferences: ThemePreferences): Promise<void>;
   };
   rooms: {
     create(config: CreateRoomRequest): Promise<CreateRoomResponse>;
@@ -35,6 +45,14 @@ export interface Endpoints {
   catalog: {
     names(): Promise<PokemonName[]>;
   };
+  stats: {
+    /** Tus estadísticas. */
+    mine(): Promise<StatsResponse>;
+    /** Las estadísticas de otra persona (solo lo público: nunca su historial ni su correo). */
+    forUser(username: string): Promise<StatsResponse>;
+    /** Tus partidas completadas, de la más reciente a la más antigua; `before` es el cursor de la página anterior. */
+    history(options?: { before?: string | null; limit?: number }): Promise<HistoryPage>;
+  };
 }
 
 export function createEndpoints(api: ApiClient): Endpoints {
@@ -57,6 +75,9 @@ export function createEndpoints(api: ApiClient): Endpoints {
           api.setToken(null);
         }
       },
+      async savePreferences(preferences) {
+        await api.request<unknown>("PUT", "/auth/me/preferences", { body: preferences });
+      },
     },
     rooms: {
       create: (config) => api.request<CreateRoomResponse>("POST", "/rooms", { body: config }),
@@ -70,5 +91,16 @@ export function createEndpoints(api: ApiClient): Endpoints {
     catalog: {
       names: () => api.request<PokemonName[]>("GET", "/pokemon/names", { auth: false }),
     },
+    stats: {
+      mine: () => api.request<StatsResponse>("GET", "/stats"),
+      forUser: (username) => api.request<StatsResponse>("GET", `/users/${encodeURIComponent(username)}/stats`),
+      history({ before, limit } = {}) {
+        const query = new URLSearchParams();
+        if (limit !== undefined) query.set("limit", String(limit));
+        if (before) query.set("before", before);
+        const text = query.toString();
+        return api.request<HistoryPage>("GET", `/stats/history${text ? `?${text}` : ""}`);
+      },
+    },
   };
 }
```

`client/vite.config.ts`:

```diff
diff --git a/client/vite.config.ts b/client/vite.config.ts
index 4844280..6503b0e 100644
--- a/client/vite.config.ts
+++ b/client/vite.config.ts
@@ -13,6 +13,8 @@ export default defineConfig({
       "/auth": api,
       "/rooms": api,
       "/pokemon": api,
+      "/stats": api,
+      "/users": api,
       "/socket.io": { target: api, ws: true },
     },
   },
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck
```

Expected: PASS (todo el cliente: **326 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): endpoints de estadísticas y preferencias, y proxy de desarrollo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tema sincronizado con la sesión

**Files:**
- Create: `client/src/theme/theme-sync.ts`, `client/test/theme/theme-sync.test.ts`, `client/test/services.test.ts`
- Modify: `client/src/theme/theme-store.ts`, `client/src/services.tsx`
- Test (modificar): `client/test/theme/theme-store.test.ts`

**Interfaces:**
- Consumes: `THEME_NAMES`, `THEME_MODES`, `ThemeName`, `ThemeMode` (Task 2; `theme-store.ts` los re-exporta para no cambiar a quien ya los importaba); `Endpoints.auth.savePreferences` y `AuthUser.preferences` (Task 8).
- Produces: `ThemeState.setPreference(preference)` (aplica tema y modo juntos, los guarda en el navegador) y `ThemeState.hasChoice` (la persona ya eligió, ahora o en una visita anterior: los valores por defecto no cuentan); `syncThemeWithSession({ session, theme, endpoints }): () => void` — al iniciar sesión manda la preferencia del servidor (si no tiene ninguna pero la persona ya había elegido en el navegador, la sube; los valores por defecto no se suben), con sesión cada cambio se guarda sin bloquear nada (un fallo se ignora) y aplicar la del servidor no la vuelve a guardar; sin sesión todo queda en el navegador y cerrar sesión conserva el tema. `createServices` lo conecta.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/theme/theme-store.test.ts`:

```diff
diff --git a/client/test/theme/theme-store.test.ts b/client/test/theme/theme-store.test.ts
index 61c8846..6025468 100644
--- a/client/test/theme/theme-store.test.ts
+++ b/client/test/theme/theme-store.test.ts
@@ -1,8 +1,11 @@
 import { readFileSync } from "node:fs";
 import { join } from "node:path";
+import * as shared from "@pokemon-minigames/shared";
 import { describe, expect, it } from "vitest";
 import {
   DEFAULT_PREFERENCE,
+  THEME_MODES,
+  THEME_NAMES,
   THEME_STORAGE_KEY,
   type ThemeEnv,
   createThemeStore,
@@ -124,6 +127,61 @@ describe("createThemeStore", () => {
   });
 });
 
+describe("setPreference", () => {
+  it("aplica tema y modo juntos, los guarda y recalcula el modo resuelto", () => {
+    const { env, data, root } = fakeEnv();
+    const store = createThemeStore(env);
+    store.getState().setPreference({ theme: "pokedex", mode: "oscuro" });
+    expect(store.getState()).toMatchObject({ preference: { theme: "pokedex", mode: "oscuro" }, resolvedMode: "oscuro" });
+    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
+    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
+  });
+
+  it("también funciona sin almacenamiento", () => {
+    const { env, root } = fakeEnv({ brokenStorage: true });
+    const store = createThemeStore(env);
+    expect(() => store.getState().setPreference({ theme: "pokedex", mode: "claro" })).not.toThrow();
+    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "claro" });
+  });
+});
+
+describe("hasChoice", () => {
+  it("al principio es falso: todavía no se ha elegido nada", () => {
+    expect(createThemeStore(fakeEnv().env).getState().hasChoice).toBe(false);
+  });
+
+  it("es verdadero si el navegador ya tenía una preferencia guardada", () => {
+    const { env } = fakeEnv({ saved: '{"theme":"pokedex","mode":"oscuro"}' });
+    expect(createThemeStore(env).getState().hasChoice).toBe(true);
+  });
+
+  it("pasa a verdadero cuando la persona elige tema, modo o aplica una preferencia", () => {
+    for (const choose of [
+      (s: ReturnType<typeof createThemeStore>) => s.getState().setTheme("pokedex"),
+      (s: ReturnType<typeof createThemeStore>) => s.getState().setMode("claro"),
+      (s: ReturnType<typeof createThemeStore>) => s.getState().setPreference({ theme: "clasico", mode: "auto" }),
+    ]) {
+      const store = createThemeStore(fakeEnv().env);
+      choose(store);
+      expect(store.getState().hasChoice).toBe(true);
+    }
+  });
+
+  it("un cambio del tema del sistema no cuenta como elegir", () => {
+    const { env, changeSystemTheme } = fakeEnv();
+    const store = createThemeStore(env);
+    changeSystemTheme(true);
+    expect(store.getState().hasChoice).toBe(false);
+  });
+});
+
+describe("opciones de tema", () => {
+  it("son exactamente las que acepta el servidor", () => {
+    expect(THEME_NAMES).toBe(shared.THEME_NAMES);
+    expect(THEME_MODES).toBe(shared.THEME_MODES);
+  });
+});
+
 describe("script que aplica el tema antes de pintar (index.html)", () => {
   const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8");
   const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
```

`client/test/theme/theme-sync.test.ts` (el servidor gana, se sube lo local solo si fue una elección, sin eco, un cambio del tema del sistema no se guarda, un fallo de red se ignora, cambio de cuenta, cerrar sesión y detener la sincronización):

```ts
import type { ThemePreferences } from "@pokemon-minigames/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type StoreApi, createStore } from "zustand";
import type { Endpoints } from "../../src/api/endpoints";
import type { AuthUser } from "../../src/api/types";
import type { SessionState } from "../../src/session/session-store";
import { syncThemeWithSession } from "../../src/theme/theme-sync";
import { THEME_STORAGE_KEY, createThemeStore } from "../../src/theme/theme-store";
import { ASH } from "../helpers/services";

const userWith = (preferences: ThemePreferences | null, id = "u1"): AuthUser => ({ ...ASH, id, preferences });

function setup(options: { saved?: object; savePreferences?: () => Promise<void> } = {}) {
  const data = new Map<string, string>();
  if (options.saved) data.set(THEME_STORAGE_KEY, JSON.stringify(options.saved));
  const listeners: Array<() => void> = [];
  const media = { matches: false, addEventListener: (_t: "change", l: () => void) => void listeners.push(l) };
  const root = document.createElement("html");
  const theme = createThemeStore({
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    root,
    media,
  });
  const session = createStore<SessionState>(() => ({ status: "loading", user: null }) as unknown as SessionState);
  const savePreferences = vi.fn(options.savePreferences ?? (async () => {}));
  const endpoints = { auth: { savePreferences } } as unknown as Endpoints;
  const stop = syncThemeWithSession({ session, theme, endpoints });
  const signIn = (user: AuthUser) => session.setState({ status: "authenticated", user });
  const signOut = () => session.setState({ status: "anonymous", user: null });
  const changeSystemTheme = (dark: boolean) => {
    media.matches = dark;
    listeners.forEach((l) => l());
  };
  return { theme, session: session as StoreApi<SessionState>, savePreferences, signIn, signOut, root, data, stop, changeSystemTheme };
}

afterEach(() => vi.restoreAllMocks());

describe("al iniciar sesión", () => {
  it("la preferencia guardada en el servidor gana y se aplica, sin volver a guardarla", () => {
    const { theme, signIn, savePreferences, root } = setup({ saved: { theme: "clasico", mode: "claro" } });
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(root.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("la del servidor también queda en el navegador para el próximo arranque", () => {
    const { signIn, data } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!)).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("si el servidor no tiene ninguna pero el navegador sí, se sube la del navegador", () => {
    const { signIn, savePreferences } = setup({ saved: { theme: "pokedex", mode: "claro" } });
    signIn(userWith(null));
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "claro" });
  });

  it("si ninguno de los dos tiene una elección, no se sube nada (los valores por defecto no son una elección)", () => {
    const { signIn, savePreferences, theme } = setup();
    signIn(userWith(null));
    expect(savePreferences).not.toHaveBeenCalled();
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "auto" });
  });

  it("si la sesión ya estaba iniciada cuando empieza la sincronización, también aplica la del servidor", () => {
    const theme = createThemeStore({ storage: null, root: document.createElement("html"), media: { matches: false, addEventListener: () => {} } });
    const session = createStore<SessionState>(
      () => ({ status: "authenticated", user: userWith({ theme: "pokedex", themeMode: "oscuro" }) }) as unknown as SessionState,
    );
    syncThemeWithSession({ session, theme, endpoints: { auth: { savePreferences: vi.fn() } } as unknown as Endpoints });
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
  });

  it("al cambiar a otra cuenta sin cerrar sesión, aplica la preferencia de la nueva", () => {
    const { theme, signIn } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }, "u1"));
    signIn(userWith({ theme: "clasico", themeMode: "claro" }, "u2"));
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "claro" });
  });

  it("otra actualización de la misma sesión (mismo usuario) no pisa lo que la persona acaba de elegir", () => {
    const { theme, signIn } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    theme.getState().setTheme("clasico");
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" })); // p. ej. una renovación de la sesión
    expect(theme.getState().preference.theme).toBe("clasico");
  });
});

describe("con la sesión iniciada", () => {
  it("cada cambio de tema o de modo se guarda en el servidor", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    expect(savePreferences).toHaveBeenLastCalledWith({ theme: "pokedex", themeMode: "auto" });
    theme.getState().setMode("oscuro");
    expect(savePreferences).toHaveBeenLastCalledWith({ theme: "pokedex", themeMode: "oscuro" });
    expect(savePreferences).toHaveBeenCalledTimes(2);
  });

  it("elegir lo que ya está guardado no vuelve a mandarlo", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    theme.getState().setTheme("pokedex");
    theme.getState().setPreference({ theme: "pokedex", mode: "oscuro" });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("el primer cambio de quien no tenía nada guardado también se guarda", () => {
    const { theme, signIn, savePreferences } = setup();
    signIn(userWith(null));
    theme.getState().setTheme("pokedex");
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "auto" });
  });

  it("un cambio del tema del sistema (modo automático) no se guarda", () => {
    const { signIn, savePreferences, changeSystemTheme, theme } = setup();
    signIn(userWith(null));
    changeSystemTheme(true);
    expect(theme.getState().resolvedMode).toBe("oscuro");
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("si guardar falla, no pasa nada: la preferencia local sigue valiendo y el siguiente cambio vuelve a intentarlo", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const { theme, signIn, savePreferences } = setup({ savePreferences: async () => Promise.reject(new Error("sin red")) });
    signIn(userWith({ theme: "clasico", themeMode: "auto" }));
    theme.getState().setTheme("pokedex");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(theme.getState().preference.theme).toBe("pokedex");
    theme.getState().setMode("claro");
    expect(savePreferences).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("sin sesión", () => {
  it("los cambios de tema solo valen en este navegador", () => {
    const { theme, savePreferences, data } = setup();
    theme.getState().setTheme("pokedex");
    expect(savePreferences).not.toHaveBeenCalled();
    expect(JSON.parse(data.get(THEME_STORAGE_KEY)!).theme).toBe("pokedex");
  });

  it("tras cerrar sesión se conserva el tema actual y los cambios dejan de guardarse", () => {
    const { theme, signIn, signOut, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    signOut();
    expect(theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    theme.getState().setMode("claro");
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("al volver a entrar con una cuenta sin preferencia se sube lo que quedó en el navegador", () => {
    const { theme, signIn, signOut, savePreferences } = setup();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }, "u1"));
    signOut();
    theme.getState().setMode("claro");
    signIn(userWith(null, "u2"));
    expect(savePreferences).toHaveBeenCalledExactlyOnceWith({ theme: "pokedex", themeMode: "claro" });
  });
});

describe("al detener la sincronización", () => {
  it("deja de reaccionar a la sesión y al tema", () => {
    const { theme, signIn, stop, savePreferences } = setup();
    stop();
    signIn(userWith({ theme: "pokedex", themeMode: "oscuro" }));
    expect(theme.getState().preference).toEqual({ theme: "clasico", mode: "auto" });
    theme.getState().setTheme("pokedex");
    expect(savePreferences).not.toHaveBeenCalled();
  });
});
```

`client/test/services.test.ts` (la conexión real entre sesión y tema en `createServices`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServices } from "../src/services";
import { ASH } from "./helpers/services";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});
afterEach(() => vi.unstubAllGlobals());

describe("createServices", () => {
  it("conecta el tema con la sesión: al iniciar sesión se aplica la preferencia guardada en el servidor", () => {
    const services = createServices();
    services.session.setState({
      status: "authenticated",
      user: { ...ASH, preferences: { theme: "pokedex", themeMode: "oscuro" } },
    });
    expect(services.theme.getState().preference).toEqual({ theme: "pokedex", mode: "oscuro" });
    expect(document.documentElement.dataset).toMatchObject({ theme: "pokedex", mode: "oscuro" });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/theme test/services.test.ts
```

Expected: FAIL — no existen `src/theme/theme-sync.ts`, `setPreference` ni `hasChoice`.

- [ ] **Step 3: Implementar**

`client/src/theme/theme-store.ts` (los nombres de tema y modo vienen de `shared/`; se agrega `setPreference` y `hasChoice`):

```diff
diff --git a/client/src/theme/theme-store.ts b/client/src/theme/theme-store.ts
index 5af2fa0..2b0a723 100644
--- a/client/src/theme/theme-store.ts
+++ b/client/src/theme/theme-store.ts
@@ -1,7 +1,9 @@
+import { THEME_MODES, THEME_NAMES, type ThemeMode, type ThemeName } from "@pokemon-minigames/shared";
 import { type StoreApi, createStore } from "zustand";
 
-export type ThemeName = "clasico" | "pokedex";
-export type ThemeMode = "auto" | "claro" | "oscuro";
+// Las opciones son las mismas que acepta el servidor al guardar la preferencia en el perfil.
+export { THEME_MODES, THEME_NAMES };
+export type { ThemeMode, ThemeName };
 export type ResolvedMode = "claro" | "oscuro";
 
 export interface ThemePreference {
@@ -11,8 +13,6 @@ export interface ThemePreference {
 
 export const THEME_LABELS: Record<ThemeName, string> = { clasico: "Clásico", pokedex: "Pokédex" };
 export const MODE_LABELS: Record<ThemeMode, string> = { auto: "Automático", claro: "Claro", oscuro: "Oscuro" };
-export const THEME_NAMES = Object.keys(THEME_LABELS) as ThemeName[];
-export const THEME_MODES = Object.keys(MODE_LABELS) as ThemeMode[];
 
 export const THEME_STORAGE_KEY = "pokemon-minigames:theme";
 export const DEFAULT_PREFERENCE: ThemePreference = { theme: "clasico", mode: "auto" };
@@ -39,8 +39,12 @@ export function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedMode
 export interface ThemeState {
   preference: ThemePreference;
   resolvedMode: ResolvedMode;
+  /** La persona ya eligió (ahora o en una visita anterior): lo que tiene no es solo el valor por defecto. */
+  hasChoice: boolean;
   setTheme(theme: ThemeName): void;
   setMode(mode: ThemeMode): void;
+  /** Aplica tema y modo juntos (p. ej. la preferencia guardada en el perfil). */
+  setPreference(preference: ThemePreference): void;
 }
 
 /** Lo que el almacén necesita de `matchMedia("(prefers-color-scheme: dark)")`. */
@@ -79,21 +83,22 @@ export function createThemeStore(env: ThemeEnv): StoreApi<ThemeState> {
     return resolvedMode;
   };
 
-  const initial = parsePreference(read());
-  const store = createStore<ThemeState>((set, get) => ({
-    preference: initial,
-    resolvedMode: apply(initial),
-    setTheme(theme) {
-      const preference = { ...get().preference, theme };
+  const saved = read();
+  const initial = parsePreference(saved);
+  const store = createStore<ThemeState>((set, get) => {
+    const choose = (preference: ThemePreference): void => {
       write(preference);
-      set({ preference, resolvedMode: apply(preference) });
-    },
-    setMode(mode) {
-      const preference = { ...get().preference, mode };
-      write(preference);
-      set({ preference, resolvedMode: apply(preference) });
-    },
-  }));
+      set({ preference, resolvedMode: apply(preference), hasChoice: true });
+    };
+    return {
+      preference: initial,
+      resolvedMode: apply(initial),
+      hasChoice: saved !== null,
+      setTheme: (theme) => choose({ ...get().preference, theme }),
+      setMode: (mode) => choose({ ...get().preference, mode }),
+      setPreference: (preference) => choose({ theme: preference.theme, mode: preference.mode }),
+    };
+  });
 
   // En modo automático, seguir los cambios del sistema mientras la página está abierta.
   env.media.addEventListener("change", () => {
```

`client/src/theme/theme-sync.ts`:

```ts
import type { StoreApi } from "zustand";
import type { Endpoints } from "../api/endpoints";
import type { SessionState } from "../session/session-store";
import type { ThemePreference, ThemeState } from "./theme-store";

export interface ThemeSyncDeps {
  session: StoreApi<SessionState>;
  theme: StoreApi<ThemeState>;
  endpoints: Pick<Endpoints, "auth">;
}

const same = (a: ThemePreference, b: ThemePreference): boolean => a.theme === b.theme && a.mode === b.mode;

/**
 * Mantiene la preferencia de tema del perfil y la del navegador de acuerdo:
 * - Al iniciar sesión (o recuperarla al cargar) manda la del servidor. Si el servidor no tiene ninguna pero la
 *   persona ya había elegido en este navegador, se sube esa; los valores por defecto no se suben.
 * - Con la sesión iniciada, cada cambio se guarda en el servidor sin bloquear nada: si falla, la preferencia
 *   local sigue valiendo. Aplicar la que vino del servidor no la vuelve a guardar (sin eco).
 * - Sin sesión, todo queda en el navegador. Cerrar sesión conserva el tema actual.
 * Devuelve la función que detiene la sincronización.
 */
export function syncThemeWithSession({ session, theme, endpoints }: ThemeSyncDeps): () => void {
  /** Lo último que se sabe que tiene el servidor (o que se le acaba de mandar). */
  let known: ThemePreference | null = null;

  const save = (preference: ThemePreference): void => {
    known = preference;
    void endpoints.auth.savePreferences({ theme: preference.theme, themeMode: preference.mode }).catch(() => {});
  };

  const onSession = (state: SessionState, previous?: SessionState): void => {
    if (state.status === "anonymous") known = null;
    if (state.status !== "authenticated") return;
    // Otra actualización de la misma sesión (p. ej. al renovarla) no debe pisar lo que la persona eligió.
    if (previous?.status === "authenticated" && previous.user?.id === state.user?.id) return;

    const stored = state.user?.preferences ?? null;
    if (stored) {
      const preference = { theme: stored.theme, mode: stored.themeMode };
      known = preference;
      theme.getState().setPreference(preference);
    } else if (theme.getState().hasChoice) {
      save(theme.getState().preference);
    }
  };

  onSession(session.getState());
  const stopSession = session.subscribe(onSession);
  const stopTheme = theme.subscribe((state, previous) => {
    // Solo importan los cambios de la preferencia, no los del modo resuelto cuando cambia el tema del sistema.
    if (state.preference === previous.preference) return;
    if (session.getState().status !== "authenticated") return;
    if (known && same(state.preference, known)) return;
    save(state.preference);
  });

  return () => {
    stopSession();
    stopTheme();
  };
}
```

`client/src/services.tsx` (conecta la sincronización al crear los servicios reales):

```diff
diff --git a/client/src/services.tsx b/client/src/services.tsx
index 898d9ea..83de9d5 100644
--- a/client/src/services.tsx
+++ b/client/src/services.tsx
@@ -8,6 +8,7 @@ import { GameClient, type GameClientApi, type SocketLike } from "./game/game-cli
 import { type GameStoreState, createGameStore } from "./game/store";
 import { type SessionState, createSessionStore } from "./session/session-store";
 import { type ThemeState, createThemeStore } from "./theme/theme-store";
+import { syncThemeWithSession } from "./theme/theme-sync";
 
 /** Todo lo que la interfaz necesita del exterior. En las pruebas se reemplaza por dobles. */
 export interface Services {
@@ -64,15 +65,19 @@ export function createServices(options: { baseUrl?: string } = {}): Services {
       io(baseUrl || undefined, { autoConnect: false, auth: (cb) => cb({ token: api.getToken() }) }) as unknown as SocketLike,
   });
 
+  const theme = createThemeStore({
+    storage: safeStorage(),
+    root: document.documentElement,
+    media: window.matchMedia("(prefers-color-scheme: dark)"),
+  });
+  // Dura lo que dura la aplicación: la preferencia del perfil y la del navegador se mantienen de acuerdo.
+  syncThemeWithSession({ session, theme, endpoints });
+
   return {
     endpoints,
     session,
     names: createNamesStore(endpoints),
     game: { store: gameStore, client },
-    theme: createThemeStore({
-      storage: safeStorage(),
-      root: document.documentElement,
-      media: window.matchMedia("(prefers-color-scheme: dark)"),
-    }),
+    theme,
   };
 }
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck
```

Expected: PASS (todo el cliente: **350 pruebas**) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): el tema se guarda en el perfil y se sincroniza con la sesión" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Pantallas de perfil e historial

**Files:**
- Create: `client/src/pages/profile/format.ts`, `client/src/pages/profile/use-load.ts`, `client/src/pages/profile/StatsView.tsx`, `client/src/pages/profile/HistoryList.tsx`, `client/src/pages/profile/ProfilePage.tsx`, `client/test/pages/profile.test.tsx`, `client/test/pages/profile-support.test.tsx`
- Modify: `client/src/routes.tsx`, `client/src/components/Header.tsx`, `client/src/pages/room/SummaryView.tsx`
- Test (modificar): `client/test/pages/routes.test.tsx`, `client/test/components/header-theme.test.tsx`, `client/test/pages/room.test.tsx`, `client/test/pages/auth.test.tsx`

**Interfaces:**
- Consumes: `Endpoints.stats.*` (Task 8), `RESULT_LABELS`, `historyReason`, `describeConfig`, `errorMessage` (Task 2), `PokemonCard`, `Notice`, `Button`, `useServices`.
- Produces: `formatPercent`, `formatPower` (un decimal con coma), `formatScore`, `winsLabel`, `formatDate` (`format.ts`); `useLoad(load, deps)` → `{ state: "loading" | "error" | "ready", reload }` (descarta las respuestas que llegan tarde o tras desmontar); `StatsView({ stats, own })`; `HistoryList()` (primera página sin cursor, "Cargar más" con el cursor, un fallo conserva lo ya cargado; al cargar una página el foco pasa a su primera partida y un `role="status"` anuncia cuántas llegaron); `ProfilePage` (`/perfil` propio con historial; `/jugador/:username` ajeno sin historial; carga, error con reintento y 404 con vuelta al lobby). Rutas nuevas bajo sesión, enlace "Mi perfil" en el encabezado y botón "Ver perfil de {rival}" en el resumen de la partida.

- [ ] **Step 1: Escribir las pruebas que fallan**

`client/test/pages/profile.test.tsx` (perfil propio y ajeno con endpoints falsos: carga, datos completos, vacío, guiones, error con reintento, 404, y el historial con paginación, doble pulsación, fallos y vacío):

```tsx
import type { HistoryEntry, Stats, StatsResponse } from "@pokemon-minigames/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { pokemon } from "../helpers/events";
import { LocationProbe, NO_STATS, type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

const FULL: Stats = {
  played: 5,
  wins: 3,
  draws: 1,
  losses: 1,
  winRate: 0.6,
  currentStreak: 2,
  bestStreak: 3,
  averagePower: 512.5,
  bestGameScore: 1534,
  topPokemon: [
    { pokemon: pokemon(6, 534, { names: { es: "Charizard", en: "Charizard" } }), wins: 3 },
    { pokemon: pokemon(25, 320, { names: { es: "Pikachu", en: "Pikachu" } }), wins: 1 },
  ],
};

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "g1",
  endedAt: "2026-09-30T12:00:00.000Z",
  result: "won",
  reason: "completed",
  opponent: { username: "misty" },
  myScore: 1100,
  opponentScore: 0,
  config: { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3, statsGoal: null },
  ...overrides,
});

function renderAt(route: string, services: FakeServices = fakeServices()) {
  const utils = renderWithServices(
    <>
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/jugador/:username" element={<ProfilePage />} />
        <Route path="*" element={<p>Otra pantalla</p>} />
      </Routes>
      <LocationProbe />
    </>,
    { services, route },
  );
  return { ...utils, user: userEvent.setup() };
}

/** Las partidas de la lista del historial (la lista de Pokémon más ganados también tiene elementos). */
const historyItems = () => within(screen.getByRole("list", { name: "Historial de partidas" })).getAllByRole("listitem");

/** El valor que acompaña a una etiqueta de la lista de datos. */
const valueOf = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;

describe("perfil propio", () => {
  it("mientras llega la respuesta dice que está cargando", () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn((): Promise<StatsResponse> => new Promise(() => {}));
    renderAt("/perfil", services);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando perfil…");
  });

  it("pide las estadísticas propias y no las de otra persona", async () => {
    const services = fakeServices();
    renderAt("/perfil", services);
    expect(await screen.findByRole("heading", { name: "Tu perfil" })).toBeInTheDocument();
    expect(services.endpoints.stats.mine).toHaveBeenCalledTimes(1);
    expect(services.endpoints.stats.forUser).not.toHaveBeenCalled();
    expect(screen.getByText("ash")).toBeInTheDocument();
  });

  it("muestra el resumen: partidas, ganadas, empatadas, perdidas, porcentaje y rachas", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const summary = await screen.findByRole("region", { name: "Resumen" });
    const value = (label: string) => within(summary).getByText(label).nextElementSibling;
    expect(value("Partidas")).toHaveTextContent("5");
    expect(value("Ganadas")).toHaveTextContent("3");
    expect(value("Empatadas")).toHaveTextContent("1");
    expect(value("Perdidas")).toHaveTextContent("1");
    expect(value("Victorias")).toHaveTextContent("60 %");
    expect(value("Racha actual")).toHaveTextContent("2");
    expect(value("Mejor racha")).toHaveTextContent("3");
  });

  it("muestra el poder promedio con coma decimal y la mejor partida", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const power = await screen.findByRole("region", { name: "Poder" });
    expect(within(power).getByText("Poder promedio").nextElementSibling).toHaveTextContent("512,5");
    expect(within(power).getByText("Mejor partida").nextElementSibling).toHaveTextContent("1534");
  });

  it("muestra los Pokémon más ganados con las veces que los ganó", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    renderAt("/perfil", services);
    const top = await screen.findByRole("region", { name: "Pokémon más ganados" });
    expect(within(top).getByRole("heading", { name: "Charizard" })).toBeInTheDocument();
    expect(within(top).getByText("Ganado 3 veces")).toBeInTheDocument();
    expect(within(top).getByRole("heading", { name: "Pikachu" })).toBeInTheDocument();
    expect(within(top).getByText("Ganado 1 vez")).toBeInTheDocument();
  });

  it("si todavía no ha jugado, lo dice y no muestra cifras vacías", async () => {
    renderAt("/perfil");
    expect(await screen.findByText("Todavía no has jugado ninguna partida.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resumen" })).not.toBeInTheDocument();
  });

  it("con partidas pero sin Pokémon ganados ni puntajes, usa un guion y lo explica", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({
      username: "ash",
      stats: { ...NO_STATS, played: 2, losses: 2, winRate: 0 },
    }));
    renderAt("/perfil", services);
    const power = await screen.findByRole("region", { name: "Poder" });
    expect(within(power).getByText("Poder promedio").nextElementSibling).toHaveTextContent("—");
    expect(within(power).getByText("Mejor partida").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Todavía no has ganado ningún Pokémon.")).toBeInTheDocument();
    expect(valueOf("Victorias")).toHaveTextContent("0 %");
  });

  it("si falla, lo avisa en español y permite reintentar", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR"))
      .mockResolvedValueOnce({ username: "ash", stats: FULL });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló en el servidor");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: "Resumen" })).toBeInTheDocument();
    expect(services.endpoints.stats.mine).toHaveBeenCalledTimes(2);
  });

  it("un error de red también tiene su mensaje", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn().mockRejectedValue(new ApiError(0, "NETWORK"));
    renderAt("/perfil", services);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
});

describe("perfil de otra persona", () => {
  it("pide las estadísticas de ese nombre y muestra su nombre como título", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, stats: FULL }));
    renderAt("/jugador/misty", services);
    expect(await screen.findByRole("heading", { name: "misty" })).toBeInTheDocument();
    expect(services.endpoints.stats.forUser).toHaveBeenCalledExactlyOnceWith("misty");
    expect(services.endpoints.stats.mine).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Resumen" })).getByText("Ganadas")).toBeInTheDocument();
  });

  it("no muestra el historial ni lo pide", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn(async (username: string) => ({ username, stats: FULL }));
    renderAt("/jugador/misty", services);
    await screen.findByRole("heading", { name: "misty" });
    expect(screen.queryByRole("heading", { name: "Historial" })).not.toBeInTheDocument();
    expect(services.endpoints.stats.history).not.toHaveBeenCalled();
  });

  it("si todavía no ha jugado, lo dice en tercera persona", async () => {
    renderAt("/jugador/misty");
    expect(await screen.findByText("Todavía no ha jugado ninguna partida.")).toBeInTheDocument();
  });

  it("un jugador que no existe se explica y lleva de vuelta al lobby", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn().mockRejectedValue(new ApiError(404, "USER_NOT_FOUND"));
    const { user } = renderAt("/jugador/nadie", services);
    expect(await screen.findByText("No encontramos a ese jugador.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
  });

  it("los otros errores sí permiten reintentar", async () => {
    const services = fakeServices();
    services.endpoints.stats.forUser = vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL_ERROR"));
    renderAt("/jugador/misty", services);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("historial", () => {
  const withHistory = (...pages: { games: HistoryEntry[]; nextCursor: string | null }[]) => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", stats: FULL }));
    const history = vi.fn();
    for (const page of pages) history.mockResolvedValueOnce(page);
    services.endpoints.stats.history = history;
    return services;
  };

  it("pide la primera página sin cursor", async () => {
    const services = withHistory({ games: [entry()], nextCursor: null });
    renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    expect(services.endpoints.stats.history).toHaveBeenCalledExactlyOnceWith({ before: null });
  });

  it("cada partida muestra resultado, rival con enlace a su perfil, marcador, motivo, configuración y fecha", async () => {
    const services = withHistory({
      games: [
        entry({ id: "g1", result: "won", reason: "forfeit" }),
        entry({ id: "g2", result: "drawn", reason: "completed", opponent: { username: "brock" }, myScore: 500, opponentScore: 500 }),
        entry({
          id: "g3",
          result: "lost",
          reason: "disconnect",
          opponent: { username: "gary" },
          myScore: 200,
          opponentScore: 900,
          config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 2500 },
        }),
      ],
      nextCursor: null,
    });
    renderAt("/perfil", services);
    const items = within(await screen.findByRole("list", { name: "Historial de partidas" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    expect(within(items[0]!).getByText("Ganaste")).toBeInTheDocument();
    expect(within(items[0]!).getByRole("link", { name: "misty" })).toHaveAttribute("href", "/jugador/misty");
    expect(within(items[0]!).getByText("1100 – 0")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Tu rival abandonó")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Tipos aleatorios · 3 rondas")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/2026/)).toBeInTheDocument();
    expect(items[0]!.querySelector("time")).toHaveAttribute("datetime", "2026-09-30T12:00:00.000Z");

    expect(within(items[1]!).getByText("Empate")).toBeInTheDocument();
    expect(within(items[1]!).getByText("500 – 500")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Perdiste")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Te desconectaste")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Tipos elegidos · meta de 2500 puntos")).toBeInTheDocument();
  });

  it("un puntaje que no se guardó se muestra con un guion", async () => {
    const services = withHistory({ games: [entry({ myScore: null, opponentScore: null })], nextCursor: null });
    renderAt("/perfil", services);
    expect(await screen.findByText("— – —")).toBeInTheDocument();
  });

  it("una partida sin motivo guardado se muestra como una partida normal", async () => {
    const services = withHistory({ games: [entry({ reason: null })], nextCursor: null });
    renderAt("/perfil", services);
    expect(await screen.findByText("La partida terminó")).toBeInTheDocument();
  });

  it("'Cargar más' pide la página siguiente con el cursor y la agrega; al acabar el botón desaparece", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: null },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(2));
    expect(services.endpoints.stats.history).toHaveBeenLastCalledWith({ before: "cursor-1" });
    expect(screen.getByRole("link", { name: "brock" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("al llegar la página siguiente el foco pasa a su primera partida y se anuncia (el botón puede desaparecer)", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } }), entry({ id: "g3", opponent: { username: "gary" } })], nextCursor: null },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
    expect(historyItems()[1]).toHaveFocus();
    expect(within(historyItems()[1]!).getByRole("link", { name: "brock" })).toBeInTheDocument();
    expect(screen.getByText("Se cargaron 2 partidas más.")).toBeInTheDocument();
  });

  it("si la página siguiente trae una sola partida, el anuncio va en singular", async () => {
    const services = withHistory(
      { games: [entry({ id: "g1" })], nextCursor: "cursor-1" },
      { games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: "cursor-2" },
    );
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText("Se cargó 1 partida más.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });

  it("no pide la misma página dos veces si se pulsa dos veces seguidas", async () => {
    let finish!: (page: { games: HistoryEntry[]; nextCursor: string | null }) => void;
    const services = withHistory({ games: [entry({ id: "g1" })], nextCursor: "cursor-1" });
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    const button = screen.getByRole("button", { name: "Cargar más" });
    await user.click(button);
    await user.click(button);
    expect(history).toHaveBeenCalledTimes(2); // la primera página y una sola vez la siguiente
    expect(button).toBeDisabled();
    finish({ games: [], nextCursor: null });
  });

  it("si falla cargar más, conserva lo que ya se veía y permite reintentar", async () => {
    const services = withHistory({ games: [entry({ id: "g1" })], nextCursor: "cursor-1" });
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockRejectedValueOnce(new ApiError(0, "NETWORK")).mockResolvedValueOnce({ games: [entry({ id: "g2", opponent: { username: "brock" } })], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    await screen.findByRole("list", { name: "Historial de partidas" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText("No se pudo cargar la siguiente página.")).toBeInTheDocument();
    expect(historyItems()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(historyItems()).toHaveLength(2));
    expect(screen.queryByText("No se pudo cargar la siguiente página.")).not.toBeInTheDocument();
  });

  it("si falla la primera página, lo avisa y permite reintentar sin perder las estadísticas", async () => {
    const services = withHistory();
    const history = services.endpoints.stats.history as ReturnType<typeof vi.fn>;
    history.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR")).mockResolvedValueOnce({ games: [entry()], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByRole("region", { name: "Resumen" })).toBeInTheDocument();
    const alert = await screen.findByText("No se pudo cargar el historial.");
    expect(alert).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar el historial" }));
    expect(await screen.findByRole("list", { name: "Historial de partidas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen" })).toBeInTheDocument();
  });

  it("sin partidas explica que aparecerán aquí y ofrece crear una sala", async () => {
    const services = withHistory({ games: [], nextCursor: null });
    const { user } = renderAt("/perfil", services);
    expect(await screen.findByText("Cuando juegues, tus partidas aparecerán aquí.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear una sala" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
```

`client/test/pages/profile-support.test.tsx` (formatos y `useLoad`, incluida la respuesta vieja que llega tarde):

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDate, formatPercent, formatPower, formatScore, winsLabel } from "../../src/pages/profile/format";
import { useLoad } from "../../src/pages/profile/use-load";

describe("formatos del perfil", () => {
  it("el porcentaje se redondea y lleva un espacio antes del signo; sin datos es un guion", () => {
    expect(formatPercent(0.6)).toBe("60 %");
    expect(formatPercent(2 / 3)).toBe("67 %");
    expect(formatPercent(0)).toBe("0 %");
    expect(formatPercent(1)).toBe("100 %");
    expect(formatPercent(null)).toBe("—");
  });

  it("el poder promedio lleva siempre un decimal, con coma; sin datos es un guion", () => {
    expect(formatPower(512.5)).toBe("512,5");
    expect(formatPower(450)).toBe("450,0");
    expect(formatPower(null)).toBe("—");
  });

  it("un puntaje se muestra tal cual; si no se guardó, un guion", () => {
    expect(formatScore(1534)).toBe("1534");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(null)).toBe("—");
  });

  it("las veces ganadas concuerdan en singular y plural", () => {
    expect(winsLabel(1)).toBe("Ganado 1 vez");
    expect(winsLabel(2)).toBe("Ganado 2 veces");
    expect(winsLabel(10)).toBe("Ganado 10 veces");
  });

  it("la fecha se escribe en español con el año", () => {
    const text = formatDate("2026-09-30T12:00:00.000Z");
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/sept|set/i);
  });
});

describe("useLoad", () => {
  it("empieza cargando y pasa a listo con los datos", async () => {
    const { result } = renderHook(() => useLoad(async () => "datos", []));
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos" });
  });

  it("si falla, pasa a error con lo que se lanzó", async () => {
    const error = new Error("falló");
    const { result } = renderHook(() => useLoad(async () => Promise.reject(error), []));
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "error", error });
  });

  it("reload vuelve a cargar, pasando otra vez por cargando", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce("bien");
    const { result } = renderHook(() => useLoad(load, []));
    await act(async () => {});
    expect(result.current.state.status).toBe("error");
    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "bien" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("al cambiar los datos de entrada vuelve a cargar", async () => {
    const load = vi.fn(async (key: string) => `datos de ${key}`);
    const { result, rerender } = renderHook(({ key }) => useLoad(() => load(key), [key]), { initialProps: { key: "a" } });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos de a" });
    rerender({ key: "b" });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "ready", data: "datos de b" });
  });

  it("ignora la respuesta vieja que llega después de haber cambiado los datos de entrada", async () => {
    const pending: Record<string, (value: string) => void> = {};
    const load = (key: string) => new Promise<string>((resolve) => void (pending[key] = resolve));
    const { result, rerender } = renderHook(({ key }) => useLoad(() => load(key), [key]), { initialProps: { key: "a" } });
    rerender({ key: "b" });
    await act(async () => pending.b!("B"));
    await act(async () => pending.a!("A")); // la de "a" llega tarde
    expect(result.current.state).toEqual({ status: "ready", data: "B" });
  });

  it("no actualiza nada si el componente ya se desmontó", async () => {
    let finish!: (value: string) => void;
    const { result, unmount } = renderHook(() => useLoad(() => new Promise<string>((resolve) => (finish = resolve)), []));
    unmount();
    await act(async () => finish("tarde"));
    expect(result.current.state).toEqual({ status: "loading" });
  });
});
```

`client/test/pages/auth.test.tsx` (dos esperas de la etapa 3 comprobaban `toHaveTextContent("/")`, que coincide por subcadena con `/login` y pasaba al instante; la comprobación siguiente competía con el inicio de sesión y fallaba con el equipo lento; ahora exigen exactamente `"/"`):

```diff
diff --git a/client/test/pages/auth.test.tsx b/client/test/pages/auth.test.tsx
index 8a659de..b99c8e2 100644
--- a/client/test/pages/auth.test.tsx
+++ b/client/test/pages/auth.test.tsx
@@ -89,7 +89,7 @@ describe("página de inicio de sesión", () => {
     await user.type(screen.getByLabelText("Contraseña"), "pikachu-123");
     await user.click(screen.getByRole("button", { name: "Entrar" }));
 
-    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
+    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
     expect(services.endpoints.auth.login).toHaveBeenCalledWith({ email: "ash@example.com", password: "pikachu-123" });
     expect(services.session.getState()).toMatchObject({ status: "authenticated", user: ASH });
     expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
@@ -183,7 +183,7 @@ describe("página de registro", () => {
     const { services, user } = renderRegister();
     await fillRegistration(user);
     await waitFor(() => expect(services.endpoints.auth.register).toHaveBeenCalledWith({ email: "ash@example.com", username: "ash", password: "pikachu-123" }));
-    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
+    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
     expect(services.session.getState().status).toBe("authenticated");
   });
```

`client/test/pages/routes.test.tsx`:

```diff
diff --git a/client/test/pages/routes.test.tsx b/client/test/pages/routes.test.tsx
index da2b0d3..1b77df3 100644
--- a/client/test/pages/routes.test.tsx
+++ b/client/test/pages/routes.test.tsx
@@ -17,6 +17,26 @@ function renderApp(route: string, prepare?: (services: ReturnType<typeof fakeSer
   return utils;
 }
 
+describe("rutas del perfil", () => {
+  it("sin sesión, /perfil y /jugador/:username llevan a /login", async () => {
+    for (const route of ["/perfil", "/jugador/misty"]) {
+      const { unmount } = renderApp(route, (s) => s.session.setState({ status: "anonymous", user: null }));
+      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
+      unmount();
+    }
+  });
+
+  it("con sesión, /perfil muestra el perfil propio", async () => {
+    renderApp("/perfil", (s) => signIn(s));
+    expect(await screen.findByRole("heading", { name: "Tu perfil" })).toBeInTheDocument();
+  });
+
+  it("con sesión, /jugador/:username muestra el perfil de esa persona", async () => {
+    renderApp("/jugador/misty", (s) => signIn(s));
+    expect(await screen.findByRole("heading", { name: "misty" })).toBeInTheDocument();
+  });
+});
+
 describe("guardas de ruta", () => {
   it("mientras se recupera la sesión muestra una pantalla de carga, no el formulario", () => {
     renderApp("/");
```

`client/test/components/header-theme.test.tsx`:

```diff
diff --git a/client/test/components/header-theme.test.tsx b/client/test/components/header-theme.test.tsx
index e3653d7..3a5b101 100644
--- a/client/test/components/header-theme.test.tsx
+++ b/client/test/components/header-theme.test.tsx
@@ -65,6 +65,18 @@ describe("Header", () => {
     expect(screen.getByRole("button", { name: "Cerrar sesión" }).className).toContain("text-header-fg");
   });
 
+  it("con sesión ofrece el enlace a tu perfil", () => {
+    const services = fakeServices();
+    signIn(services);
+    renderWithServices(<Header />, { services });
+    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", "/perfil");
+  });
+
+  it("sin sesión no hay enlace al perfil", () => {
+    renderWithServices(<Header />);
+    expect(screen.queryByRole("link", { name: "Mi perfil" })).not.toBeInTheDocument();
+  });
+
   it("sin sesión no muestra usuario ni botón, pero sí el selector de tema", () => {
     renderWithServices(<Header />);
     expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
```

`client/test/pages/room.test.tsx`:

```diff
diff --git a/client/test/pages/room.test.tsx b/client/test/pages/room.test.tsx
index 6afce5d..662f8a7 100644
--- a/client/test/pages/room.test.tsx
+++ b/client/test/pages/room.test.tsx
@@ -347,6 +347,12 @@ describe("resumen final", () => {
     expect(JSON.parse(probe.dataset.state!)).toEqual({ config: { typeMode: "chosen", lengthMode: "custom", roundsLimit: null, statsGoal: 1800 } });
   });
 
+  it("'Ver perfil de' lleva al perfil del rival", async () => {
+    const { user } = renderRoom(finished(1, 1));
+    await user.click(screen.getByRole("button", { name: "Ver perfil de misty" }));
+    expect(screen.getByTestId("location")).toHaveTextContent("/jugador/misty");
+  });
+
   it("'Volver al lobby' vuelve sin configuración previa", async () => {
     const { user } = renderRoom(finished(1, 1));
     await user.click(screen.getByRole("button", { name: "Volver al lobby" }));
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
npm test -w client -- test/pages/profile.test.tsx test/pages/profile-support.test.tsx test/pages/routes.test.tsx test/components/header-theme.test.tsx test/pages/room.test.tsx
```

Expected: FAIL — no existen los módulos de `src/pages/profile`, la ruta `/perfil`, el enlace "Mi perfil" ni el botón del resumen.

- [ ] **Step 3: Implementar**

`client/src/pages/profile/format.ts`:

```ts
const NO_DATA = "—";
const ONE_DECIMAL = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

/** "60 %"; sin datos, un guion. `rate` va de 0 a 1. */
export function formatPercent(rate: number | null): string {
  return rate === null ? NO_DATA : `${Math.round(rate * 100)} %`;
}

/** Siempre con un decimal y coma: "512,5". */
export function formatPower(power: number | null): string {
  return power === null ? NO_DATA : ONE_DECIMAL.format(power);
}

export function formatScore(score: number | null): string {
  return score === null ? NO_DATA : String(score);
}

export function winsLabel(wins: number): string {
  return wins === 1 ? "Ganado 1 vez" : `Ganado ${wins} veces`;
}

/** "30 sept 2026". */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}
```

`client/src/pages/profile/use-load.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export type LoadState<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

/**
 * Carga datos al montarse y cada vez que cambian `deps`; `reload` los pide de nuevo. Una respuesta que llega
 * después de haber cambiado los datos de entrada (o de desmontarse) se descarta.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): { state: LoadState<T>; reload(): void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (error: unknown) => current && setState({ status: "error", error }),
    );
    return () => {
      current = false;
    };
    // `load` es una función nueva en cada render; lo que decide cuándo recargar son `deps` y `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
```

`client/src/pages/profile/StatsView.tsx`:

```tsx
import type { Stats } from "@pokemon-minigames/shared";
import { Notice } from "../../components/Notice";
import { PokemonCard } from "../../components/PokemonCard";
import { formatPercent, formatPower, formatScore, winsLabel } from "./format";

const SECTION = "framed rounded-card bg-surface p-4";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-num text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Las estadísticas de una persona. `own` solo cambia la persona gramatical de los mensajes. */
export function StatsView({ stats, own }: { stats: Stats; own: boolean }) {
  if (stats.played === 0) {
    return <Notice>{own ? "Todavía no has jugado ninguna partida." : "Todavía no ha jugado ninguna partida."}</Notice>;
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumen" className={SECTION}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Partidas" value={String(stats.played)} />
          <Fact label="Ganadas" value={String(stats.wins)} />
          <Fact label="Empatadas" value={String(stats.draws)} />
          <Fact label="Perdidas" value={String(stats.losses)} />
          <Fact label="Victorias" value={formatPercent(stats.winRate)} />
          <Fact label="Racha actual" value={String(stats.currentStreak)} />
          <Fact label="Mejor racha" value={String(stats.bestStreak)} />
        </dl>
      </section>

      <section aria-label="Poder" className={SECTION}>
        <dl className="grid grid-cols-2 gap-4">
          <Fact label="Poder promedio" value={formatPower(stats.averagePower)} />
          <Fact label="Mejor partida" value={formatScore(stats.bestGameScore)} />
        </dl>
      </section>

      <section aria-label="Pokémon más ganados">
        <h2 className="mb-2 text-sm text-muted">Pokémon más ganados</h2>
        {stats.topPokemon.length === 0 ? (
          <p className="text-sm text-muted">
            {own ? "Todavía no has ganado ningún Pokémon." : "Todavía no ha ganado ningún Pokémon."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {stats.topPokemon.map(({ pokemon, wins }) => (
              <li key={pokemon.id}>
                <PokemonCard pokemon={pokemon} />
                <p className="mt-1 text-center text-sm text-muted">{winsLabel(wins)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

`client/src/pages/profile/HistoryList.tsx`:

```tsx
import type { GameResult, HistoryEntry } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { RESULT_LABELS, describeConfig, historyReason } from "../../i18n/es";
import { useServices } from "../../services";
import { formatDate, formatScore } from "./format";
import { useLoad } from "./use-load";

const RESULT_STYLE: Record<GameResult, string> = {
  won: "text-success",
  drawn: "text-muted",
  lost: "text-danger",
};

function HistoryRow({ game }: { game: HistoryEntry }) {
  return (
    // tabIndex -1: se puede enfocar por código (al cargar más partidas) sin entrar en el orden de tabulación.
    <li tabIndex={-1} className="framed rounded-card bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`font-medium ${RESULT_STYLE[game.result]}`}>{RESULT_LABELS[game.result]}</span>
        <span className="font-num tabular-nums">{`${formatScore(game.myScore)} – ${formatScore(game.opponentScore)}`}</span>
      </div>
      <p className="mt-1 text-sm">
        contra{" "}
        <Link to={`/jugador/${encodeURIComponent(game.opponent.username)}`} className="underline">
          {game.opponent.username}
        </Link>
      </p>
      <p className="text-sm text-muted">{historyReason(game.reason, game.result)}</p>
      <p className="text-sm text-muted">{describeConfig(game.config)}</p>
      <p className="text-xs text-muted">
        <time dateTime={game.endedAt}>{formatDate(game.endedAt)}</time>
      </p>
    </li>
  );
}

/** Tus partidas completadas, de la más reciente a la más antigua, de a páginas con "Cargar más". */
export function HistoryList() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const first = useLoad(() => endpoints.stats.history({ before: null }), [endpoints]);
  const [more, setMore] = useState<{ games: HistoryEntry[]; cursor: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLOListElement>(null);
  /** Posición de la primera partida de la página recién cargada, para llevarle el foco. */
  const focusIndex = useRef<number | null>(null);

  // El botón "Cargar más" desaparece con la última página y con él se iría el foco: pasa a la primera partida nueva.
  useEffect(() => {
    if (focusIndex.current === null) return;
    (list.current?.children[focusIndex.current] as HTMLElement | undefined)?.focus();
    focusIndex.current = null;
  }, [more]);

  async function loadMore(cursor: string, shown: number): Promise<void> {
    if (pending) return;
    setPending(true);
    setMoreFailed(false);
    try {
      const page = await endpoints.stats.history({ before: cursor });
      focusIndex.current = shown;
      setAnnouncement(
        page.games.length === 0
          ? "No hay más partidas."
          : page.games.length === 1
            ? "Se cargó 1 partida más."
            : `Se cargaron ${page.games.length} partidas más.`,
      );
      setMore((previous) => ({ games: [...(previous?.games ?? []), ...page.games], cursor: page.nextCursor }));
    } catch {
      setMoreFailed(true);
    } finally {
      setPending(false);
    }
  }

  let body;
  if (first.state.status === "loading") {
    body = (
      <p role="status" className="text-sm text-muted">
        Cargando historial…
      </p>
    );
  } else if (first.state.status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="danger">No se pudo cargar el historial.</Notice>
        <Button onClick={first.reload}>Reintentar el historial</Button>
      </div>
    );
  } else {
    const games = [...first.state.data.games, ...(more?.games ?? [])];
    const cursor = more ? more.cursor : first.state.data.nextCursor;
    body =
      games.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Cuando juegues, tus partidas aparecerán aquí.</p>
          <Button variant="primary" onClick={() => navigate("/")}>
            Crear una sala
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol ref={list} aria-label="Historial de partidas" className="flex flex-col gap-3">
            {games.map((game) => (
              <HistoryRow key={game.id} game={game} />
            ))}
          </ol>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {moreFailed ? <Notice tone="danger">No se pudo cargar la siguiente página.</Notice> : null}
          {cursor ? (
            <div className="text-center">
              <Button loading={pending} onClick={() => void loadMore(cursor, games.length)}>
                Cargar más
              </Button>
            </div>
          ) : null}
        </div>
      );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Historial</h2>
      {body}
    </section>
  );
}
```

`client/src/pages/profile/ProfilePage.tsx`:

```tsx
import { useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { errorMessage } from "../../i18n/es";
import { useServices } from "../../services";
import { HistoryList } from "./HistoryList";
import { StatsView } from "./StatsView";
import { useLoad } from "./use-load";

/**
 * `/perfil` es el propio (estadísticas e historial); `/jugador/:username` es el de otra persona: las mismas
 * estadísticas, sin historial.
 */
export function ProfilePage() {
  const { username } = useParams();
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const own = username === undefined;
  const { state, reload } = useLoad(
    () => (username === undefined ? endpoints.stats.mine() : endpoints.stats.forUser(username)),
    [endpoints, username],
  );

  if (state.status === "loading") {
    return (
      <p role="status" className="text-center text-muted">
        Cargando perfil…
      </p>
    );
  }

  if (state.status === "error") {
    const notFound = state.error instanceof ApiError && state.error.code === "USER_NOT_FOUND";
    const message = state.error instanceof ApiError ? state.error.message : errorMessage(undefined);
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <Notice tone="danger">{message}</Notice>
        {notFound ? (
          <Button variant="primary" onClick={() => navigate("/")}>
            Volver al lobby
          </Button>
        ) : (
          <Button variant="primary" onClick={reload}>
            Reintentar
          </Button>
        )}
      </section>
    );
  }

  const { username: name, stats } = state.data;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-medium">{own ? "Tu perfil" : name}</h1>
        {own ? <p className="text-muted">{name}</p> : null}
      </header>
      <StatsView stats={stats} own={own} />
      {own ? <HistoryList /> : null}
      <div>
        <Button onClick={() => navigate("/")}>Volver al lobby</Button>
      </div>
    </div>
  );
}
```

`client/src/routes.tsx`:

```diff
diff --git a/client/src/routes.tsx b/client/src/routes.tsx
index cec9015..d93ecc4 100644
--- a/client/src/routes.tsx
+++ b/client/src/routes.tsx
@@ -2,6 +2,7 @@ import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
 import { useSession } from "./services";
 import { LoginPage, RegisterPage } from "./pages/AuthPages";
 import { LobbyPage } from "./pages/Lobby";
+import { ProfilePage } from "./pages/profile/ProfilePage";
 import { RoomPage } from "./pages/room/RoomPage";
 
 function LoadingScreen() {
@@ -39,6 +40,8 @@ export function AppRoutes() {
       <Route element={<RequireAuth />}>
         <Route path="/" element={<LobbyPage />} />
         <Route path="/sala/:code" element={<RoomPage />} />
+        <Route path="/perfil" element={<ProfilePage />} />
+        <Route path="/jugador/:username" element={<ProfilePage />} />
       </Route>
       <Route path="*" element={<Navigate to="/" replace />} />
     </Routes>
```

`client/src/components/Header.tsx`:

```diff
diff --git a/client/src/components/Header.tsx b/client/src/components/Header.tsx
index e7a5fc9..4c21305 100644
--- a/client/src/components/Header.tsx
+++ b/client/src/components/Header.tsx
@@ -17,6 +17,9 @@ export function Header() {
           <ThemeSwitcher />
           {user ? (
             <>
+              <Link to="/perfil" className="text-sm underline-offset-2 hover:underline">
+                Mi perfil
+              </Link>
               <span className="text-sm">{user.username}</span>
               <Button variant="header" onClick={() => void session.getState().logout()}>
                 Cerrar sesión
```

`client/src/pages/room/SummaryView.tsx`:

```diff
diff --git a/client/src/pages/room/SummaryView.tsx b/client/src/pages/room/SummaryView.tsx
index f393c82..d5bcb17 100644
--- a/client/src/pages/room/SummaryView.tsx
+++ b/client/src/pages/room/SummaryView.tsx
@@ -57,6 +57,11 @@ export function SummaryView() {
         <Button variant="primary" onClick={() => navigate("/", { state: { config: view.config } })}>
           Jugar de nuevo
         </Button>
+        {opponent ? (
+          <Button onClick={() => navigate(`/jugador/${encodeURIComponent(opponent.username)}`)}>
+            Ver perfil de {opponent.username}
+          </Button>
+        ) : null}
         <Button onClick={() => navigate("/")}>Volver al lobby</Button>
       </div>
     </section>
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
npm test -w client
npm run typecheck
npm run build
```

Expected: PASS (todo el cliente: **392 pruebas** en 23 archivos), `tsc` sin errores y `vite build` correcto.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): perfil con estadísticas e historial, y perfil del rival" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificación en el navegador, documentación y cierre

**Files:**
- Create: `client/scripts/dev-games.mjs`
- Modify: `README.md`

- [ ] **Step 1: Agregar la herramienta para generar partidas**

`client/scripts/dev-games.mjs` (juega partidas reales de una ronda entre dos cuentas de prueba con el resultado que le pidas; sirve para llenar el historial sin jugar a mano):

```js
/**
 * Juega partidas reales de una ronda entre dos cuentas de prueba, con el resultado que le pidas, para
 * llenar el historial y las estadísticas sin jugar a mano.
 *
 *   node client/scripts/dev-games.mjs win win loss draw guest-forfeit cancel
 *
 * Cada argumento es una partida, en orden (la primera es la más antigua):
 *   win            gana la cuenta `anfitrion_x` (el rival responde mal)
 *   loss           gana `rival_y`
 *   draw           empate: nadie acierta
 *   guest-forfeit  `rival_y` abandona: gana `anfitrion_x` con el motivo "abandono"
 *   host-forfeit   `anfitrion_x` abandona: gana `rival_y`
 *   cancel         `anfitrion_x` crea una sala y la cancela (queda abandonada: no cuenta para las estadísticas)
 *
 * Se conecta directamente al servidor del juego (puerto 3000, o el de la variable PORT) y usa el catálogo de
 * `server/data/catalog.snapshot.json`. Crea las cuentas `anfitrion_x` y `rival_y` (contraseña `pikachu-123`) si no
 * existen. Deja datos en la base de datos de desarrollo: al terminar imprime el SQL para borrarlos.
 */
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const snapshot = JSON.parse(readFileSync(new URL("../../server/data/catalog.snapshot.json", import.meta.url), "utf8"));

async function api(path, body, token) {
  const response = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function account(name) {
  const credentials = { email: `${name}@example.com`, password: "pikachu-123" };
  let response = await api("/auth/register", { ...credentials, username: name });
  if (response.status !== 201) response = await api("/auth/login", credentials);
  return { name, token: response.body.accessToken };
}

const connect = (who, code) => {
  const socket = io(BASE, { auth: { token: who.token }, transports: ["websocket"] });
  socket.on("connect", () => socket.emit("join-room", { code }));
  return socket;
};

const validAnswerFor = (round) =>
  snapshot.pokemon.find((p) => p.types.length === 2 && p.types.includes(round.type1) && p.types.includes(round.type2))?.names.en;

async function play(host, guest, outcome) {
  const room = await api("/rooms", { typeMode: "random", lengthMode: "custom", roundsLimit: 1 }, host.token);
  const code = room.body.code;
  await api(`/rooms/${code}/join`, {}, guest.token);
  const hostSocket = connect(host, code);
  const guestSocket = connect(guest, code);
  const ended = new Promise((resolve) => hostSocket.on("game-ended", resolve));

  hostSocket.on("round-started", (round) => {
    const right = validAnswerFor(round);
    setTimeout(() => {
      if (outcome === "host-forfeit") return hostSocket.emit("leave-room");
      if (outcome === "guest-forfeit") return guestSocket.emit("leave-room");
      // Una respuesta que no existe cierra la ronda en el acto (no hay que esperar los 15 s).
      hostSocket.emit("submit-pokemon", { text: outcome === "win" ? right : "zzz" });
      guestSocket.emit("submit-pokemon", { text: outcome === "loss" ? right : "zzz" });
    }, 600);
  });

  const result = await ended;
  hostSocket.disconnect();
  guestSocket.disconnect();
  console.log(`${outcome}: ${result.reason}, ganador: asiento ${result.winnerSeat}, totales`, result.totals);
}

async function cancelRoom(host) {
  const room = await api("/rooms", { typeMode: "random", lengthMode: "fixed_rounds", roundsLimit: 3 }, host.token);
  const socket = io(BASE, { auth: { token: host.token }, transports: ["websocket"] });
  await new Promise((resolve) => {
    socket.on("connect", () => socket.emit("join-room", { code: room.body.code }));
    socket.on("room-state", () => {
      socket.emit("leave-room");
      setTimeout(resolve, 500);
    });
  });
  socket.disconnect();
  console.log(`cancel: sala ${room.body.code} cancelada`);
}

const OUTCOMES = ["win", "loss", "draw", "guest-forfeit", "host-forfeit", "cancel"];
const requested = process.argv.slice(2);
if (requested.length === 0 || requested.some((o) => !OUTCOMES.includes(o))) {
  console.error(`Uso: node client/scripts/dev-games.mjs ${OUTCOMES.join("|")} [...]`);
  process.exit(1);
}

const host = await account("anfitrion_x");
const guest = await account("rival_y");
for (const outcome of requested) {
  if (outcome === "cancel") await cancelRoom(host);
  else await play(host, guest, outcome);
}

console.log(`
Para limpiar la base de datos de desarrollo:
DELETE FROM games WHERE id IN (SELECT game_id FROM game_players WHERE user_id IN (SELECT id FROM users WHERE email IN ('anfitrion_x@example.com', 'rival_y@example.com')));
DELETE FROM users WHERE email IN ('anfitrion_x@example.com', 'rival_y@example.com');`);
process.exit(0);
```

- [ ] **Step 2: Aplicar la migración a la base de desarrollo y arrancar**

La migración es aditiva (columnas nulas, enums, índices y restricciones). Aplícala a tu base de desarrollo y arranca los dos servidores, cada uno en su terminal:

```bash
npm run db:deploy -w server
```

```bash
npm run dev
```

```bash
npm run dev:client
```

Expected: `db:deploy` aplica `20261003120000_game_end_reason_and_theme_preferences`; el servidor escucha en `http://localhost:3000` y Vite en `http://localhost:5173`.

- [ ] **Step 3: Generar partidas con resultado controlado y recorrer el perfil**

En una tercera terminal:

```bash
node client/scripts/dev-games.mjs win win loss draw guest-forfeit cancel
```

Expected: imprime `win: completed…`, `win: completed…`, `loss: completed…`, `draw: completed…`, `guest-forfeit: forfeit…` y `cancel: sala … cancelada`, y al final el SQL para borrar los datos.

Abre `http://localhost:5173`, inicia sesión con `anfitrion_x@example.com` y la contraseña `pikachu-123` (la cuenta la creó el script) y comprueba:

1. **Perfil propio** (`Mi perfil`): 5 partidas, 3 ganadas, 1 empatada, 1 perdida, 60 % de victorias, racha actual 1 y mejor racha 2; poder promedio con un decimal y coma, mejor partida y los Pokémon más ganados con "Ganado 1 vez". **La sala cancelada no cuenta.**
2. **Historial:** 5 partidas, la más reciente primero: "Ganaste … Tu rival abandonó", "Empate", "Perdiste", "Ganaste", "Ganaste", cada una con el rival enlazado, el marcador, la configuración ("Tipos aleatorios · hasta 1 ronda") y la fecha.
3. **Perfil ajeno:** pulsa el enlace de `rival_y`: 5 partidas, 1 ganada, 1 empatada, 3 perdidas, 20 %, **sin historial**. Prueba `http://localhost:5173/jugador/nadie`: "No encontramos a ese jugador." con el botón para volver al lobby.
4. **Resumen de una partida real:** crea una sala, une al bot (`node client/scripts/dev-bot.mjs CODIGO`) y, al terminar, comprueba que el resumen ofrece "Ver perfil de bot_…" y que lleva a su perfil.
5. **Tema en el perfil:** cambia a Pokédex y modo Oscuro; en la consola del navegador ejecuta `localStorage.clear()` y recarga: el tema vuelve a ser Pokédex oscuro (lo aplicó el servidor al recuperar la sesión).
6. **Contraste real:** en `/perfil` pega `client/scripts/contrast-audit.js` en la consola y ejecuta `await __contrastAuditAll()`.
7. **Móvil:** con la ventana a 375 px, `/perfil` no obliga a desplazarse en horizontal.

Expected: sin errores en la consola del navegador (salvo el 401 esperado de `/auth/refresh` cuando no hay sesión) y `__contrastAuditAll()` devuelve una lista **vacía** para los cuatro temas/modos. Al terminar, detén los dos servidores con Ctrl+C y ejecuta con `psql` (el mismo usuario de tu `server/.env`) el SQL que imprimió el script, además de borrar los usuarios y partidas del bot.

- [ ] **Step 4: Comprobar que las pruebas detectan fallos**

Rompe a propósito cada protección crítica, ejecuta la prueba indicada y restaura. Cada fila debe fallar; después de cada una, `git checkout -- <archivo>`.

| # | Archivo y cambio | Prueba que debe fallar |
|---|---|---|
| 1 | `server/src/stats/calculate.ts`: un empate ya no corta la racha actual: `result !== "won"` → `result === "lost"` | `calculate.test.ts` → «racha: un empate reciente también corta la racha» y «racha: un empate en medio parte la racha en dos» |
| 2 | `server/src/stats/calculate.ts`: ganar y perder se invierten: `winnerId === userId ? "won" : "lost"` al revés | `calculate.test.ts` → «compara el ganador con la persona: ganó, empató (sin ganador) o perdió» |
| 3 | `server/src/stats/stats.service.ts`: las partidas abandonadas cuentan para las estadísticas: `status: "completed"` → `{ in: ["completed", "abandoned"] }` | `stats.service.test.ts` → «las partidas abandonadas, en espera o en curso no cuentan para nada» |
| 4 | `server/src/stats/stats.service.ts`: el cursor repite partidas con la misma fecha de fin: `lt` → `lte` | `stats.service.test.ts` → «recorre todas las partidas por páginas, sin repetir ni saltarse ninguna» y «el orden de las páginas es el mismo que el de pedirlo todo de una vez» |
| 5 | `server/src/stats/stats.service.ts`: nunca hay página siguiente: `take: limit + 1` → `take: limit` | `stats.service.test.ts` → «recorre todas las partidas por páginas, sin repetir ni saltarse ninguna» y «el orden de las páginas es el mismo que el de pedirlo todo de una vez» |
| 6 | `server/src/stats/stats.routes.ts`: el perfil ajeno filtra el id interno: `res.json({ ...(await service.getStats(user.id)), userId: user.id })` | `stats.routes.test.ts` → «no revela nada privado: ni correo, ni identificadores, ni historial, ni códigos de sala» |
| 7 | `server/src/game/prisma-game-repository.ts`: `finish` deja de guardar el motivo: se quita `endReason: input.reason` | `prisma-game-repository.test.ts` → «finish guarda el resultado, el motivo, el ganador y los stats finales por asiento» y «finish de una partida abandonada no tiene ganador y solo actualiza los asientos que existen» |
| 8 | `server/src/game/prisma-game-repository.ts`: `abandonUnfinished` deja de guardar el motivo: se quita `endReason: "abandoned"` | `prisma-game-repository.test.ts` → «abandonUnfinished marca como abandonadas solo las partidas en espera o en curso» |
| 9 | `server/src/auth/auth.service.ts`: la preferencia de tema nunca llega al usuario: `preferences: …` → `preferences: null` | `preferences.test.ts` → «después llega en /auth/me, en el login y en el refresh» |
| 10 | `client/src/theme/theme-sync.ts`: aplicar la preferencia del servidor la vuelve a guardar (eco): se quita `if (known && same(state.preference, known)) return;` | `theme-sync.test.ts` → «la preferencia guardada en el servidor gana y se aplica, sin volver a guardarla» y «cada cambio de tema o de modo se guarda en el servidor» |
| 11 | `client/src/theme/theme-sync.ts`: se suben los valores por defecto como si fueran una elección: `else if (theme.getState().hasChoice)` → `else` | `theme-sync.test.ts` → «si ninguno de los dos tiene una elección, no se sube nada (los valores por defecto no son una elección)» y «el primer cambio de quien no tenía nada guardado también se guarda» |
| 12 | `client/src/pages/profile/use-load.ts`: una respuesta vieja pisa a la nueva: se quita `current &&` de la respuesta correcta | `profile-support.test.tsx` → «ignora la respuesta vieja que llega después de haber cambiado los datos de entrada» |
| 13 | `client/src/pages/profile/ProfilePage.tsx`: el perfil de otra persona también muestra el historial: `{own ? <HistoryList /> : null}` → `<HistoryList />` | `profile.test.tsx` → «no muestra el historial ni lo pide» |

Al terminar, `git status` no debe mostrar cambios.

- [ ] **Step 5: Actualizar el README**

Reemplazar `README.md` completo:

````markdown
# Pokémon Minigames

Juego web de 2 jugadores en tiempo real: en cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga ambos. Gana quien acumule más stats base. El diseño completo está en [`docs/superpowers/specs/`](docs/superpowers/specs/).

**Estado:** etapa 4 de 5 (servidor y cliente web completos y jugables, con estadísticas, historial y perfil). Falta el despliegue (etapa 5).

## Estructura

| Carpeta | Contenido |
|---|---|
| `server/` | API REST (Express) y tiempo real (Socket.io), motor de juego, Prisma y PostgreSQL |
| `client/` | Cliente web: React 19, Vite, Tailwind, Zustand y React Router |
| `shared/` | Tipos de eventos, payloads, códigos de error y `normalizeName`, compartidos por servidor y cliente |

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

4. Arranca el servidor del juego (`http://localhost:3000`) y, en otra terminal, el cliente (`http://localhost:5173`):

```bash
npm run dev
npm run dev:client
```

En desarrollo el servidor de Vite hace de proxy de `/auth`, `/rooms`, `/pokemon`, `/stats`, `/users` y `/socket.io` al servidor del juego, de modo que cliente y API comparten origen y la cookie de sesión funciona. Abre `http://localhost:5173`, crea una cuenta y una sala; para jugar necesitas un segundo jugador (otro navegador o una ventana privada, con otra cuenta).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor del juego en modo desarrollo con recarga |
| `npm run dev:client` | Cliente web con recarga en caliente |
| `npm run build` | Construye el cliente para producción (`client/dist`) |
| `npm test` | Todas las pruebas: servidor (usan la base `pokemon_minigames_test`) y cliente |
| `npm run typecheck` | Verifica los tipos con `tsc` en todos los paquetes |
| `npm run db:migrate -w server` | Crea/aplica migraciones en desarrollo |
| `npm run db:seed -w server` | Carga el catálogo desde `server/data/catalog.snapshot.json` |
| `npm run catalog:fetch -w server` | Vuelve a descargar el catálogo de PokéAPI al snapshot |
| `npm run smoke -w server` | Juega una partida real de una ronda contra el servidor en marcha |

Variable opcional del cliente: `VITE_API_URL` (URL base del servidor; vacía = el mismo origen).

## Estadísticas y perfil

En **Mi perfil** (`/perfil`) cada persona ve sus partidas jugadas, ganadas, empatadas y perdidas, el porcentaje de victorias, la racha actual y la mejor, sus 3 Pokémon más ganados, el poder promedio de los Pokémon que ganó, su mejor partida y el historial de sus partidas (con el motivo del fin: abandono, desconexión, etc.). Al terminar una partida se puede abrir el perfil del rival (`/jugador/:username`), que solo muestra estadísticas. Solo cuentan las partidas completadas; las abandonadas no. Todo se calcula al pedirlo a partir de las partidas guardadas (no hay tablas de estadísticas aparte).

## Temas y accesibilidad

Cada jugador elige entre dos temas, **Clásico** y **Pokédex** (retro, con números en monoespaciada y bordes rectos), y entre modo automático, claro u oscuro; la preferencia se guarda en el navegador y, con la sesión iniciada, también en tu perfil (al entrar en otro navegador se aplica la del perfil). Los colores de todos los temas y de los 18 tipos cumplen el contraste AA de WCAG (lo comprueban las pruebas). Para revisar lo que realmente se ve, pega [`client/scripts/contrast-audit.js`](client/scripts/contrast-audit.js) en la consola del navegador y ejecuta `__contrastAuditAll()`.

## API REST

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servidor |
| `POST /auth/register` | Crea la cuenta; devuelve `user` (con su `preferences` de tema, nulas al principio) y `accessToken` y fija la cookie de refresco |
| `POST /auth/login` | Inicia sesión |
| `POST /auth/refresh` | Renueva la sesión con la cookie (rota el refresh token) |
| `POST /auth/logout` | Cierra la sesión y borra la cookie |
| `GET /auth/me` | Usuario actual |
| `PUT /auth/me/preferences` | Guarda el tema: `{ theme: "clasico" \| "pokedex", themeMode: "auto" \| "claro" \| "oscuro" }` |
| `POST /rooms` | Crea una sala: `{ typeMode: "random" \| "chosen", lengthMode: "fixed_rounds" \| "custom", roundsLimit?, statsGoal? }`; devuelve `{ code }` |
| `GET /rooms/current` | La sala activa del usuario: `{ room: { code, phase } }` o `{ room: null }` |
| `GET /rooms/:code` | Información pública de la sala |
| `POST /rooms/:code/join` | Reserva el asiento 2 |
| `GET /pokemon/names` | Público. Lista de `{ id, es, en }` de todos los Pokémon, para el autocompletado |
| `GET /stats` | Tus estadísticas: `{ username, stats }` |
| `GET /stats/history?limit=&before=` | Tus partidas completadas, de la más reciente a la más antigua (`limit` de 1 a 50, por defecto 20); `before` es el `nextCursor` de la página anterior. Devuelve `{ games, nextCursor }` |
| `GET /users/:username/stats` | Las estadísticas de otra persona (nunca su correo ni su historial); `404 USER_NOT_FOUND` si no existe |

Las rutas de `/auth/me`, `/rooms`, `/stats` y `/users` exigen `Authorization: Bearer <accessToken>`. Los errores tienen la forma `{ "error": { "code", "message", "details"? } }`.

## Tiempo real (Socket.io)

Se conecta a `http://localhost:3000` con `auth: { token: <accessToken> }`. Un token inválido rechaza el handshake con `UNAUTHORIZED`. Los nombres y cargas exactos están tipados en [`shared/src/events.ts`](shared/src/events.ts). Los eventos que marcan un plazo (`game-starting`, `choose-types`, `round-started`, `opponent-disconnected` y `room-state`) traen `serverNow`, la hora del servidor, para que el cliente corrija el desfase de su reloj.

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
| `round-result` | Resultado de ambos jugadores al cerrar la ronda, con `nextRoundAt` |
| `game-ended` | Ganador, motivo, equipos y totales |
| `opponent-disconnected`, `opponent-reconnected` | Caída y vuelta del rival |
| `error` | `{ code, message }` |
````

- [ ] **Step 6: Verificación final completa**

```bash
npm test
npm run typecheck
npm run build
git status
```

Expected: **879 pruebas pasan** (487 de servidor y 392 de cliente); `tsc` sin errores en los tres paquetes; el build genera `client/dist`; `git status` solo muestra `README.md` y `client/scripts/dev-games.mjs` (nada de `.env`, `.env.test` ni `client/dist`).

- [ ] **Step 7: Commit y publicar la rama**

```bash
git add -A
git commit -m "docs: README tras la etapa 4; herramienta para generar partidas de prueba" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin etapa-4-estadisticas
```

Expected: rama `etapa-4-estadisticas` en `https://github.com/marcovinir/pokemon-minigames`. La integración a `main` la decide Marco.

---

## Self-Review

**Cobertura de la spec de la etapa 4:**

| Requisito | Tarea |
|---|---|
| `games.end_reason` con restricción coherente con `status`; `users.theme`/`theme_mode` en pareja; índices por `user_id` | 1 |
| Contrato compartido: error `USER_NOT_FOUND`, tipos de estadísticas e historial, tema, motivos de fin; textos del historial en español (exhaustivos) | 2 |
| El motor guarda el motivo del fin por cada camino; `abandonUnfinished` con motivo `abandoned`; guardado atómico | 3 |
| Definiciones: solo `completed`, ganada/empatada/perdida, % de victorias, racha actual y mejor, top 3 con desempate, poder promedio, mejor partida | 4 |
| Consultas por persona, historial por cursor con empates de fecha, búsqueda de usuario sin comodines | 5 |
| `GET /stats`, `GET /stats/history`, `GET /users/:username/stats`; sesión obligatoria; privacidad; 404 y 400 | 6 |
| `PUT /auth/me/preferences` y `preferences` en login, registro, refresh y `/auth/me` | 7 |
| Endpoints del cliente, `AuthUser.preferences`, proxy de desarrollo | 8 |
| `syncThemeWithSession` (el servidor gana, sin eco, los valores por defecto no se suben, fallo ignorado, cerrar sesión conserva) | 9 |
| Perfil propio y ajeno, historial con "Cargar más", enlace "Mi perfil", botón "Ver perfil de {rival}", estados de carga, error, 404 y vacío | 10 |
| Verificación real con partidas de resultado controlado, auditoría de contraste, móvil, mutaciones, README | 11 |

**Decisiones tomadas al escribir el plan (la spec ya las recoge o no las contradice):** `GameEndReason` pasa a salir de una lista en `shared/` para poder compararla con el enum de la base de datos; los textos del cliente (incluido el mensaje de `USER_NOT_FOUND`) van en la Task 2 porque `Record<ErrorCode, string>` obliga a traducir un código nuevo en la misma tarea que se agrega; `ThemeState.hasChoice` distingue "la persona eligió" de "valor por defecto" (sin él, un navegador nuevo subiría Clásico/Automático al servidor y pisaría la elección de otro dispositivo); y el perfil ajeno responde 404 también para nombres que nunca podrían existir.

**Lo que encontró la revisión final independiente de toda la rama (ya corregido en el código de este plan, cada punto con su prueba):** (1) un cursor fabricado a mano con una fecha que JavaScript acepta pero PostgreSQL no (un año negativo, de seis cifras o cero) hacía fallar la consulta y respondía 500 en vez de 400; ahora `decodeCursor` lo rechaza (`cursor.test.ts`, `stats.service.test.ts`); (2) al cargar la última página del historial el botón "Cargar más" desaparecía con el foco y quien usa teclado o lector de pantalla perdía su lugar; ahora el foco pasa a la primera partida nueva y se anuncia cuántas llegaron (`profile.test.tsx`). Durante la ejecución, además, una prueba de autenticación de la etapa 3 resultó intermitente con el equipo lento (la espera `toHaveTextContent("/")` coincidía con `/login`); se corrigió en la Task 10.

**Pendientes menores de esa revisión (no se corrigen en esta etapa):** `getStats` hace dos lecturas sin instantánea común (si una partida pasa a completada entre las dos, sus Pokémon cuentan en el top pero no en "Partidas"; transitorio; arreglo: una transacción `RepeatableRead`); cada cambio de tema lanza su propio PUT y dos cambios muy seguidos podrían llegar desordenados (arreglo: encadenar los guardados); `hasChoice` vale verdadero con un `localStorage` corrupto (se subiría el valor por defecto como si fuera una elección); y, si faltara el rival en una partida completada (teórico), el historial mostraría "?" con un enlace a un perfil inexistente.

**Hallazgos de la verificación (ya corregidos en el código de este plan):** (1) una partida personalizada de un solo máximo de rondas se mostraba como "hasta 1 rondas"; ahora concuerda en singular (`es.test.ts`); (2) la prueba de privacidad confundía el `example.com` de las URL de sprite con un correo; ahora busca `@example.com`; (3) Express tipa `req.params.username` como `string | string[]` cuando hay un middleware delante; se convierte con `String(...)`.

**Fuera de esta etapa:** ranking global, perfiles sin sesión, avatares, detalle de una partida concreta, filtros del historial, gráficos, editar usuario, correo o contraseña, borrar la cuenta y estadísticas por par de tipos; prueba E2E automatizada, despliegue, `COOKIE_SECURE` obligatorio, CSRF, límite de intentos de login y de peticiones (etapa 5). Pendientes menores de la etapa 3 que siguen abiertos: `room-state` sin `nextRoundAt`, y los otros siete listados en el plan de esa etapa.

**Consistencia de tipos:** los nombres se reutilizan tal como están en los bloques `Interfaces` de cada tarea. Todo el código se escribió y ejecutó antes de incluirlo: 487 pruebas de servidor y 392 de cliente en verde, `tsc` sin errores en los tres paquetes, `vite build` correcto, 13 mutaciones a propósito detectadas por las pruebas, y partidas reales en el navegador contra el catálogo de 1025 Pokémon.
