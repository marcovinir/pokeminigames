# Despliegue en Render y Neon

Esta guía deja el juego en internet sin gastar nada: **Render** aloja un único servicio (la API, los WebSockets y el cliente ya construido, todo en el mismo origen) y **Neon** aloja la base de datos PostgreSQL. No hace falta tarjeta en ninguno de los dos ni Docker.

## Qué esperar de la capa gratuita

- **El servicio se duerme** tras 15 minutos sin tráfico (ni peticiones ni mensajes de WebSocket). El primer acceso después tarda cerca de un minuto en despertar; el cliente muestra "El servidor se está despertando…" mientras tanto.
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

## Variables de entorno

| Variable | Valor en Render | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Activa las comprobaciones de producción: el servidor se niega a arrancar si algo de lo siguiente falta o es inseguro |
| `COOKIE_SECURE` | `true` | La cookie de sesión solo viaja por HTTPS |
| `COOKIE_SAME_SITE` | `lax` | Con un solo origen basta `lax` (`none` se rechaza en producción) |
| `TRUST_PROXY` | `1` | Cuántos proxies hay delante; sin él el servidor vería la IP del proxy de Render y los límites de intentos afectarían a todo el mundo a la vez |
| `JWT_ACCESS_SECRET` | generado por Render | Firma de los tokens de acceso (mínimo 32 caracteres) |
| `DATABASE_URL` | la cadena de Neon | Conexión a la base de datos |
| `NODE_VERSION` | `24` | Versión de Node |
| `CORS_ORIGIN` | *(no se define)* | Con un solo origen no hay CORS; solo se usaría si se alojara el cliente en otro dominio |

## Seguridad: qué hay y qué no

- Cookie `Secure` + `SameSite=Lax` y comprobación de origen en todas las peticiones que cambian algo (`POST`, `PUT`, `DELETE`): una petición que el navegador dice venir de otro sitio se rechaza con 403.
- Límites de peticiones por IP, en memoria: 5 intentos de login fallidos cada 15 minutos por IP y correo (un login correcto reinicia la cuenta), 5 registros por hora por IP y 300 peticiones por minuto a la API. Al pasarse responde 429 con `Retry-After`.
- No hay Helmet ni política de contenido (CSP), recuperación de contraseña por correo ni verificación de correo. El servicio es una sola instancia: los límites y las salas viven en su memoria.

## Actualizar y solucionar problemas

- Cada `push` a `main` redespliega solo (`autoDeployTrigger: commit`). Las migraciones nuevas se aplican en cada compilación. Un redespliegue abandona las partidas en curso.
- **"Variables de entorno inválidas" al arrancar:** el mensaje dice cuál falta (`COOKIE_SECURE`, `COOKIE_SAME_SITE` o `TRUST_PROXY`).
- **403 `FORBIDDEN` al iniciar sesión:** la petición llegó con un `Origin` distinto del propio servicio. Si usas un dominio propio asegúrate de entrar siempre por él.
- **429 `RATE_LIMITED`:** se superó un límite; la respuesta dice cuántos segundos esperar.
- **La primera visita tarda:** es el servicio despertando. La prueba de humo y el aviso en pantalla ya lo esperan.
