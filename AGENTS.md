# AGENTS.md — guía para quien trabaje en este repositorio

Para agentes de programación y para personas. Si Marco te dice **«haz las issues»**, empieza por la sección 1.

## Qué es esto

**PokeMiniGames** (antes «Pokémon Minigames»): juego web de dos personas en tiempo real. En cada ronda se enfrenta un par de tipos Pokémon y cada jugador tiene 15 s para nombrar un Pokémon que tenga los dos; gana quien acumule más stats base. Es un proyecto de portafolio de Marco (estudiante), desplegado gratis en Render + Neon: https://pokemon-minigames.onrender.com . Repositorio privado `marcovinir/pokemon-minigames`. Proyecto de fans sin fines de lucro: los nombres, sprites y arte de Pokémon son de Nintendo, Game Freak y The Pokémon Company (las imágenes se cargan de PokeAPI); no se monetiza ni se usa su arte como identidad de marca.

## 1. Cómo trabajar las issues

1. Lee la issue **«Hoja de ruta y convenciones del proyecto»** (la que lleva la etiqueta `hoja-de-ruta`): lista las issues en orden con sus dependencias y las decisiones de Marco ya tomadas. `gh issue list --state open` muestra el resto.
2. Toma **la primera issue abierta que no tenga dependencias abiertas**. Cada issue es autosuficiente: contexto, qué cambiar (con rutas), decisiones tomadas y abiertas, criterios de aceptación.
3. Etiquetas: **`requiere-diseno`** → no se implementa hasta que haya una spec aprobada por Marco (se diseña con él primero, sección 5); **`manual`** → la hace Marco, un agente no puede; `mantenimiento`, `deuda-tecnica`, `enhancement`, `documentation` → trabajo normal.
4. Una rama por issue (`feat/…`, `fix/…`, `docs/…`), commits pequeños, y **el cambio entra en `main` por un Pull Request** (con la plantilla de `.github/PULL_REQUEST_TEMPLATE.md` y la CI en verde; fusionarlo sigue necesitando el permiso de Marco). Al terminar: marca los criterios de aceptación, comenta el resultado en la issue y ciérrala (`Closes #N` en el PR o el commit de fusión). Tacha su casilla en la issue de hoja de ruta.
5. Las ideas nuevas de Marco se vuelven issues nuevas (con la misma estructura), no tareas sueltas en una conversación.

## 2. Mapa del repositorio

npm workspaces; Node 24 o superior.

| Carpeta | Qué hay |
|---|---|
| `shared/` | Tipos de eventos y payloads de Socket.io, códigos de error, `normalizeName`: lo comparten servidor y cliente (`shared/src/events.ts` es el contrato) |
| `server/` | Express 5 + Socket.io + Prisma 7.10.0 (PostgreSQL 18). El **motor de juego** es un reductor puro (`server/src/game/engine/`: `reduce(state, event, now, { catalog, rng })` devuelve estado y efectos); `room.ts`, `room-manager.ts` y `realtime/` lo ejecutan. Catálogo de 1025 Pokémon en `server/data/catalog.snapshot.json` |
| `client/` | React 19 + Vite 8 + Tailwind 4 + Zustand 5 + React Router 8. `src/game/apply-event.ts` es el reductor puro de los eventos del servidor; `src/i18n/es.ts` los textos |
| `e2e/` | Playwright: dos navegadores reales juegan contra la construcción de producción |
| `docs/` | `despliegue.md` (Render + Neon), `superpowers/specs/` (diseños aprobados) y `superpowers/plans/` (planes de las etapas hechas), `guia-tecnica.md` (todo el detalle: puesta en marcha, comandos, funciones, API REST y eventos), `img/` (capturas del README) |

El README (en inglés, con `README.es.md` en español) es la portada para quien visita el repositorio; la puesta en marcha completa, la tabla de comandos, la API REST y los eventos de Socket.io están en `docs/guia-tecnica.md`. Si cambias una función, actualiza la guía y, si se nota desde fuera, los dos README.

## 3. Idioma y estilo

- **Español con las tildes y eñes correctas** en pantallas, documentación, mensajes de error y de commit. Los identificadores de código van en inglés.
- Sigue el estilo del código de alrededor (comentarios en español que explican el porqué, nombres claros, sin abreviar).
- Mensajes de commit con prefijo convencional (`feat`, `fix`, `test`, `docs`, `chore`) y en español.

## 4. Comandos

```bash
npm install
npm test                 # servidor (usa la base pokemon_minigames_test) y cliente
npm run typecheck        # tsc en los cuatro paquetes
npm run build            # client/dist y server/dist/index.js
npm run e2e              # construye y corre Playwright con su propia base pokemon_minigames_e2e
npm run dev              # servidor con recarga (http://localhost:3000)
npm run dev:client       # cliente con recarga (http://localhost:5173)
npm run db:migrate -w server     # aplica migraciones en desarrollo
npm run db:generate -w server    # regenera el cliente de Prisma (tras tocar schema.prisma; no se versiona)
npm run smoke:deployed -- https://pokemon-minigames.onrender.com   # comprueba el sitio en vivo sin escribir nada
```

