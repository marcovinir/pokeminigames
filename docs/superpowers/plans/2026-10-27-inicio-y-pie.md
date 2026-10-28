# Página de inicio para varios minijuegos, pie con páginas informativas y «Borrar mi cuenta» — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La página de inicio presenta la colección de minijuegos 1 vs 1; todas las pantallas llevan un pie con siete páginas informativas públicas; una cuenta se puede borrar (anonimizar) desde el perfil con su contraseña.

**Architecture:** El borrado es una función pura de base de datos (`anonymizeAccount`) que usan una ruta autenticada (`DELETE /auth/me`) y un script de moderación. El nombre de relleno de las cuentas borradas lo define `shared` para que servidor y cliente lo reconozcan. En el cliente, el dibujo de cada juego pasa a un componente compartido que usan el menú y la presentación; las páginas informativas son rutas públicas con textos en un archivo propio.

**Tech Stack:** Express 5 + Prisma 7.10.0 + zod 4 + vitest (servidor); React 19 + React Router 8 + Tailwind 4 + RTL (cliente); Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-10-27-inicio-y-pie-design.md`

## Global Constraints

- Español con tildes y eñes correctas en todo lo visible, en los comentarios y en los commits (prefijo convencional).
- TDD: cada prueba se ve fallar antes del código. Sin migraciones.
- Prefijo de las cuentas borradas: `borrada_`; nombre de relleno: `borrada_` + los 12 primeros caracteres hexadecimales del id sin guiones. En pantalla: «Cuenta borrada», sin enlace.
- Repositorio de comentarios: `https://github.com/marcovinir/pokeminigames-comentarios` (plantillas `idea.yml` y `error.yml`); perfil: `https://github.com/marcovinir`.
- Rutas públicas: `/acerca`, `/contacto`, `/faq`, `/privacidad`, `/terminos`, `/aviso-legal`, `/apoya`.
- Sin donaciones, precios ni nada comercial. Los textos legales describen solo lo que hace el juego (sección «Qué hace el juego con los datos» de la spec) y el Aviso legal dice que no son asesoría legal.
- No se cambia el estilo: tokens, componentes (`Card`, `Button`, `Notice`, `TextField`) y clases que ya existen.
- Contraste AA en los 4 temas/modos; sin desbordes a 375 px.

## Review Focus

1. **Borrar con la contraseña de otra cuenta o sin sesión de cuenta** (invitado, token caducado): no debe tocar nada y debe responder 401/403 como el resto de `/auth/me`.
2. **Fuerza bruta contra «Borrar mi cuenta»:** los intentos fallidos cuentan en el mismo límite por IP que el inicio de sesión (`loginFailuresByIp`).
3. **Una cuenta borrada sigue en el historial del rival:** sus partidas y estadísticas no cambian; el historial la muestra como «Cuenta borrada» sin enlace.
4. **Volver a entrar después de borrar:** la cookie de refresco ya no vale (tokens borrados) y la contraseña antigua da «Email o contraseña incorrectos»; el nombre original se puede registrar de nuevo.
5. **Las páginas informativas sin sesión, con sesión y como invitado:** se ven en los tres casos y el enlace de volver lleva al sitio correcto (`/` con sesión, `/login` sin ella).

---

### Task 1: Nombre de relleno de las cuentas borradas

**Files:**
- Create: `shared/src/deleted-account.ts`; Modify: `shared/src/index.ts` (exportarlo)
- Modify: `server/src/auth/auth.schemas.ts:8-11` (`usernameSchema`)
- Test: `server/test/shared/deleted-account.test.ts`, `server/test/auth/auth.schemas.test.ts`

**Interfaces:**
- Produces: `DELETED_USERNAME_PREFIX = "borrada_"`; `deletedUsernameFor(userId: string): string`; `isDeletedUsername(username: string): boolean` (sin distinguir mayúsculas).

