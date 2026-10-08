# Pokémon Minigames — Etapa 7: Cuentas con código por correo (verificar la cuenta y recuperar la contraseña)

Fecha: 2026-10-07 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 a 6; donde esta spec es más específica, manda esta. Las etapas 1 a 6 están en `main` y funcionan en https://pokemon-minigames.onrender.com. Esta etapa toca `server/`, `shared/` y `client/`; no cambia el juego.

## 1. Objetivo

Hoy faltan dos cosas de cualquier sistema de cuentas: que quien crea una cuenta demuestre que controla el correo con el que se registra, y que quien olvidó su contraseña pueda recuperarla. Las dos se resuelven con un **código de 6 dígitos que llega por correo**. Todo va detrás de un interruptor, apagado por defecto, para poder desplegar el código antes de que el proveedor de correo esté listo y sin cambiar nada visible hasta activarlo.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Canal | Correo electrónico (SMS y WhatsApp cuestan por mensaje). Proveedor: **Resend** (API HTTP) con **dominio propio**: Render gratis bloquea el correo por SMTP desde septiembre de 2025, y Resend solo envía a cualquier persona si hay un dominio verificado (gratis: 3.000 al mes y 100 al día). |
| Verificación | Obligatoria para jugar cuando está activa: no hay sesión hasta verificar. |
| Cuentas existentes | Se dan por verificadas, con la fecha de la migración. |
| Códigos | 6 dígitos, 10 minutos, 5 intentos, un solo uso; uno vigente por cuenta y propósito (verificar o restablecer). Uno nuevo anula el anterior. |
| Recuperar la contraseña | Dos pasos, respuesta que no delata si el correo existe, revoca los tokens de renovación y no abre sesión. |
| Interruptor | `EMAIL_VERIFICATION=on|off`, por defecto `off`: apagado, todo se comporta como hoy. |
| Orden de salida | 1.º `TRUST_PROXY`; 2.º el código con el interruptor apagado; 3.º Marco prepara dominio y Resend; 4.º se activa; marcha atrás apagándolo. |
| Servicio de correo | Una interfaz `Mailer` con tres versiones: Resend, consola (desarrollo) y memoria (pruebas y E2E). |

## 3. Experiencia

Pantallas nuevas, todas públicas (como el login) y con el aspecto del rediseño: `/verificar`, `/olvide` y `/restablecer`. El correo viaja entre ellas en el estado del router (nunca en la URL); si se pierde (recargar la página), la pantalla pide el correo además del resto.

- **Registro.** Con la verificación activa, el formulario crea la cuenta *pendiente*, envía el código y lleva a `/verificar`. **Verifica tu correo**: «Te enviamos un código de 6 dígitos a {correo}. Escríbelo aquí.», un campo «Código» (teclado numérico, `autocomplete="one-time-code"`, solo dígitos, espaciado como el código de sala), el botón «Verificar», «Reenviar código» (deshabilitado con «espera N s» tras cada envío) y «Usar otro correo» (vuelve al registro). Con el código correcto la cuenta queda verificada, se abre la sesión y se va al lobby (o a donde se intentaba ir).
- **Iniciar sesión sin haber verificado.** Con la contraseña correcta, lleva a `/verificar` con el aviso «Tu correo aún no está verificado. Te enviamos un código.».
- **¿Olvidaste tu contraseña?** Un enlace en el login, visible solo con la verificación activa. `/olvide` («Recupera tu contraseña»): el correo y «Enviar código». Siempre sigue a `/restablecer` con el aviso «Si existe una cuenta con ese correo, te enviamos un código.». `/restablecer` («Nueva contraseña»): código y contraseña nueva (mínimo 8, como en el registro) y «Cambiar contraseña». Al terminar vuelve al login con «Contraseña cambiada. Inicia sesión con la nueva.». Recibir el código ya demuestra el correo, así que una cuenta pendiente queda también verificada.
- **Errores en español**, en el mismo aviso rojo de los otros formularios: «Código incorrecto o vencido. Revisa tu correo o pide uno nuevo.», «No pudimos enviar el correo. Inténtalo de nuevo en un momento.» y el de «demasiados intentos» de siempre con los segundos de espera.
- **Registrarse con un correo que quedó sin verificar** reemplaza esa cuenta pendiente (un error al teclear, o alguien que usó tu correo, no te deja fuera).
- **Con el interruptor apagado** el registro y el login son exactamente los de hoy, no aparece el enlace «olvidé» y las rutas nuevas no existen.
- **Los correos** son en español, sin imágenes ni enlaces: solo el código. Verificar: «Tu código de verificación es 123456. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.». Restablecer: «Tu código para cambiar la contraseña es 123456. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.». No llevan el nombre de usuario ni ningún dato personal además del código.

