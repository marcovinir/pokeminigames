# Correo: cuentas con código (Resend)

Esta guía activa en el sitio en vivo las **cuentas con código por correo**: al registrarse llega un código de 6 dígitos que hay que escribir para abrir la cuenta, y el inicio de sesión gana el enlace «¿Olvidaste tu contraseña?», que también funciona con un código por correo. Los correos los envía **Resend**, un servicio con capa gratuita. Render (capa gratuita) bloquea el correo directo por SMTP, así que hace falta un servicio como Resend que se use por internet.

Con lo que viene de fábrica (`EMAIL_VERIFICATION` apagada) el juego funciona exactamente como antes; nada de esto es obligatorio hasta que decidas activarlo.

## Qué cambia cuando lo activas

- **Registro:** la cuenta se crea, llega un correo con el código y solo entra quien lo escribe. Un código dura 10 minutos, vale una sola vez y se bloquea tras 5 intentos equivocados.
- **Olvidé mi contraseña:** el enlace está en la pantalla de inicio de sesión. Se escribe el correo, llega un código y se elige una contraseña nueva. Al cambiarla se cierran las sesiones abiertas.
- **Límites:** un código nuevo por correo cada 60 segundos, y como máximo 5 por hora por correo y 10 por hora por IP. La capa gratuita de Resend permite 100 correos al día (y tiene un tope mensual; míralo en [resend.com/pricing](https://resend.com/pricing)).
- Nadie puede saber desde fuera si un correo tiene cuenta: la pantalla contesta lo mismo en los dos casos.
- **Cuentas que ya existen:** las de antes de esta versión quedan verificadas. Las que se hayan creado con el interruptor apagado y nunca verificaron su correo tendrán que hacerlo la primera vez que inicien sesión con el interruptor encendido: el servidor les envía el código.

## Antes de empezar

Necesitas:

1. **Un dominio propio.** Es lo único que puede costar dinero. El juego sigue en su dirección de `onrender.com`; el dominio solo sirve para que los correos salgan con un remitente tuyo (por ejemplo `no-responder@tu-dominio.me`).
2. **Una cuenta gratuita en Resend** ([resend.com](https://resend.com)).
3. **Acceso al panel de Render**, donde ya está el servicio `pokemon-minigames`.
4. **Las dos pruebas de `TRUST_PROXY` pasadas** (sección 5 de la [guía de despliegue](despliegue.md#5-verificar-trust_proxy-una-sola-vez-tras-el-primer-despliegue)): los límites por IP que frenan el correo masivo y los intentos con códigos dependen de que el servidor lea bien la IP de cada visitante.

Calcula media hora de trabajo más la espera de los registros DNS (de unos minutos a unas horas).

> **La clave de API es un secreto: solo se pega en el panel de Render.** Nunca en el chat, en un archivo del repositorio, en una captura ni en un correo. Si por error se muestra en algún sitio, bórrala en Resend y crea otra (paso 4).

## 1. Conseguir un dominio

- Si tienes el **GitHub Student Developer Pack**, mira [education.github.com/pack](https://education.github.com/pack): ha incluido un dominio gratis por un año (por ejemplo un `.me` en Namecheap). Confirma allí que la oferta sigue vigente y sigue sus pasos.
- Si no, compra uno barato (unos pocos dólares al año) en cualquier registrador: Namecheap, Porkbun, Cloudflare Registrar…

Anota el nombre completo del dominio (en esta guía, `tu-dominio.me`). No hace falta que apunte a ninguna página.

## 2. Crear la cuenta de Resend

1. Entra en [resend.com](https://resend.com) → **Sign up** (con GitHub o con un correo) y confirma tu correo.
2. Déjala en el plan **Free**. No pide tarjeta.

## 3. Añadir el dominio en Resend y verificarlo

1. En Resend abre **Domains** → **Add Domain**.
2. Escribe el dominio. Resend recomienda enviar desde un **subdominio** (por ejemplo `mail.tu-dominio.me`) para que la reputación de los correos del juego no se mezcle con nada más; sirve cualquiera de las dos formas. Si usas el subdominio, el remitente del paso 5 será `no-responder@mail.tu-dominio.me`.
3. Elige la región más cercana que ofrezca (por ejemplo N. Virginia o São Paulo).
4. Resend muestra los **registros DNS** que hay que crear: la autenticación del remitente (**SPF**, un registro `TXT` y uno `MX`; en dominios nuevos a veces los muestra como `CNAME`) y la firma de los mensajes (**DKIM**, un registro `TXT`). Añade **exactamente los que Resend te muestra en su pestaña *Records***.
5. En el panel DNS de tu registrador (en Namecheap: *Domain List* → *Manage* → *Advanced DNS* → *Add New Record*) crea cada registro con el mismo tipo, nombre y valor. Si tu panel ya añade el dominio al final del nombre, escribe solo la parte de la izquierda (`resend._domainkey`, no `resend._domainkey.tu-dominio.me`). El `MX` lleva además la prioridad que indica Resend. Deja el TTL en *Automatic*.
6. **Recomendado: DMARC.** Crea un registro `TXT` con nombre `_dmarc` y valor `v=DMARC1; p=none;` (vigila sin rechazar nada). Resend lo explica en su sección DMARC.
7. De vuelta en Resend pulsa **Verify DNS Records**. El estado pasa de *Pending* a **Verified**; tarda de minutos a unas horas (Resend lo intenta durante 72 horas). No sigas hasta ver *Verified*.

## 4. Crear la clave de API

1. En Resend abre **API Keys** → **Create API Key**.
2. Nombre: `pokemon-minigames`. Permiso (*Permission*): **Sending access**, que solo permite enviar correos: si la clave se filtra, nadie puede leer ni borrar nada. Dominio (*Domain*): el que verificaste.
3. Resend muestra la clave **una sola vez** (empieza por `re_`). Cópiala y pasa al paso 5 sin cerrar la pestaña. Si la pierdes, bórrala y crea otra.

## 5. Poner las variables en Render

En [dashboard.render.com](https://dashboard.render.com) → servicio `pokemon-minigames` → **Environment** → **+ Add Environment Variable**. Añade estas cuatro variables (Render no las crea sola en un servicio que ya existe) y guarda **una sola vez**, con todas a la vez:

| Variable | Valor | Para qué |
|---|---|---|
| `RESEND_API_KEY` | la clave `re_…` que copiaste en el paso 4 | Permite enviar |
| `MAIL_FROM` | `Pokémon Minigames <no-responder@tu-dominio.me>` | El remitente: el dominio tiene que ser el que verificaste |
| `MAIL_PROVIDER` | `resend` | Envía con Resend |
| `EMAIL_VERIFICATION` | `on` | Enciende las cuentas con código |

Al guardar, elige **Save and deploy** (vuelve a desplegar la misma versión con las variables nuevas; con *Save only* no se despliega nada). En **Logs** debe aparecer `Servidor escuchando`. Si en cambio dice `Variables de entorno inválidas`, el mensaje nombra la variable (por ejemplo `RESEND_API_KEY: es obligatoria con MAIL_PROVIDER=resend`): corrígela y guarda; mientras tanto el servicio anterior sigue sirviendo.

## 6. Probar de verdad

1. Abre el sitio en una ventana privada y **regístrate con tu correo real**. Debe aparecer «Verifica tu correo».
2. Busca el mensaje «Tu código de Pokémon Minigames» (si no está en la bandeja, mira la **carpeta de spam**; en un dominio nuevo es normal al principio, y marcarlo como «no es spam» ayuda). Escribe el código: entras al lobby.
3. Cierra sesión y vuelve a entrar con tu contraseña: no pide código.
4. Cierra sesión otra vez, pulsa **¿Olvidaste tu contraseña?**, escribe tu correo, recibe el código, elige una contraseña nueva e inicia sesión con ella.

Si algo falla, mira la tabla del final.

## Marcha atrás

Si algo sale mal o quieres parar los correos: en Render → **Environment** pon `EMAIL_VERIFICATION` a `off` y guarda con **Save and deploy**. El sitio vuelve a funcionar exactamente como antes: registrarse no pide código y desaparece «¿Olvidaste tu contraseña?». Las cuentas creadas mientras estuvo activa se conservan, y las que aún no se habían verificado pueden iniciar sesión sin hacerlo. No hace falta borrar las demás variables.

## Si algo no funciona

| Qué ves | Qué mirar |
|---|---|
| «No pudimos enviar el correo. Inténtalo de nuevo en un momento.» | Resend rechazó el envío: clave mal copiada o borrada, dominio todavía sin verificar, o `MAIL_FROM` con un dominio distinto del verificado. En Resend, la sección **Logs** o **Emails** dice el motivo. |
| No llega nada, pero tampoco hay error | La carpeta de spam. Después, en Resend → **Emails**, el estado del mensaje (*Delivered*, *Bounced*…). |
| «Demasiados intentos. Inténtalo de nuevo en…» | Se alcanzó un límite (un código por minuto, 5 por hora, 5 intentos de código cada 10 minutos). La pantalla dice cuánto esperar. |
| El servicio no arranca: `Variables de entorno inválidas` | El mensaje nombra la variable que falta o está mal escrita. |
| Se acaba la cuota de Resend (100 al día) | El registro dice que no pudo enviar el correo. Espera al día siguiente o aplica la marcha atrás. |

## Probar en tu computadora sin Resend

En `server/.env` pon `EMAIL_VERIFICATION=on` (el proveedor de partida en desarrollo es `console`). Arranca el servidor con `npm run dev`: cada correo «se envía» a la consola del servidor con la línea `[correo simulado] para …`, y de ahí copias el código. En producción, con la verificación activa, el servidor **no** admite `console` (escribiría los códigos en el registro) y se niega a arrancar.