- [ ] **Step 1: Pruebas que fallan.** `deletedUsernameFor("3f2a9c1e-…")` da `"borrada_3f2a9c1e…"` (12 hex, sin guiones) y cumple `/^[A-Za-z0-9_]{3,30}$/`; `isDeletedUsername("borrada_abc")` y `("Borrada_ABC")` son `true`, `("ash")` y `("borradaX")` `false`. En `auth.schemas.test.ts`: `registerSchema` y `guestSchema` rechazan `"borrada_ash"` y `"BORRADA_x1"` con el mensaje «Ese nombre está reservado».
- [ ] **Step 2:** `npm test -w server -- test/shared/deleted-account.test.ts test/auth/auth.schemas.test.ts` → FAIL (no existe el módulo; el esquema acepta el nombre).
- [ ] **Step 3:** Implementar el módulo y añadir a `usernameSchema` un `.refine((name) => !isDeletedUsername(name), "Ese nombre está reservado")`.
- [ ] **Step 4:** El mismo comando → PASS; `npm run typecheck`.
- [ ] **Step 5:** `git commit -m "feat: nombre reservado para las cuentas borradas"`

### Task 2: Anonimizar una cuenta y `DELETE /auth/me`

**Files:**
- Create: `server/src/auth/delete-account.ts`
- Modify: `server/src/auth/auth.service.ts` (método `deleteAccount`), `server/src/auth/auth.routes.ts` (ruta), `server/src/auth/auth.schemas.ts` (`deleteAccountSchema = z.object({ password: z.string().min(1) })`)
- Test: `server/test/auth/delete-account.test.ts`

**Interfaces:**
- Consumes: `deletedUsernameFor` (Task 1).
- Produces: `anonymizeAccount(prisma: PrismaClient, userId: string): Promise<boolean>` (`false` si no existe); `AuthService.deleteAccount(userId: string, password: string): Promise<void>` (lanza `INVALID_CREDENTIALS` 401 si la contraseña no coincide); `DELETE /auth/me` con `{ password }` → 204 y borra las cookies de refresco y de invitado.

`anonymizeAccount` en una transacción: `email = "borrada-<id>@invalid"`, `username = deletedUsernameFor(id)`, `passwordHash` = hash bcrypt de 32 bytes aleatorios (no corresponde a ninguna contraseña), `avatarPokemonId`, `theme` y `themeMode` a `null`, y `deleteMany` de sus `refreshToken`. Las partidas no se tocan.

La ruta usa `requireAccount` (los invitados reciben lo mismo que en `/me/avatar`) y el limitador `loginFailuresByIp` con el mismo patrón que `/login`: `check` (429 con `Retry-After`), `record` antes de verificar, `release` si el fallo no es `INVALID_CREDENTIALS`, `release` al acertar.

- [ ] **Step 1: Pruebas que fallan** (con `registerUser` y `seedGame` de `server/test/helpers`):
  - `con la contraseña correcta responde 204, borra la cookie y anonimiza`: la fila tiene el correo y el nombre de relleno, avatar y tema nulos; `refresh_tokens` del usuario vacío; `POST /auth/refresh` con la cookie antigua da 401; `POST /auth/login` con el correo y la contraseña antiguos da 401.
  - `el nombre original queda libre`: registrar de nuevo el mismo nombre y correo da 201.
  - `las partidas del rival no cambian`: con una partida sembrada entre A y B, tras borrar A, el historial y las estadísticas de B siguen con la partida y el rival aparece con el nombre `borrada_…`.
  - `con la contraseña incorrecta responde 401 y no toca nada`.
  - `sin sesión o como invitado no borra nada` (401/403 según `requireAccount`).
  - `los fallos cuentan en el límite por IP`: con un `loginFailuresByIp` de prueba de 2 intentos, el tercero da 429 con `Retry-After`.
