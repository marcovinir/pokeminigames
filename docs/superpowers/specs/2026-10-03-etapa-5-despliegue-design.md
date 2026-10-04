# Pokémon Minigames — Etapa 5: Despliegue, seguridad y pruebas E2E

Fecha: 2026-10-03 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 a 4. Donde esta spec es más específica, manda esta. Las etapas 1 a 4 (juego completo, estadísticas y perfil) ya están en `main`.

## 1. Objetivo

Dejar el juego desplegado y jugable por otras personas con un costo de operación nulo, endurecido para estar expuesto a internet y con una prueba automática que juegue una partida completa en navegadores reales. Cierra los pendientes heredados de la etapa 1: `COOKIE_SECURE` obligatorio en producción, protección CSRF de refresh y logout, y límite de intentos de login. No incluye dominio propio, Helmet ni CSP, ni nada que exija más de una instancia.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Hosting | Render (servicio web gratuito, sin tarjeta) + Neon (PostgreSQL gratuito). Condiciones verificadas el 2026-10-03: Render ofrece 750 h/mes y duerme el servicio tras 15 min sin tráfico (HTTP o mensajes de WebSocket), con un arranque de cerca de un minuto; su PostgreSQL gratuito caduca a los 30 días, por eso no se usa. Neon da 0,5 GB y 100 h de cómputo al mes y se apaga tras 5 min de inactividad. |
| Arquitectura | Un solo servicio y un solo origen: Express sirve la API, Socket.io y el cliente construido. Sin Docker. |
| Cookie y CSRF | Con un solo origen la cookie es `Secure` + `SameSite=Lax` y no hay CORS. Se agrega la comprobación de origen como defensa extra. |
| Seguridad | Límite de intentos de login y de registro, comprobación de origen y límite general de peticiones por IP. Sin Helmet ni CSP. |
| E2E y CI | Playwright con dos navegadores reales contra el servidor de producción, en local y en GitHub Actions; una prueba de humo sin escritura contra la URL desplegada. |
| Quién hace qué | Crear las cuentas de Render y Neon y conectar el repositorio lo hace Marco. Todo lo demás (configuración, guía, scripts, pruebas) queda en el repositorio y se verifica en local en modo producción. |

## 3. Un solo servicio

### 3.1 Servir el cliente

El servidor sirve `client/dist` cuando existe (en desarrollo y en las pruebas del servidor no existe y todo sigue igual). La ruta del directorio se resuelve relativa al propio archivo (`../../client/dist`), que da lo mismo ejecutado desde `server/src` y desde el servidor empaquetado en `server/dist`.

- Los archivos con hash en el nombre (`/assets/*`) llevan `Cache-Control: public, max-age=31536000, immutable`; `index.html` y el resto, `no-cache`.
- Los `GET` y `HEAD` de cualquier ruta que no sea de la API devuelven `index.html` (`/login`, `/perfil`, `/sala/ABC123`…), para que React Router la resuelva.
- Antes del servicio de archivos van `/health`, `/auth`, `/rooms`, `/pokemon`, `/stats`, `/users` y `/socket.io`. Una ruta desconocida bajo esos prefijos, y cualquier método que no sea `GET` o `HEAD` en una ruta desconocida, sigue dando el 404 en JSON de siempre.

### 3.2 Empaquetado y arranque

El servidor se empaqueta con esbuild en `server/dist/index.js` (con el paquete `shared/` y el cliente de Prisma generado dentro; las dependencias de `node_modules` quedan fuera) y se arranca con `node`. Arranca más rápido y gasta menos memoria que `tsx`, algo que importa en un servicio que se duerme y despierta. Si el empaquetado de Prisma diera problemas al implementarlo, el plan B es `tsx` y se anota como decisión.

`render.yaml` describe el servicio: entorno Node 24 (`NODE_VERSION`), plan `free`, comprobación de salud `/health`, despliegue automático y variables de entorno. `JWT_ACCESS_SECRET` lo genera Render; `DATABASE_URL` se completa a mano con la cadena de conexión de Neon (no se versiona). La compilación instala las dependencias (con las de desarrollo, que hacen falta para construir), construye el cliente y el servidor, genera el cliente de Prisma, aplica las migraciones y siembra el catálogo (la siembra ya es idempotente). El arranque ejecuta el archivo empaquetado.