- **Requisitos:** PostgreSQL 18 local sin Docker (en Windows es el servicio `postgresql-x64-18`: si las pruebas dicen `ECONNREFUSED`, está detenido y se arranca como administrador con `Start-Service postgresql-x64-18`), y los archivos `server/.env` y `server/.env.test` (se copian de `server/.env.example` y `server/.env.test.example`; **nunca se versionan**). La puesta en marcha completa está en `docs/guia-tecnica.md`.
- **E2E:** necesita un navegador: `npx playwright install chromium` desde `e2e/`, o `E2E_CHANNEL=msedge` (o `chrome`) para usar el ya instalado. Las imágenes de PokeAPI se sirven **falsas** durante la E2E (para no depender de la red); `E2E_REAL_IMAGES=1` usa las reales y `E2E_SCREENSHOTS=1` regenera las capturas del README.
- Si el equipo va justo de CPU, las pruebas pueden agotar el tiempo por defecto: `--testTimeout=30000 --maxWorkers=2`. **La E2E tiene ventanas de 6 s y 15 s del propio juego: córrela con el equipo enchufado** (con el portátil en batería el procesador va muy lento y fallan por tiempo).
- Los comandos largos conviene lanzarlos fuera de la sesión (en segundo plano, con el registro a un archivo) y no esperarlos en primer plano.

## 5. Flujo para trabajo grande

Nuevo subsistema, cambio de contratos o algo que reestructura: **brainstorming con Marco → spec → plan → ejecución → revisión final → fusión.**

1. **Spec** en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`: intención, objetivos, no objetivos y antiobjetivos, decisiones de Marco tal como las tomó, lo que se deja al implementador. **La aprueba Marco antes de seguir.**
2. **Plan** en `docs/superpowers/plans/` (tareas pequeñas, cada una con la prueba que falla primero, el código y el comando con el resultado esperado). Lo revisa Marco.
3. **Ejecución con TDD:** escribe la prueba, **mírala fallar**, escribe el código, mírala pasar. Las protecciones críticas se comprueban rompiéndolas a propósito (mutaciones) y viendo que alguna prueba falla.
4. **Revisión final independiente** de toda la rama (alguien o algo con contexto limpio), con foco en lo que las pruebas no cubren. Se arreglan con TDD los hallazgos importantes y lo menor se anota en la issue de deuda técnica.
5. **Fusión:** `main` solo se sube con permiso de Marco (sección 6).

Para un cambio pequeño y acotado basta TDD y una rama corta.

## 6. Reglas duras

- **No subas `main` sin permiso expreso de Marco.** Render redespliega solo al subir `main`, y las **migraciones se aplican solas en la base de producción (Neon)** durante la compilación: una migración que borra datos o columnas **no se puede deshacer** y volver al código anterior dejaría de funcionar. Pide permiso diciendo qué migración lleva. Subir ramas de trabajo sí está bien.
- **Migraciones solo aditivas por defecto, y nunca edites una ya aplicada**: se corrige con una migración nueva.
- **Prisma fijo en 7.10.0** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`): el `latest` de `prisma` en npm es un RC de la 8. No ejecutes `npm audit fix --force`.
- **Nunca secretos en el repositorio ni en el chat.** Las claves las pega Marco en el panel de Render. No actives servicios de pago.
- TDD siempre: no se da por hecho nada sin ver la prueba fallar y luego pasar.
- No borres ni sobrescribas lo que no hayas mirado antes (carpetas, ramas, bases de datos). Tus bases de prueba temporales van con un nombre propio y se borran al terminar.

## 7. Qué significa «terminado»

Con evidencia, no por sensación:

- `npm test`, `npm run typecheck`, `npm run build` y `npm run e2e` en verde **en un clon limpio** de la rama.
- Si tocaste la interfaz: míralo en un navegador real a 375 px y en escritorio, con las imágenes reales, y pasa la auditoría de contraste (`client/scripts/contrast-audit.js`: pégalo en la consola y ejecuta `__contrastAuditAll()`; debe dar una lista vacía en los 4 temas/modos).
- Si tocaste algo crítico: las mutaciones correspondientes se detectan.
- La documentación (los dos README, `docs/guia-tecnica.md`) y la issue están al día.
- Tras desplegar: `npm run smoke:deployed -- https://pokemon-minigames.onrender.com` da «Todo bien».

## 8. Trampas conocidas

- **Lo que se sale por la izquierda no lo ve `scrollWidth`:** mide la caja (`boundingBox`) de cada pieza en un navegador real, a varios anchos y con el peor texto posible (nombre de usuario de 30 letras, respuesta de 100 letras seguidas).
- Las pruebas de jsdom no ven el apilamiento (`z-index`), los tamaños ni cómo se ven las imágenes reales: mira las pantallas de verdad. Así se descubrió que los iconos de tipo de PokeAPI son píldoras de 200 × 40 (hay que recortarlos) y que un panel tapaba la lista de sugerencias en el móvil.
- El **access token vive solo en memoria**; la sesión se recupera con la cookie de refresco `HttpOnly` (`/auth/refresh`).
- Los **límites de peticiones viven en memoria y por IP**, y en producción dependen de `TRUST_PROXY` (ver `docs/despliegue.md`, sección 5).
- Las pruebas de concurrencia con la base de datos necesitan calentar el pool (`warmUpPool`); las suites del servidor no corren en paralelo (`fileParallelism: false`).
- Las pruebas que miran los eventos de tiempo real usan `Harness` (motor con reloj y temporizadores simulados) y `sequenceRng` (azar fijo): un sorteo nuevo cambia la secuencia de las pruebas existentes.
- La carpeta temporal de una sesión puede perderse (días o reinicios): guarda pronto el trabajo valioso en una rama del repositorio y súbela.
- En Windows hay Git Bash y PowerShell: en Bash los *heredocs* largos con comillas, barras invertidas o comillas inversas fallan; para scripts largos escribe un archivo `.cjs` y ejecútalo con node.
