# Despliegue en Render y Neon

Esta guía deja el juego en internet sin gastar nada: **Render** aloja un único servicio (la API, los WebSockets y el cliente ya construido, todo en el mismo origen) y **Neon** aloja la base de datos PostgreSQL. No hace falta tarjeta en ninguno de los dos ni Docker.

## Qué esperar de la capa gratuita

- **El servicio se duerme** tras 15 minutos sin tráfico (ni peticiones ni mensajes de WebSocket). El primer acceso después tarda cerca de un minuto en despertar: el navegador se queda cargando hasta que el servicio responde, porque es el propio servicio el que entrega la página. La pantalla de carga del cliente avisa "El servidor se está despertando…" cuando la sesión tarda más de 5 s en recuperarse, por ejemplo si Neon también está despertando.
- **Las partidas viven en la memoria del servicio.** Si el servicio se reinicia (un despliegue nuevo, por ejemplo), las partidas que estaban en curso se marcan como abandonadas. Con el servicio dormido no puede haber partidas activas.
- **Neon apaga la base de datos** tras 5 minutos sin consultas y la despierta sola en la siguiente (la primera consulta tarda un poco). El servidor cierra las conexiones inactivas a los 10 segundos para no guardar ninguna que Neon vaya a cortar.
- Límites vigentes al escribir esto (2026-10): Render da 750 horas de servicio al mes y Neon 0,5 GB y 100 horas de cómputo. Compruébalos en [render.com/docs/free](https://render.com/docs/free) y [neon.com/pricing](https://neon.com/pricing) antes de depender de ellos.

## 1. Crear la base de datos en Neon

1. Entra en [neon.com](https://neon.com) y crea una cuenta.
2. Crea un proyecto. Elige la región **AWS US East 1 (N. Virginia)**, la misma del `render.yaml`, para que la base y el servicio estén cerca.
3. En el panel del proyecto abre **Connect** y copia la cadena de conexión **directa** (la que *no* tiene `-pooler` en el nombre del servidor). Se parece a:

   ```
   postgresql://usuario:clave@ep-algo-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   Es un secreto: no la subas a git ni la pegues en ningún sitio que no sea el panel de Render.

## 2. Crear el servicio en Render

1. Entra en [render.com](https://render.com), crea una cuenta y conéctala con tu cuenta de GitHub dándole acceso al repositorio `pokemon-minigames`.
2. **New → Blueprint** y elige el repositorio. Render lee [`render.yaml`](../render.yaml) y muestra el servicio `pokemon-minigames` (plan `free`).
3. Render te pide el valor de `DATABASE_URL`: pega la cadena de Neon del paso anterior. El resto de variables ya vienen en el archivo (`JWT_ACCESS_SECRET` lo genera Render).
4. **Apply**. Render construye y despliega.

## 3. El primer despliegue

La compilación hace, en este orden: instalar las dependencias (con las de desarrollo, que hacen falta para construir), construir el cliente y el servidor, aplicar las migraciones de la base de datos y sembrar el catálogo de 1025 Pokémon. Tarda unos minutos. Lo ves en la pestaña **Logs**; al final debe aparecer `Catálogo cargado: 1025 Pokémon` y `Servidor escuchando`.

Si falla, lo más común es una `DATABASE_URL` mal copiada (revisa que termine en `?sslmode=require` y no tenga espacios).

## 4. Comprobar que todo está bien

Render te da una dirección `https://pokemon-minigames-xxxx.onrender.com`. Desde tu máquina, con el repositorio clonado:

```bash
npm run smoke:deployed -- https://pokemon-minigames-xxxx.onrender.com
```

Espera a que el servicio despierte (hasta 90 segundos) y comprueba, sin crear cuentas ni escribir nada: que responde, que sirve el cliente y sus archivos con la caché correcta, que `/pokemon/names` trae los 1025 nombres, que las rutas protegidas piden sesión, que rechaza peticiones de orígenes ajenos y que no concede CORS. Todas las líneas deben decir `OK`.

Después abre la dirección en dos navegadores (o uno normal y otro privado), crea una cuenta en cada uno, crea una sala en uno y únete con el código desde el otro.

## 5. Verificar `TRUST_PROXY` (una sola vez, tras el primer despliegue)

Los límites de intentos dependen de que el servidor lea bien la IP de cada visitante, y eso depende de cuántos proxies hay entre internet y el servicio. El `render.yaml` parte de `2`: con `1` la prueba 1 dio seis `401` en el sitio en vivo (Render no documenta la cifra y hay informes de la comunidad de que hacen falta más, hasta 3: [hilo de la comunidad de Render](https://community.render.com/t/what-number-of-proxies-sit-in-front-of-an-express-app-deployed-on-render/35981)). Un valor equivocado es grave en los dos sentidos, y la prueba E2E y la de humo no pueden detectarlo porque en local no hay proxy: se comprueba a mano.

**Prueba 1: ¿el valor es demasiado alto?** (el servidor se fiaría de una IP inventada por el visitante y se podrían esquivar todos los límites). Seis intentos de login fallidos, cada uno con una IP falsa distinta en `X-Forwarded-For`:

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST https://TU-SERVICIO.onrender.com/auth/login -H "Content-Type: application/json" -H "X-Forwarded-For: 10.0.0.$i" -d email:prueba1@example.com; done; echo
```

Debe imprimir `401 401 401 401 401 429`: el servidor ignora la IP inventada y cuenta todos los intentos contra tu IP real. Si imprime seis `401`, el valor es demasiado alto (se fía de una IP inventada) o demasiado bajo (cada petición llega con la IP de un proxy de Render distinto, que cambia de una a otra): no se sabe cuál de los dos hasta probar el siguiente valor, como explica "Cómo cambiarlo".

**Prueba 2: ¿el valor es demasiado bajo?** (todo el mundo compartiría la IP de un proxy de Render y, por ejemplo, solo se podrían hacer 5 registros por hora entre todos). Desde tu computadora haz cinco intentos fallidos con otro correo:

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST https://TU-SERVICIO.onrender.com/auth/login -H "Content-Type: application/json" -d email:prueba2@example.com; done; echo
```

Imprime `401 401 401 401 401`. Ahora, desde otra red (el celular con datos móviles, sin wifi), abre `https://TU-SERVICIO.onrender.com/login` e intenta entrar con `prueba2@example.com` y cualquier contraseña: debe decir "Email o contraseña incorrectos." Si dice "Demasiados intentos", las dos redes comparten IP para el servidor: el valor es demasiado bajo, súbelo.

**Cómo cambiarlo:** en el panel de Render, *Environment* → `TRUST_PROXY` → guardar (Render redespliega y, de paso, reinicia los límites, que viven en memoria). Empieza en `2`; si no pasan las dos pruebas prueba `3` (y `1`), y repite las dos pruebas con cada valor. El correcto es el que pasa las dos: un valor demasiado alto falla la Prueba 1, y uno demasiado bajo falla la Prueba 2 y, si los proxies cambian de IP, también la 1. Anótalo en `render.yaml` y súbelo para que el repositorio diga lo mismo que el panel.

## Variables de entorno

| Variable | Valor en Render | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Activa las comprobaciones de producción: el servidor se niega a arrancar si algo de lo siguiente falta o es inseguro |
| `COOKIE_SECURE` | `true` | La cookie de sesión solo viaja por HTTPS |
| `COOKIE_SAME_SITE` | `lax` | Con un solo origen basta `lax` (`none` se rechaza en producción) |
| `TRUST_PROXY` | `2` de partida (verifícalo en la sección 5) | Cuántos proxies hay delante; si es menor que los reales el servidor ve la IP de un proxy de Render y los límites de intentos afectan a todo el mundo a la vez, y si es mayor cualquiera puede falsear su IP |
| `JWT_ACCESS_SECRET` | generado por Render | Firma de los tokens de acceso (mínimo 32 caracteres) |
| `DATABASE_URL` | la cadena de Neon | Conexión a la base de datos |
| `NODE_VERSION` | `24` | Versión de Node |
| `CORS_ORIGIN` | *(no se define)* | Con un solo origen no hay CORS; solo se usaría si se alojara el cliente en otro dominio |
| `EMAIL_VERIFICATION` | *(no se define)*: apagada | `on` activa las cuentas con código por correo (registro y «olvidé mi contraseña»); apagada, la aplicación funciona como siempre. Se cambia en el panel, no en `render.yaml` |
| `MAIL_PROVIDER` | `resend` al activarla | Quién envía los correos. Con la verificación activa en producción solo se admite `resend` (`console` escribiría los códigos en el registro y `memory` es solo de la prueba E2E) |
| `RESEND_API_KEY` | la clave de Resend (secreto) | Se añade a mano en el panel: `render.yaml` solo la declara, sin valor (Render ignora las variables `sync: false` al actualizar un Blueprint que ya existe). Con permiso solo de envío |
| `MAIL_FROM` | `Pokémon Minigames <no-responder@tu-dominio.me>` | El remitente, con un dominio verificado en Resend |

## Seguridad: qué hay y qué no

- Cookie `Secure` + `SameSite=Lax` y comprobación de origen en todas las peticiones que cambian algo (`POST`, `PUT`, `PATCH` y `DELETE`): una petición que el navegador dice venir de otro sitio se rechaza con 403.
- Límites de peticiones por IP, en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo y 30 por IP sumando todos los correos (un login correcto reinicia la cuenta), 5 registros por hora por IP y 300 peticiones por minuto a la API. Al pasarse responde 429 con `Retry-After`.
- Con las cuentas con código por correo activadas (apagadas de partida; ver más abajo), el código de 6 dígitos dura 10 minutos, vale una vez y se bloquea tras 5 intentos; se guarda solo como huella y nunca se escribe en el registro, y las respuestas no revelan si un correo tiene cuenta. Los envíos están limitados por correo y por IP (un código por minuto, 5 por hora por correo, 10 por hora por IP).
- No hay Helmet ni política de contenido (CSP). El servicio es una sola instancia: los límites y las salas viven en su memoria.

## Activar y desactivar las cuentas con código por correo

Vienen **apagadas**: el despliegue con este código no cambia nada visible. Para activarlas hace falta un dominio, una cuenta de Resend y cuatro variables en el panel de Render; todo el camino, paso a paso, está en [`docs/correo.md`](correo.md). Para volver atrás basta con poner `EMAIL_VERIFICATION=off` en el panel.

## Actualizar y solucionar problemas

- Cada `push` a `main` redespliega solo (`autoDeployTrigger: commit`). Las migraciones nuevas se aplican en cada compilación. Un redespliegue abandona las partidas en curso.
- **"Variables de entorno inválidas" al arrancar:** el mensaje dice cuál falta (`COOKIE_SECURE`, `COOKIE_SAME_SITE` o `TRUST_PROXY`; con el correo activado, `MAIL_PROVIDER`, `RESEND_API_KEY` o `MAIL_FROM`). Mientras el arranque falle, Render sigue sirviendo el despliegue anterior.
- **403 `FORBIDDEN` al iniciar sesión:** la petición llegó con un `Origin` distinto del propio servicio. Si usas un dominio propio asegúrate de entrar siempre por él.
- **429 `RATE_LIMITED`:** se superó un límite; la respuesta dice cuántos segundos esperar.
- **502 `EMAIL_SEND_FAILED` al registrarse o pedir un código:** Resend rechazó el envío (clave, dominio sin verificar, remitente de otro dominio o cuota diaria agotada). Ver [`docs/correo.md`](correo.md).
- **La primera visita tarda:** es el servicio despertando. La prueba de humo y el aviso en pantalla ya lo esperan.
