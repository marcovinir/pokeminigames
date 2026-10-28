# Página de inicio para varios minijuegos y pie de página con páginas informativas — diseño

Fecha: 2026-10-27 · Estado: borrador para que Marco lo apruebe · Rama: `inicio-y-pie` (sale de `menu-fondos`, que trae la tarjeta nueva de «Doble tipo» del menú)

## Intención

La página de inicio de sesión (`/login`) y la de crear cuenta (`/registro`) son la puerta del juego, y se quedaron atrás: todavía presentan PokeMiniGames como si solo existiera «Doble tipo». El lema dice «Nombra el Pokémon, gana más stats», los tres pasos explican ese juego y la tarjeta de ejemplo enseña «veneno + acero». «¿Quién es ese Pokémon?» no aparece. Marco quiere que, **en los primeros segundos, quien llega entienda que hay varios minijuegos Pokémon para jugar 1 vs 1 con amigos**.

Marco también quiere **formalizar la página** con un pie como el de otros sitios de fans: Acerca de, Contacto, FAQ, Privacidad, Términos y Aviso legal. Hay una razón más allá de la apariencia: el juego guarda cuentas (correo y contraseña cifrada) y usa una cookie de sesión, así que conviene explicar qué se guarda y cómo pedir que se borre.

## Objetivos

1. **Página de inicio y de crear cuenta (decisión de Marco):** la parte de presentación (hoy `client/src/pages/AuthHero.tsx`) deja de hablar de «Doble tipo» y presenta la colección: varios minijuegos Pokémon, 1 vs 1, con amigos. Debe enseñar **cada minijuego** con su nombre, su frase y su dibujo (el mismo arte de las tarjetas del menú), y ampliarse sola cuando se añada uno nuevo a `GAME_KINDS`, sin tocar la página.
2. **Formularios sin cambios (decisión de Marco):** entrar, crear cuenta y entrar como invitado funcionan y se ven como ahora. Solo cambia lo que los rodea.
3. **Pie de página en todas las pantallas (decisión de Marco)** con enlaces a: **Acerca de, Contacto, FAQ, Privacidad, Términos, Aviso legal y Apoya el proyecto**. El aviso actual («Proyecto de fans sin fines de lucro… Arte y datos de PokeAPI») se queda dentro del pie.
4. **Una página corta por enlace**, pública (se ve sin haber entrado), con el estilo actual.
5. **Contacto a través de GitHub (decisión de Marco):** se crea un repositorio público, `marcovinir/pokeminigames-comentarios`, solo para recibir mensajes, con plantillas de issue «Idea» y «Error». Acerca de enlaza además al perfil de GitHub de Marco (`https://github.com/marcovinir`). El código del juego sigue privado.
6. **Borrar la cuenta desde el perfil (decisión de Marco):** un botón «Borrar mi cuenta» en `/perfil` que pide la contraseña. Así solo el dueño puede borrarla y no tiene que escribir a nadie.

## No objetivos

- **No se cambia el estilo (decisión de Marco).** Ni colores, ni temas, ni tipografía, ni la forma de las tarjetas. Marco miró pokemonminigames.com solo por su pie y su forma de pedir apoyo, y **no** quiere parecerse a ese sitio (tema oscuro único, rejilla de tarjetas enormes, Discord, Pokédex…).
- **Sin donaciones ni dinero (decisión de Claude, que Marco delegó).** El juego usa nombres y arte de Pokémon; pedir dinero (Buy Me a Coffee, Ko-fi, Patreon) es lo que más expone a una retirada por parte de Nintendo, y para un proyecto de portafolio no compensa. «Apoya el proyecto» es apoyo **sin dinero**: compartir el juego, mandar ideas, avisar de errores. Se podrá añadir un botón más adelante si cambian las circunstancias, pero no en este trabajo.
- Sin formulario de contacto propio, sin correo público y sin servicios externos nuevos (nada de pago). El contacto es el repositorio de GitHub.
- Sin borrado de cuentas a petición por issue: una petición pública no demuestra quién es el dueño (el nombre de usuario es público).
- No se toca el menú principal, el lobby ni las salas, salvo que también llevan el pie (ya lo llevan: `Footer` está en `App.tsx`).

## Antiobjetivos (lo que lo haría un fracaso aunque funcione)

- Que la página de inicio siga pareciendo de un solo juego, o que haya que editarla a mano cada vez que se añade un minijuego.
- Que el formulario quede más abajo o cueste más llegar a él en el móvil que ahora. Hoy, a 375 px, la presentación se reduce al lema para que el formulario esté a la vista: eso se mantiene.
- Textos legales que prometan lo que el juego no hace (por ejemplo, «no usamos cookies») o que copien plantillas genéricas con cosas que no aplican (publicidad, venta de datos, newsletters).
- Cualquier cosa que parezca comercial: precios, «premium», botones de pago.
- Que el pie tape contenido o se salga de la pantalla en el móvil, o que ensucie las pantallas de juego (las salas).

## Restricciones