## 4. Servidor

### 4.1 Base de datos (migración aditiva)

- `users.email_verified_at` (`timestamptz`, nulo): la migración lo rellena con la fecha actual en todas las cuentas que ya existen.
- Tipo `EmailCodePurpose` (`verify_email`, `reset_password`) y tabla `email_codes`: `user_id` (con `ON DELETE CASCADE`), `purpose`, `code_hash`, `expires_at`, `attempts` (`smallint`, por defecto 0, con `CHECK (attempts BETWEEN 0 AND 5)`) y `created_at` (cuándo se envió), con **clave primaria `(user_id, purpose)`**: una fila por cuenta y propósito. Pedir un código nuevo reemplaza la fila.
- Una cuenta está **pendiente** si `email_verified_at` es nulo **y** no tiene partidas ni sesiones. Una cuenta sin verificar con historial (creada con el interruptor apagado) es *heredada*: debe verificar en su próximo inicio de sesión una vez activado, pero nunca se reemplaza ni se borra.

### 4.2 Los códigos

- Se generan con `crypto.randomInt(0, 1_000_000)` rellenado a 6 dígitos.
- En la base solo se guarda un hash con clave: `HMAC-SHA256(clave, "{userId}:{propósito}:{código}")`, con `clave = HMAC-SHA256(JWT_ACCESS_SECRET, "pokemon-minigames:email-code:v1")`. Quien copiara la base de datos no podría probar el millón de combinaciones por su cuenta. La comparación es de tiempo constante (`timingSafeEqual`).
- Constantes: `CODE_TTL = 10 min`, `MAX_CODE_ATTEMPTS = 5`, `PENDING_ACCOUNT_TTL = 24 h`. El reloj es el inyectable del servicio (también en el SQL, como parámetro, no con `now()` de la base), para probar el vencimiento.

### 4.3 Comprobar un código

El formato (`^\d{6}$`) y la contraseña nueva se validan **antes** de tocar los intentos. Luego:

1. **Reservar el intento** con una sola instrucción, antes de comparar (lo mismo que hace el login con sus límites): `UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = $1 AND purpose = $2 AND attempts < 5 AND expires_at > $3 RETURNING code_hash`. Sin fila (no existe, venció o ya se gastaron los 5) → `INVALID_CODE`. Así 50 intentos en paralelo no consiguen más de 5, y el quinto, si acierta, vale.
2. **Comparar** el hash. Si no coincide → `INVALID_CODE` (el intento ya está contado).
3. **Consumir** en una sola transacción: `DELETE FROM email_codes WHERE user_id = $1 AND purpose = $2 AND code_hash = $4` (debe borrar exactamente una fila; si no, otra petición lo consumió antes → `INVALID_CODE`) y el efecto: marcar `email_verified_at` o, al restablecer, guardar el hash de la contraseña nueva, revocar todos los tokens de renovación de la cuenta y marcar el correo como verificado.