### 3.3 La base de datos que se apaga sola

Neon cierra las conexiones inactivas y la primera consulta tras despertarla tarda un poco. Hoy el pool de `pg` no tiene manejo de errores y un error en una conexión inactiva puede tirar el proceso. Se crea el pool explícitamente (`max` pequeño, cierre de conexiones inactivas, un tiempo de espera de conexión holgado para el arranque en frío) con un manejador de errores que lo registra y no cae, y se pasa a Prisma. Se prueba cortando conexiones a propósito (`pg_terminate_backend`): el servidor sobrevive y la siguiente consulta funciona.

### 3.4 Cierre ordenado y arranque lento

- Al recibir `SIGTERM` (Render lo envía al dormir o redesplegar) el servidor deja de aceptar conexiones, cierra Socket.io y la base de datos, y sale; si algo no cierra en 10 s, sale igualmente. Lo que quedó a medias se marca como abandonado al próximo arranque, como ya ocurre.
- El cliente, si la pantalla de carga de la sesión espera más de 5 s, muestra "El servidor se está despertando, puede tardar hasta un minuto…" y lo quita en cuanto responde.

## 4. Seguridad en producción

### 4.1 Configuración exigida

Con `NODE_ENV=production` el servidor se niega a arrancar si: `COOKIE_SECURE` no es `true`; `COOKIE_SAME_SITE` es `none`; o falta `TRUST_PROXY` (entero ≥ 0; en Render, `1`; es la cantidad de proxies delante, para leer bien la IP del cliente y el protocolo). `CORS_ORIGIN` pasa a ser opcional: sin él no se instala CORS.

### 4.2 Comprobación de origen

Las peticiones `POST`, `PUT` y `DELETE` se rechazan con `403` y el código nuevo `FORBIDDEN` si traen un `Origin` que no es el del propio servidor (ni `CORS_ORIGIN`, si está definido), o, sin `Origin`, un `Sec-Fetch-Site` de `cross-site` o `same-site`. Sin esas cabeceras (curl, las pruebas, el cliente en desarrollo por el proxy de Vite) pasan; los `GET` no se tocan. El "propio origen" se calcula con el protocolo y el `Host` que ve el servidor (con `TRUST_PROXY`). Se suma a `SameSite=Lax`, no lo reemplaza. El handshake de Socket.io se autentica con el token en la carga, no con cookie, así que no hereda este riesgo.

### 4.3 Límites de peticiones

En memoria (hay una sola instancia) y sin dependencias nuevas: un limitador con claves (ventana deslizante, reloj inyectable) como el que ya existe para los sockets. Responden `429` con `RATE_LIMITED`, `details.retryAfterSeconds` y la cabecera `Retry-After`. Constantes con nombre:

- **Login:** 5 intentos **fallidos** en 15 minutos por combinación de IP y correo; un login correcto reinicia la cuenta. No es un bloqueo por cuenta, para que nadie pueda dejar fuera a otra persona usando su correo.
- **Registro:** 5 por hora por IP.
- **General:** 300 peticiones por minuto por IP en toda la API.
- Las entradas vencidas se limpian solas, para que un abuso no llene la memoria.

El cliente traduce el `429` ("Demasiados intentos. Inténtalo de nuevo en N min.") y el formulario muestra cuánto falta cuando el servidor lo informa.

## 5. Pruebas E2E y CI

### 5.1 Playwright

Workspace nuevo `e2e/`. La preparación global crea la base `pokemon_minigames_e2e` (desde la conexión del `.env` del servidor o de `E2E_ADMIN_DATABASE_URL`), la migra y la siembra con el catálogo real de 1025 Pokémon, y la borra al terminar: no toca la de desarrollo ni la de pruebas. Arranca el servidor **de producción** (cliente construido y servidor empaquetado, `NODE_ENV=production`, cookie segura sobre `localhost`, `TRUST_PROXY=1`) y cada prueba usa un `X-Forwarded-For` propio para no compartir los límites por IP. Dos contextos de navegador independientes hacen de las dos personas.

Escenarios:

1. Registro de los dos, sala, unión por código, una partida completa hasta el resumen, y el perfil de cada uno con la partida contada.
2. Recargar la página en plena ronda y recuperar la partida (equipo, totales, cronómetro).
3. El tema guardado en el perfil se aplica en un navegador nuevo tras iniciar sesión.
4. Contraseñas erróneas hasta el `429`, con el mensaje en español.

El par de tipos se lee de la propia pantalla y la respuesta válida sale del snapshot del catálogo; un jugador acierta y el otro responde algo inexistente para cerrar la ronda al instante.

### 5.2 Prueba de humo desplegada

`npm run smoke:deployed -- URL` no crea cuentas ni escribe nada. Espera a que el servicio despierte (hasta 90 s) y comprueba: `/health`; que `/` y `/perfil` devuelven el cliente; que `/pokemon/names` trae 1025 nombres; que las rutas protegidas piden sesión; que una ruta de API desconocida da 404 en JSON; y las cabeceras de caché de `index.html` y de los archivos con hash.

### 5.3 GitHub Actions

`.github/workflows/ci.yml` en cada push y PR, con un PostgreSQL que levanta el propio flujo: instala dependencias, genera Prisma, corre las pruebas de servidor y cliente, el tipado y el build, y luego la E2E con Chromium. Si la E2E falla sube el informe y las capturas como artefacto.

## 6. Guía de despliegue

`docs/despliegue.md`, en español y paso a paso: crear el proyecto en Neon y copiar la cadena de conexión; crear el servicio en Render desde `render.yaml`; completar `DATABASE_URL`; esperar el primer despliegue (migraciones y siembra incluidas); ejecutar la prueba de humo; y qué esperar de la capa gratuita (el servicio duerme, el primer acceso tarda, las partidas viven en memoria). El README resume el estado y enlaza a la guía.

## 7. Pruebas y verificación

- **Servidor:** servir el cliente (fallback de React sin tapar la API, 404 en JSON, cabeceras de caché, sin cliente construido todo igual); validación de la configuración de producción (cada combinación inválida y las válidas); los limitadores con reloj falso (la ventana que se reinicia, claves por IP, limpieza, `Retry-After`, el login correcto que reinicia, que otra IP u otro correo no se vean afectados); la comprobación de origen (cada método y cada combinación de cabeceras); resistencia a una conexión cortada por la base de datos; cierre con `SIGTERM`; siembra repetida sin duplicar.
- **Cliente:** el aviso de arranque lento (aparece a los 5 s y se va al responder) y el `429` traducido con su espera.
- **Mutaciones a propósito:** quitar la comprobación de origen, que el limitador cuente los aciertos, que no limpie memoria, que el fallback tape una ruta de API, que producción acepte `SameSite=none`; las pruebas deben detectarlas.
- **Verificación real:** construir y arrancar todo en modo producción en local, correr la E2E con navegadores reales, cortar conexiones de la base de datos, y repetir el recorrido manual con el bot. Tras desplegar Marco, la prueba de humo sobre la URL de Render.
- Se sigue TDD.

## 8. Riesgos

- **Empaquetado de Prisma con esbuild:** se resuelve probándolo en una copia limpia antes de escribir el plan; plan B, `tsx`.
- **Cookie `Secure` sobre `http://localhost`:** Chromium la admite en `localhost`; la E2E lo comprueba. Si no, la E2E corre con una opción explícita de prueba, nunca en producción.
- **Cadena de conexión de Neon:** el modo SSL y si conviene la dirección directa o la del pooler se confirman al implementar y se documentan en la guía.
- **El flujo de GitHub Actions y el despliegue en Render no se pueden ejecutar desde aquí:** se verifican en sintaxis y en local, y se comprueba el primer resultado real al subir la rama.

## 9. Fuera de alcance

- Dominio propio, Helmet y CSP, Redis o varias instancias, Docker, recuperación de contraseña y verificación de correo, monitoreo y alertas, y copias de seguridad más allá de las de Neon.
- Mantener el servicio despierto (un ping periódico gastaría la cuota gratuita de Actions): se acepta el arranque lento y se avisa en pantalla.
- Los pendientes menores de las etapas 3 y 4 que siguen abiertos.