- Las del repositorio (AGENTS.md): español con tildes en todo lo que se ve; TDD; contraste AA en los 4 temas/modos (`client/scripts/contrast-audit.js`); probado a 375 px y en escritorio con imágenes reales; no subir `main` sin permiso de Marco; nada de secretos.
- **Sin migraciones**: el borrado anonimiza con las columnas que ya existen.
- Las páginas nuevas son **públicas**: sus rutas van fuera de `RequireAuth` y de `PublicOnly`, para que se vean con sesión, sin sesión y como invitado.
- **Los textos se redactan a partir de lo que el juego hace de verdad** (abajo, «Qué hace el juego con los datos»). Son textos razonables para un proyecto de fans, **no asesoría legal**, y así lo dice la página de Aviso legal.
- El repositorio público de comentarios lo crea Claude con `gh`, **después** de que Marco apruebe esta spec (Marco lo autorizó así). Es público: no debe contener nada del código ni enlaces a sitios privados.

## Qué hace el juego con los datos (la base de los textos)

Comprobado en el código (`server/prisma/schema.prisma`, `client/src/services.tsx`):

- **Cuenta:** correo, nombre de usuario, contraseña **cifrada** (nunca en claro), fecha de alta, tema y modo elegidos, avatar (un Pokémon de una lista fija).
- **Partidas de «Doble tipo»:** se guardan (jugadores, rondas, Pokémon elegidos, stats, ganador) para el perfil y las estadísticas. Las partidas de la silueta no se guardan.
- **Invitados:** solo un nombre; sus partidas no se guardan ni cuentan para las estadísticas.
- **Sesión:** una cookie `HttpOnly` de refresco (solo viaja a `/auth`), necesaria para mantener la sesión; el token de acceso vive solo en memoria. No hay cookies de publicidad ni de analítica.
- **En el navegador (`localStorage`):** el tema elegido, y nada más que identifique a nadie.
- **Límites de peticiones:** por IP, solo en memoria y temporales.
- **Alojamiento:** Render (servidor) y Neon (base de datos); como cualquier servidor, pueden registrar IPs en sus registros técnicos.
- **Imágenes:** el arte y los sprites se cargan de PokeAPI / GitHub, que reciben la petición del navegador.
- No se vende nada, no hay anuncios, no se comparte nada con terceros más allá de lo anterior.

## Las páginas

Rutas propuestas (decisión de Claude, el implementador puede ajustar los nombres): `/acerca`, `/contacto`, `/faq`, `/privacidad`, `/terminos`, `/aviso-legal`, `/apoya`. Cada una con un título, unos pocos párrafos o listas, y un enlace para volver (al menú con sesión, a `/login` sin ella). Contenido mínimo:

- **Acerca de:** qué es PokeMiniGames (minijuegos Pokémon 1 vs 1 en tiempo real, gratis, sin anuncios), que es un proyecto de portafolio de un estudiante (Marco) con enlace a su perfil de GitHub, la tecnología en una línea, y que es un proyecto de fans no oficial.
- **Contacto:** se escribe abriendo una issue en `marcovinir/pokeminigames-comentarios`, con un enlace por plantilla (Idea, Error). Aviso de que las issues son públicas: no poner correo ni contraseñas. Para borrar la cuenta se remite al perfil.
- **FAQ:** cómo se juega a cada minijuego (los textos salen de lo que ya hay en `GAME_CARDS` y las pantallas), cómo jugar con un amigo (crear sala y pasar el código), diferencia entre invitado y cuenta, si es oficial (no), si es gratis (sí), cómo borrar la cuenta.
- **Privacidad:** lo de «Qué hace el juego con los datos», en lenguaje claro; cómo pedir que se borre la cuenta; fecha de la última actualización.
- **Términos:** uso gratuito y sin garantías; normas de convivencia (nombres de usuario ofensivos o suplantaciones pueden borrarse); el servicio puede cambiar o cerrarse; fecha.
- **Aviso legal:** proyecto de fans sin fines de lucro; Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company, sin relación con ellos; arte y datos de PokeAPI; si un titular de derechos pide retirar algo, se retira (por la vía de Contacto); estos textos no son asesoría legal.
- **Apoya el proyecto:** sin dinero. Compártelo con amigos, manda ideas o avisa de errores (enlaces a Contacto).

## Borrar una cuenta (objetivo 6)

Decisión de Claude: **anonimizar en vez de borrar las filas.** Las partidas guardadas son también del rival (su historial y sus estadísticas), y `game_players` y `games.winner_id` apuntan al usuario sin borrado en cascada. Al confirmar el borrado, el servidor deja la cuenta así (una sola función, en una transacción):