- [ ] **Step 2:** `npm test -w server -- test/auth/delete-account.test.ts` → FAIL (404 en la ruta).
- [ ] **Step 3:** Implementar `anonymizeAccount`, `deleteAccount` (busca el usuario; si no existe, 401 `UNAUTHORIZED` como `me`; verifica con `this.hasher.verify`; llama a `anonymizeAccount`) y la ruta.
- [ ] **Step 4:** El mismo comando → PASS. **Mutación:** quitar la comprobación de la contraseña en `deleteAccount` → alguna prueba falla; restaurar. `npm test -w server` completo en verde.
- [ ] **Step 5:** `git commit -m "feat: borrar la cuenta (anonimizarla) con la contraseña"`

### Task 3: Script de moderación

**Files:**
- Create: `server/scripts/delete-account.ts`, `server/src/auth/find-account.ts`
- Modify: `server/package.json` (`"account:delete": "tsx scripts/delete-account.ts"`), `docs/despliegue.md` (sección nueva «Retirar una cuenta»)
- Test: `server/test/auth/find-account.test.ts`

**Interfaces:**
- Consumes: `anonymizeAccount` (Task 2).
- Produces: `findAccountByUsername(prisma, username: string): Promise<{ id: string; username: string; email: string; createdAt: Date } | null>` (sin distinguir mayúsculas).

- [ ] **Step 1: Pruebas que fallan:** encuentra «Ash» buscando «ash» (y «ASH»); devuelve `null` si no existe.
- [ ] **Step 2:** `npm test -w server -- test/auth/find-account.test.ts` → FAIL.
- [ ] **Step 3:** Implementar la búsqueda (`findFirst` con `mode: "insensitive"`) y el script: lee `DATABASE_URL` (como `seed.ts`), recibe el nombre por argumento, muestra nombre, correo enmascarado (`a***@dominio`) y fecha de alta, pide escribir el nombre para confirmar (`node:readline/promises`), llama a `anonymizeAccount` y lo informa. Sin argumento o sin coincidencia: mensaje y salida con código 1. Documentar en `docs/despliegue.md` cómo ejecutarlo contra Neon pegando la URL solo en la terminal (`DATABASE_URL=… npm run account:delete -w server -- <nombre>`), nunca en un archivo versionado.
- [ ] **Step 4:** El mismo comando → PASS; `npm run typecheck`.
- [ ] **Step 5:** `git commit -m "feat: script para retirar una cuenta (moderación)"`

### Task 4: «Borrar mi cuenta» en el perfil y «Cuenta borrada» en el historial

**Files:**
- Modify: `client/src/api/endpoints.ts` (`auth.deleteAccount(password: string): Promise<void>`: `DELETE /auth/me`, y tras responder 204 `api.setToken(null)`; si falla, el token se queda), `client/src/session/session-store.ts` (`deleteAccount(password)`: llama al endpoint y deja `status: "anonymous"`), `client/src/pages/profile/ProfilePage.tsx`, `client/src/pages/profile/HistoryList.tsx`, `client/src/pages/AuthPages.tsx` (aviso tras borrar), `client/src/i18n/es.ts` (`DELETE_ACCOUNT_TEXT`, `DELETED_ACCOUNT_NAME = "Cuenta borrada"`)
- Create: `client/src/pages/profile/DeleteAccount.tsx`
- Test: `client/test/pages/delete-account.test.tsx`, ampliar `client/test/pages/profile.test.tsx` (historial), y los dobles de `client/test/helpers/services` con el método nuevo.

**Interfaces:**
- Consumes: `DELETE /auth/me` (Task 2), `isDeletedUsername` (Task 1).
- Produces: `Endpoints.auth.deleteAccount`, `SessionState.deleteAccount`.

`DeleteAccount` va al final de `/perfil` (solo el propio): un título «Borrar mi cuenta», el aviso de la spec (no se puede deshacer; las partidas seguirán en el historial de tus rivales como «Cuenta borrada»), un botón que despliega un `TextField` de contraseña y «Borrar mi cuenta para siempre» (con la variante de `Button` que ya exista para acciones de peligro; si no hay, la normal: no se crean estilos nuevos). Error de la API → `Notice tone="danger"` con su mensaje y nada más cambia. Éxito → `navigate("/login", { replace: true, state: { notice: "Tu cuenta se borró." } })`; `LoginPage` muestra ese aviso con `Notice` sobre el formulario.