### 4.4 Rutas (bajo `/auth`)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /auth/options` | — | `200 { emailVerification: boolean }` (siempre existe) |
| `POST /auth/register` | correo, usuario, contraseña | Apagado: `201 { user, accessToken }` y cookie, como hoy. Activo: `202 { verification: "required", email }`, sin sesión |
| `POST /auth/verify-email` | correo, código | `200 { user, accessToken }` y cookie; `400 INVALID_CODE` |
| `POST /auth/verification/resend` | correo | `202 { ok: true }`, siempre |
| `POST /auth/password/forgot` | correo | `202 { ok: true }`, siempre |
| `POST /auth/password/reset` | correo, código, contraseña | `204`; `400 INVALID_CODE`; `400 VALIDATION_ERROR` |
| `POST /auth/login` | (igual) | Activo y cuenta sin verificar, con la contraseña correcta: `403 EMAIL_NOT_VERIFIED` y se envía un código (en segundo plano y si los límites lo permiten) |
| `POST /auth/refresh` | cookie | Activo y cuenta sin verificar: `403 EMAIL_NOT_VERIFIED` |

Las cuatro rutas de códigos solo se montan con el interruptor activo; apagado, responden el 404 de siempre. Errores nuevos en `shared`: `EMAIL_NOT_VERIFIED` (403), `INVALID_CODE` (400) y `EMAIL_SEND_FAILED` (502).

### 4.5 Registro y cuentas pendientes (interruptor activo)

En una transacción: (1) se borran las cuentas pendientes de más de 24 h que choquen por correo o usuario, sin temporizadores; (2) si el correo es de una cuenta verificada o heredada → `EMAIL_TAKEN`; si es de una pendiente → se **reemplaza** (usuario, contraseña y fecha nuevos; un usuario ocupado por *otra* cuenta → `USERNAME_TAKEN`); si no existe → se crea sin verificar. Después se genera el código y se envía **esperando** al proveedor: si falla, `EMAIL_SEND_FAILED`, la cuenta queda pendiente y se devuelve el hueco de los límites para poder reintentar enseguida. Con el interruptor apagado, el registro no cambia (la cuenta nace sin verificar y, al activarlo, será heredada).

### 4.6 Respuestas que no delatan

- `forgot` y `resend` validan solo la forma del correo, reservan sus límites (que dependen del correo y la IP, nunca de si existe) y **responden 202 de inmediato**; la búsqueda y el envío ocurren después, en segundo plano. `forgot` envía si la cuenta existe; `resend`, si existe y no está verificada. Los fallos de envío en segundo plano solo se registran en el servidor, sin dirección ni código.
- `verify-email` y `reset` hacen el mismo trabajo con un correo que no existe (la reserva no encuentra fila) y devuelven el mismo `INVALID_CODE`; sus fallos cuentan en los límites exista o no el correo.
- `login` solo responde `EMAIL_NOT_VERIFIED` tras acertar la contraseña. El registro ya revelaba `EMAIL_TAKEN` y se mantiene.

### 4.7 Límites (solo producción, con la maquinaria de la etapa 5)

| Límite | Clave | Valor |
|---|---|---|
| Espera entre envíos | correo | 1 cada 60 s |
| Envíos | correo / IP | 5 por hora / 10 por hora |
| Fallos de código | correo / IP | 5 cada 10 min / 20 por hora |

Envían: registro, login sin verificar, `resend` y `forgot`. Comprueban: `verify-email` y `reset`. El hueco se reserva antes del trabajo y se devuelve si falla por algo nuestro. Como viven en memoria (una instancia, se reinician al desplegar), el tope duro es el contador `attempts` de la base de datos.

### 4.8 Servicio de correo

`interface Mailer { send(mail: { to: string; subject: string; text: string; html: string }): Promise<void> }`.

- **`ResendMailer`**: `POST https://api.resend.com/emails` con `Authorization: Bearer`, `{ from, to: [to], subject, text, html }`, `fetch` global (sin SDK) y `AbortSignal.timeout(8000)`. Una respuesta que no sea 2xx lanza un error propio con el estado; al cliente no le llega nada del proveedor, y el registro del servidor solo lleva el estado y el nombre del error, nunca la dirección ni el código.
- **`ConsoleMailer`** (desarrollo): imprime «[correo simulado] para {correo}: {texto}» en la consola del servidor, para probar el flujo completo en el PC sin Resend. No se permite en producción: escribiría los códigos en el registro.
- **`MemoryMailer`** (pruebas y E2E): guarda los mensajes en una lista.
- Las plantillas (texto y HTML mínimo con estilos en línea, sin imágenes ni enlaces) viven en un módulo propio y se prueban sin red.