- correo sustituido por uno imposible y único (por ejemplo, `borrada-<id>@invalid`), contraseña sustituida por un valor que no corresponde a ninguna contraseña, avatar y tema a nulo;
- **nombre de usuario sustituido por uno de relleno, único y válido** (decisión de Claude): `borrada_` seguido de los 12 primeros caracteres hexadecimales del id (cumple `USERNAME_PATTERN` = `^[A-Za-z0-9_]{3,30}$` y el índice único `users_username_lower_key` sobre `lower(username)`). Así el nombre original queda libre para otra persona y no hace falta migración. Un ayudante en `shared` (`isDeletedUsername`) reconoce el prefijo; el cliente muestra «Cuenta borrada» **sin enlace** al perfil (historial, resumen de partida, rankings si los hay), y el registro rechaza nombres que empiecen por `borrada_`;
- todos sus tokens de refresco borrados (cierra sus sesiones);
- las partidas se quedan; en el historial del rival aparece «Cuenta borrada».

**En la aplicación:** en `/perfil` (solo cuentas; los invitados no tienen perfil), una sección al final, «Borrar mi cuenta», con un aviso claro (no se puede deshacer; tus partidas seguirán en el historial de tus rivales como «Cuenta borrada»), un campo de contraseña y un botón de confirmar. El servidor expone un endpoint autenticado (por ejemplo `DELETE /auth/me` con `{ password }`) que comprueba la contraseña igual que el inicio de sesión (mismo límite de peticiones contra fuerza bruta), anonimiza, borra la cookie de refresco y responde; el cliente cierra la sesión y lleva a `/login` con un aviso de que la cuenta se borró. Si la contraseña no coincide, error claro y no se toca nada. Si el usuario está en una sala, se le trata como si se hubiera desconectado (lo que ya hace el juego al cerrar sesión).

**Para Marco (moderación):** la misma función, en un script `npm run account:delete -w server -- <nombre de usuario>`, para retirar cuentas con nombres ofensivos (lo prevén los Términos). El nombre de usuario es único sin distinguir mayúsculas, así que identifica una sola cuenta; el script la enseña y pide confirmación antes de escribir. Se documenta en `docs/despliegue.md` (cómo ejecutarlo contra Neon sin poner la URL en el repositorio).

## La página de inicio

- El lema nuevo dice lo de Marco: minijuegos Pokémon para jugar 1 vs 1 con tus amigos. La redacción exacta es del implementador; por ejemplo: «Minijuegos Pokémon para jugar **1 vs 1** con tus amigos».
- Debajo, en escritorio, **un elemento por minijuego** generado desde `GAME_KINDS` y `GAME_CARDS`: el dibujo del menú (la misma pieza que `GameArt` en `MainMenu.tsx`, que conviene sacar a un componente compartido), el nombre y la frase. Los minijuegos no son enlaces (aún no hay sesión). La forma exacta (lista, tarjetas pequeñas en fila, columna) es del implementador, dentro del estilo actual; se enseñarán maquetas a Marco antes de cerrar la spec si hace falta.
- A 375 px, como hoy, la presentación se reduce para que el formulario siga a la vista. Queda a criterio del implementador si muestra solo el lema o el lema y los nombres de los juegos en una línea.
- Se mantiene el logo animado y el «NUEVO» del juego que lo tenga.

## El pie

- Una fila de enlaces (las 7 páginas) y, debajo, el aviso de fans de siempre. En el móvil los enlaces pasan a varias líneas sin salirse.
- Discreto, en `text-muted`, con el contraste AA en los 4 temas. El pie de la imagen de ejemplo de Marco (una píldora oscura con los enlaces) sirve de referencia de tamaño y tono, no de estilo.
- **Decisión de Claude:** el pie nuevo (con los 7 enlaces) es el mismo en todas las pantallas, salas incluidas. Va al final de la página, debajo del juego, como el aviso de ahora, así que no distrae durante la partida y no hace falta una variante por ruta.

## Pruebas y comprobación

- Pruebas del cliente: la presentación muestra un elemento por cada `GAME_KINDS` (una prueba que falle si se añade un juego sin texto o sin dibujo), ya no menciona «stats» ni «veneno»; el pie tiene los 7 enlaces con su destino; cada ruta nueva se ve sin sesión, con sesión y como invitado; el enlace de Contacto apunta al repositorio público.
- Pruebas del borrado contra la base de pruebas: con la contraseña correcta anonimiza, cierra todas las sesiones, deja intactas las partidas y estadísticas del rival y libera el nombre; con la contraseña incorrecta o sin sesión no toca nada; no se puede volver a entrar con la contraseña antigua; un invitado no puede usarlo; el registro rechaza nombres que empiecen por `borrada_`. En el cliente: el formulario del perfil, su error y el cierre de sesión al terminar; «Cuenta borrada» sin enlace en el historial y el resumen. Mutación: quitar la comprobación de contraseña hace fallar alguna prueba.
- E2E existente en verde (sus pasos de entrar no cambian).
- A mano: 375 px y escritorio, los 4 temas, auditoría de contraste vacía, y capturas del README actualizadas (`E2E_SCREENSHOTS=1`).

## Lo que queda al implementador

Redacción exacta de los textos (dentro de lo de arriba), forma visual de la lista de juegos de la presentación, nombres de rutas y componentes, cómo se organizan los textos en `es.ts`, y la forma exacta del endpoint y del script de borrado.