- [ ] **Step 1: Pruebas que fallan:** el perfil propio tiene la sección y el ajeno no; enviar sin contraseña no llama a la API; con contraseña llama a `deleteAccount("secreta")`, la sesión queda anónima y se llega a `/login` con «Tu cuenta se borró.»; un 401 muestra «Email o contraseña incorrectos» y la sesión sigue; en el historial un rival `borrada_…` aparece como «Cuenta borrada» sin enlace (y uno normal sigue con su enlace).
- [ ] **Step 2:** `npm test -w client -- test/pages/delete-account.test.tsx test/pages/profile.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** El mismo comando → PASS; `npm test -w client` y `npm run typecheck` en verde.
- [ ] **Step 5:** `git commit -m "feat: borrar la cuenta desde el perfil"`

### Task 5: La presentación de la página de inicio para varios minijuegos

**Files:**
- Create: `client/src/components/GameArt.tsx` (sale de `MainMenu.tsx`, con su `DobleTipoExample`)
- Modify: `client/src/pages/MainMenu.tsx` (usa el componente), `client/src/pages/AuthHero.tsx`, `client/src/i18n/es.ts` (`AUTH_HERO_TEXT`)
- Test: reescribir `client/test/pages/auth-hero.test.tsx`; `client/test/pages/menu-art.test.tsx` debe seguir en verde sin cambios

**Interfaces:**
- Produces: `GameArt({ game: GameKind; example: DobleTipoExample; className?: string })`.

La presentación: logo animado y el lema «Minijuegos Pokémon para jugar <span class="text-accent">1 vs 1</span> con tus amigos.»; debajo, en `md:` y más, una lista con nombre accesible «Minijuegos» con un elemento por `GAME_KINDS` (el `GameArt` en pequeño, el nombre de `GAME_CARDS`, su frase y la insignia «NUEVO» si `isNew`). A 375 px, solo el lema (como ahora). El ejemplo de «Doble tipo» se elige con `pickRandom` igual que en el menú; `AuthHero` acepta `random` para las pruebas.

- [ ] **Step 1: Pruebas que fallan** (para login y registro): el lema contiene «1 vs 1» y «amigos»; no aparecen «stats», «veneno» ni «15 segundos»; la lista «Minijuegos» tiene tantos elementos como `GAME_KINDS` y cada uno contiene el `name` y la `description` de `GAME_CARDS`; los dibujos son decorativos (`aria-hidden`); la lista está en un contenedor `hidden md:block` y el lema no; el formulario sigue igual (se conservan las pruebas actuales del formulario y de «sin avisos de estado»).
- [ ] **Step 2:** `npm test -w client -- test/pages/auth-hero.test.tsx` → FAIL.
- [ ] **Step 3:** Extraer `GameArt`, rehacer `AuthHero`.
- [ ] **Step 4:** El mismo comando y `test/pages/menu-art.test.tsx` → PASS; `npm test -w client`.
- [ ] **Step 5:** `git commit -m "feat: la página de inicio presenta todos los minijuegos 1 vs 1"`

### Task 6: Pie de página y páginas informativas

**Files:**
- Create: `client/src/links.ts` (`GITHUB_PROFILE_URL`, `FEEDBACK_REPO_URL`, `newIssueUrl(template: "idea" | "error"): string` → `${FEEDBACK_REPO_URL}/issues/new?template=${template}.yml`), `client/src/i18n/info.ts` (títulos y contenido de las 7 páginas), `client/src/pages/InfoPage.tsx`
- Modify: `client/src/components/Footer.tsx`, `client/src/routes.tsx`
- Test: `client/test/components/app-shell.test.tsx` (pie), `client/test/pages/info-pages.test.tsx`

**Interfaces:**
- Produces: `INFO_PAGES: Record<InfoSlug, { path: string; title: string; footerLabel: string; body: ReactNode }>` con los slugs `acerca`, `contacto`, `faq`, `privacidad`, `terminos`, `aviso-legal`, `apoya` (orden del pie: Acerca de, Contacto, FAQ, Privacidad, Términos, Aviso legal, Apoya el proyecto).

`InfoPage({ slug })` pinta el título como `h1`, el cuerpo en una `Card` y un enlace «Volver» a `/` con sesión (cuenta o invitado) o a `/login` sin ella. Las rutas van en `routes.tsx` **fuera** de `PublicOnly` y `RequireAuth`, antes del comodín. El cuerpo de cada página sigue la sección «Las páginas» de la spec; FAQ usa `GAME_CARDS` para «cómo se juega» y explica la sala con código; Privacidad y FAQ remiten a «Borrar mi cuenta» del perfil; Contacto y Apoya enlazan con `newIssueUrl` y avisan de que las issues son públicas; Privacidad y Términos llevan «Última actualización: 27 de octubre de 2026». Enlaces externos con `target="_blank" rel="noopener noreferrer"`.

El pie: `<nav aria-label="Información">` con los 7 enlaces (`Link`) en una fila que salta de línea (`flex flex-wrap justify-center gap-x-4 gap-y-2`), y debajo el aviso de fans actual sin cambios.

- [ ] **Step 1: Pruebas que fallan:** el pie tiene la navegación «Información» con los 7 enlaces en ese orden y con su `href`, y conserva los tres textos del aviso actual; cada ruta se ve sin sesión, con cuenta y como invitado (título `h1` correcto, sin redirigir); «Volver» lleva a `/login` sin sesión y a `/` con ella; Contacto tiene enlaces a `…/issues/new?template=idea.yml` y `…error.yml`; Acerca enlaza a `https://github.com/marcovinir`; ninguna página contiene «donar», «donación», «precio» ni «premium»; Privacidad menciona «cookie», «contraseña cifrada» y «Borrar mi cuenta»; Aviso legal menciona «no es asesoría legal» y «Nintendo».
- [ ] **Step 2:** `npm test -w client -- test/components/app-shell.test.tsx test/pages/info-pages.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** El mismo comando → PASS; `npm test -w client`, `npm run typecheck`.
- [ ] **Step 5:** `git commit -m "feat: pie con páginas de información, contacto y privacidad"`

### Task 7: Comprobación completa, capturas y documentación

**Files:**
- Modify: `README.md` (presentación y pie; mencionar las páginas, «Borrar mi cuenta» y el repositorio de comentarios), `docs/img/*.jpg` (regeneradas), `e2e/tests/layout.spec.ts` si mide la página de acceso
- Test: E2E existente; añadir a `e2e/tests/layout.spec.ts` que el pie no se sale a 360 px.

- [ ] **Step 1: Prueba de desborde:** en `layout.spec.ts`, a 360 px en `/login` y en `/privacidad`, ningún enlace del pie se sale de la pantalla (`boundingBox`). El pie ya existe (Task 6), así que pasará: para verla fallar, quitar `flex-wrap` del pie, correrla, ver el fallo y restaurar.
- [ ] **Step 2:** `npm test`, `npm run typecheck`, `npm run build` y `E2E_CHANNEL=msedge npm run e2e` (con el cargador) → todo en verde; luego `E2E_SCREENSHOTS=1 E2E_REAL_IMAGES=1` para las capturas.
- [ ] **Step 3:** A mano en el navegador, a 375 px y en escritorio, en los 4 temas: `/login`, `/registro`, una página informativa y el perfil con «Borrar mi cuenta» desplegado; `__contrastAuditAll()` vacío en cada una.
- [ ] **Step 4:** Actualizar README y la issue de hoja de ruta (#11) con lo hecho.
- [ ] **Step 5:** `git commit -m "docs: README y capturas con la página de inicio nueva y el pie"`