### 4.9 Configuración

- `EMAIL_VERIFICATION` (`on|off`, por defecto `off`), `MAIL_PROVIDER` (`resend|console|memory`; por defecto `console` en desarrollo y `memory` en las pruebas), `RESEND_API_KEY`, `MAIL_FROM` (`Nombre <dirección>` o solo la dirección) y `ALLOW_MEMORY_MAIL` (`true|false`, por defecto `false`).
- Reglas de producción, como las que ya existen (el servidor **se niega a arrancar**, con el problema por escrito): con `EMAIL_VERIFICATION=on`, `MAIL_PROVIDER` debe ser `resend` (con `RESEND_API_KEY` y `MAIL_FROM`) o `memory` únicamente con `ALLOW_MEMORY_MAIL=true` (solo lo usa el servidor de la E2E); `console` está prohibido. Con el interruptor apagado no se pide nada de correo.

### 4.10 Buzón de pruebas

`GET /auth/test-outbox?to=<correo>` → `200 { messages: [{ to, subject, text }] }`, **solo existe** con `MAIL_PROVIDER=memory` y, en producción, con `ALLOW_MEMORY_MAIL=true`; en cualquier otro caso no se monta. Es lo que usa la E2E para leer los códigos.

## 5. Cliente

- **API:** `auth.options()`, `auth.verifyEmail`, `auth.resendCode`, `auth.forgotPassword` y `auth.resetPassword`; `register` devuelve una sesión o `{ verification: "required", email }`. El almacén de sesión inicia la sesión al verificar y expone si la verificación está activa (cargado una vez desde `auth.options()`).
- **Pantallas:** `VerifyEmailPage`, `ForgotPasswordPage` y `ResetPasswordPage`, con los componentes del rediseño (`Card`, `TextField`, `Button`, `Notice`, `rise`). El campo de código quita todo lo que no sea un dígito (también al pegar), lleva el foco al llegar y el reenvío tiene una cuenta atrás de 60 s que no se anuncia cada segundo a los lectores de pantalla.
- **Textos:** los mensajes de los errores nuevos en `i18n/es.ts`.
- **Rutas:** las tres nuevas dentro de las públicas (con sesión llevan al lobby).

## 6. Producción y salida

1. **`TRUST_PROXY`** (antes de la rama, cambio mínimo en `render.yaml` probando `2`; si no sirve, `3`) y las dos pruebas de `docs/despliegue.md` §5. Subir `main` para esto lo autoriza Marco en ese momento.
2. **Código con `EMAIL_VERIFICATION=off`**: la migración se aplica al desplegar (cada compilación ya aplica las migraciones nuevas); no cambia nada visible.
3. **Marco prepara el correo**: dominio, cuenta gratuita de Resend con el dominio verificado (registros DNS) y una clave de API con permiso solo de envío. La clave solo la pega él en las variables de entorno de Render: nunca en el chat ni en el repositorio. `render.yaml` declara `RESEND_API_KEY` y `MAIL_FROM` con `sync: false`.
4. **Activar**: en Render, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_PROVIDER=resend` y `EMAIL_VERIFICATION=on`. Prueba real con su correo: registrarse, recibir el código, entrar y recuperar la contraseña.
5. **Marcha atrás**: `EMAIL_VERIFICATION=off`.
6. **Documentación**: `docs/correo.md` (guía paso a paso para Marco: dominio, Resend, DNS, variables, prueba real y marcha atrás), la tabla de variables y el apartado de activar y desactivar en `docs/despliegue.md`, y el README.

## 7. Pruebas y verificación

- **Servidor (TDD, con `MemoryMailer`, sin correo real ni red):** 20 intentos fallidos simultáneos consumen como máximo 5; un código sirve una sola vez aunque dos peticiones acierten a la vez; vencimiento con reloj inyectado; reemplazo del código al reenviar y espera de 60 s; cuentas pendientes (reemplazo, limpieza a las 24 h, heredadas intactas); login sin verificar y `refresh`; restablecer revoca los tokens y verifica el correo; un código de verificar no sirve para restablecer ni al revés; respuestas idénticas con correos que existen y que no; los límites; la configuración (producción sin clave o remitente no arranca; `console` y `memory` prohibidos); el buzón de pruebas solo con `memory`; plantillas; `ResendMailer` con un `fetch` falso (cuerpo, cabeceras, tiempo máximo, errores).
- **Cliente:** las tres pantallas (código numérico y pegado, cuenta atrás del reenvío, mensajes, estado perdido al recargar), el login con aviso de éxito y el enlace «olvidé» solo con la verificación activa; con ella apagada todo sigue como hoy.
- **E2E en navegador real**, con el servidor en `EMAIL_VERIFICATION=on`, `MAIL_PROVIDER=memory` y `ALLOW_MEMORY_MAIL=true`: el ayudante `register` lee el código del buzón de pruebas, así que todas las E2E existentes pasan por la verificación; nuevas: registro con código, «olvidé mi contraseña» completo, bloqueo tras 5 fallos y el login sin verificar.
- **Mutaciones:** romper a propósito el contador de intentos, el uso único, la revocación de sesiones, la igualdad de respuestas, el tiempo de vencimiento y la regla de producción de `console`, y comprobar que alguna prueba lo detecta.
- **Revisión final independiente (opus), con foco en seguridad:** adivinar códigos y carreras; enumeración de correos, también por tiempo; correo masivo contra un tercero y gasto de la cuota; códigos en registros o errores; un código de un propósito usado en el otro; sesiones tras restablecer; el interruptor apagado no cambia nada.
- **Prueba real:** la que hace Marco con su correo tras activar.

## 8. Riesgos

- **Cuota de 100 correos al día:** un bot podría agotarla. Lo mitigan los límites por correo e IP; si pasa, el servidor responde `EMAIL_SEND_FAILED` y se puede apagar el interruptor.
- **Entregabilidad:** un dominio nuevo puede acabar en spam al principio; la guía pide SPF, DKIM y DMARC y avisar de revisar la carpeta de spam.
- **Dependencia externa:** si Resend cae, el registro falla con un mensaje claro y el resto sigue; marcha atrás con el interruptor.
- **Límites en memoria:** se reinician al desplegar (como en la etapa 5); el tope duro es `attempts` en la base de datos.
- **Token de acceso tras restablecer:** el ya emitido caduca solo, en menos de 1 hora; los tokens de renovación sí se revocan.
- **`TRUST_PROXY` mal puesto:** los límites por IP no distinguirían a los visitantes; por eso va antes. Los de por correo y el contador de la base de datos siguen protegiendo.
- **Reemplazar una cuenta pendiente** abre un caso límite (alguien registra el correo de otra persona justo cuando esa persona se registra) con consecuencias mínimas: la cuenta es de un juego y quien recibe el código puede recuperarla con «olvidé mi contraseña».

## 9. Fuera de alcance

Cambiar el correo de una cuenta, avisar por correo de un cambio de contraseña, SMS o WhatsApp, enlaces mágicos, entrar con Google o GitHub, doble factor, captcha, un panel de administración, y las etapas 8 y 9 (pulido de la partida; revancha en la misma sala y foto de perfil).

## 10. Entrega

Rama `etapa-7-cuentas` (el cambio de `TRUST_PROXY` va aparte, antes), una tarea por área (configuración y errores compartidos, migración, servicio de correo, códigos y reglas de cuentas, rutas y límites, cliente: API y sesión, pantallas, E2E, documentación), revisión final independiente, fusión en `main` y subida con permiso de Marco; Render redespliega solo con el interruptor apagado.
