# Avatares de Pokémon — diseño

Issue #6. Diseñado con Marco el 2026-10-22/24. Maquetas aprobadas en `2026-10-24-avatares-maquetas/` (`lista.html`, `estilo.html`, `selector.html`).

## 1. Intención

Hoy cada jugador es un círculo de color con sus iniciales (`client/src/components/Avatar.tsx`), y eso se siente impersonal. Marco quiere que el avatar **muestre el Pokémon favorito de cada uno y que se vea más personal**: que al entrar a una sala veas a tu rival con su Pokémon, no con unas letras.

Que funcione bien significa que cualquiera con cuenta entra a su perfil, elige uno de los 24 en dos toques, y desde ese momento se ve con ese Pokémon en todo el juego, en este dispositivo y en cualquier otro, y su rival también lo ve.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Elegir, cambiar o quitar el avatar desde «Mi perfil»; se guarda en la cuenta.
- Verlo en todos los sitios donde hoy salen las iniciales (§5), el propio y el del rival.
- Quien no ha elegido, y los invitados, se ven como hoy (iniciales).

**No objetivos**
- Subir fotos propias.
- Elegir entre los 1025 Pokémon (Marco lo descartó a propósito: 24 predefinidos).
- Elegir el avatar al registrarse o al entrar como invitado.
- Avatar para invitados.
- Guardar qué avatar tenía cada jugador en cada partida.

**Antiobjetivos** (aunque funcione, sería un fracaso)
- Que el perfil o la sala se rompan, se desborden o se vean mal a 375 px o en alguno de los 4 temas/modos.
- Que un avatar que no carga deje un hueco o un icono roto en vez de las iniciales.
- Que una migración toque o borre datos de las cuentas que ya existen.
- Avatares raros, de pago o que se desbloqueen jugando.

## 3. Decisiones de Marco (tal como las tomó)

- **Para qué:** «que muestre su Pokémon favorito y se vea más personal».
- **24 predefinidos, los populares** (no los 1025). Aprobó mi propuesta cambiando solo Sprigatito por Arcanine. La lista final, en este orden (número de Pokédex entre paréntesis):
  Pikachu (25), Charizard (6), Bulbasaur (1), Squirtle (7), Gengar (94), Eevee (133), Snorlax (143), Mewtwo (150), Dragonite (149), Gyarados (130), Umbreon (197), Lugia (249), Tyranitar (248), Blaziken (257), Gardevoir (282), Rayquaza (384), Lucario (448), Garchomp (445), Zoroark (571), Greninja (658), Sylveon (700), Mimikyu (778), Dragapult (887), Arcanine (59).
- **Se elige después, en el perfil**, no al registrarse.
- **Estilo A** (`estilo.html`): el **arte oficial** del Pokémon dentro del círculo, **sobre el mismo color de fondo** que hoy tienen las iniciales de esa persona (`avatarColor(name)`), en todos los tamaños.
- **Selector A** (`selector.html`): en «Mi perfil», un botón **«Cambiar avatar»** abre una **ventana** con los 24; el elegido lleva un aro; **se guarda al tocarlo** y la ventana se cierra; hay un **«Usar mis iniciales»** para quitarlo y un **«Cerrar»**.
- Marco no puso pegas a lo que le conté de dónde se ve y cómo se comporta (§5 y §6).

## 4. Pantallas

### Mi perfil (propio)
- Encabezado como hoy (avatar de 88 px, «Tu perfil», nombre), con el botón **«Cambiar avatar»** debajo del nombre (secundario).
- Al pulsarlo se abre una ventana modal **«Elige tu avatar»**: rejilla de los 24 en el orden de §3 (6 columnas en teléfono; más columnas o tamaño mayor en escritorio queda al implementador), cada uno con el estilo A. El actual lleva el aro de selección. Debajo: «Usar mis iniciales» (solo si hay uno elegido) y «Cerrar».
- Tocar un Pokémon lo guarda; mientras se guarda, la rejilla no admite otro toque. Si va bien, la ventana se cierra y el avatar nuevo aparece al instante en el encabezado del perfil y en el de la página. Si falla, la ventana sigue abierta con un aviso («No se pudo guardar tu avatar. Inténtalo de nuevo.») y el avatar anterior.
- Tocar el que ya tienes solo cierra la ventana.

### Perfil de otro jugador
- Su avatar (estilo A, 88 px) en lugar de las iniciales. Sin botón.

### El resto
Ningún cambio de disposición: donde hoy está `<Avatar>`, ahora se ve el Pokémon si la persona eligió uno (§5).

## 5. Dónde se ve

En todos los sitios que hoy usan `<Avatar>`:

| Sitio | Archivo | De quién |
|---|---|---|
| Encabezado («Mi perfil») | `components/Header.tsx` | tuyo |
| Panel del rival en la partida | `components/Panels.tsx` | rival |
| Sala de espera | `pages/room/WaitingView.tsx` | los dos |
| Cuenta atrás | `pages/room/CountdownView.tsx` | los dos |
| Récord de la revancha | `pages/room/RematchPanel.tsx` | los dos |
| «¡Revancha!» | `pages/room/RematchLoadingView.tsx` | los dos |
| Perfil | `pages/profile/ProfilePage.tsx` | tuyo o del otro |
| Historial | `pages/profile/HistoryList.tsx` | cada rival |

## 6. Comportamiento

- **Guardar:** cambia el avatar de la cuenta para todas sus sesiones y dispositivos. La pestaña donde se cambió se actualiza al instante; otra pestaña o dispositivo lo ve la próxima vez que pida sus datos (`GET /auth/me`, al recargar o al renovar la sesión). No hace falta avisar en tiempo real.
- **En una sala:** el avatar que se ve en una sala es el que tenía cada uno **al crear la sala o unirse**. Si alguien lo cambia a mitad de partida, su rival lo ve a partir de la siguiente sala. *(Decisión mía.)* La sala de una revancha copia los jugadores de la anterior y con ellos su avatar *(decisión mía: la revancha se crea en segundos y así no hay que volver a leer la base)*.
- **Historial y perfil ajeno:** muestran el avatar que la persona tiene **hoy**, no el que tenía en esa partida *(decisión mía)*.
- **Sin avatar:** iniciales sobre su color, exactamente como hoy. Lo mismo para invitados (no tienen perfil ni pueden elegir) y para cuentas que nunca eligieron.
- **Si la imagen no carga** (sin red, PokeAPI caído): iniciales sobre su color, sin icono roto ni hueco. Mientras carga se ve el círculo de color (sin parpadeo de iniciales en una carga normal; cómo se consigue queda al implementador).
- **Validación:** el servidor solo acepta un número de la lista de 24 o `null` (quitar). Cualquier otro valor → 400 `VALIDATION_ERROR` y no se guarda nada. Un invitado no puede guardar avatar (403 `ACCOUNT_REQUIRED`, como el resto de rutas de cuenta).
- **Si la lista cambia en el futuro** y una cuenta tiene guardado un Pokémon que ya no está en ella, se sigue mostrando (es un Pokémon real) hasta que elija otro *(decisión mía)*.

## 7. Datos y contratos (decisiones mías; el implementador puede ajustarlas sin cambiar el comportamiento)

- **Lista compartida:** `shared/src/avatars.ts` exporta `AVATAR_POKEMON: readonly number[]` (los 24 números de Pokédex en el orden de §3) e `isAvatarPokemon(id)`. Servidor y cliente usan la misma.
- **Base de datos:** columna nueva y **aditiva** `users.avatar_pokemon_id` (entero pequeño, **nulo** = iniciales), con clave foránea a `pokemon(id)` y `ON DELETE SET NULL`. Una migración nueva; no se toca ninguna existente. Las cuentas que ya existen quedan con `NULL` (se ven igual que hoy).
- **Guardar:** `PUT /auth/me/avatar` con `{ "avatarId": number | null }` → `200 { "avatarId": number | null }`. Requiere cuenta (`requireAccount`), comprobación de origen y el límite de peticiones de la API como el resto. El número es el de Pokédex.
- **Leer el propio:** `GET /auth/me` (y las respuestas de `login`/`register`) incluyen `avatarId: number | null` en el usuario.
- **Sala:** `RoomPlayerView` (`shared/src/events.ts`) gana `avatarId?: number` (ausente = iniciales; opcional para que un cliente o servidor viejo durante un despliegue siga funcionando). El servidor lo lee de la base al **crear la sala o unirse** (rutas `POST /rooms` y unión en `server/src/rooms/rooms.routes.ts`) y lo guarda en `RoomUser`; **no** va en el token de acceso (dura 1 h y quedaría viejo). Para invitados no se consulta nada.
- **Perfil ajeno e historial:** `StatsResponse` gana `avatarId: number | null` y `HistoryEntry.opponent` gana `avatarId: number | null` (`shared/src/stats.ts`, `server/src/stats/stats.service.ts`).
- **Cliente:** `Avatar` acepta `avatarId?: number | null`; con un número muestra el arte oficial (`artworkUrl` de `client/src/catalog/artwork.ts`) sobre `avatarColor(name)`, y si la imagen falla vuelve a las iniciales. El almacén de sesión guarda `avatarId` del usuario y lo actualiza al guardar.

## 8. Accesibilidad y diseño

- La ventana es un diálogo modal accesible: título «Elige tu avatar», el foco entra al abrir (al avatar actual o al primero), Escape y «Cerrar» la cierran, y el foco vuelve a «Cambiar avatar». Teclado completo.
- Cada Pokémon es un botón con su nombre en español como nombre accesible (p. ej. «Gengar») y el actual marcado como seleccionado (`aria-pressed` o un grupo de opción única, a elección del implementador). El aro de selección no depende solo del color: el actual también se distingue por forma o grosor y por su estado accesible.
- Fuera del perfil el avatar sigue siendo decorativo (`aria-hidden`), porque el nombre ya está al lado. En el encabezado del perfil (propio y ajeno) se anuncia «Avatar: {Pokémon}» *(decisión mía)*.
- Contraste: la auditoría (`client/scripts/contrast-audit.js`, `__contrastAuditAll()`) vacía en los 4 temas/modos, con la ventana abierta. El aro de selección y el foco visible en los dos temas, claro y oscuro.
- 375 px: ni la ventana ni el perfil se desbordan (medir cajas en un navegador real, con un nombre de 30 letras). El arte se ve completo dentro del círculo a 28 px (tamaño más pequeño) sin cortar la cabeza del Pokémon; el ajuste fino de escala o recorte queda al implementador, que debe mirarlo con las imágenes reales.
- Movimiento: cualquier animación al abrir la ventana respeta «reducir movimiento».

## 9. Pruebas y «terminado»

Lo de `AGENTS.md` §7 y, además:
- Servidor: guardar, quitar y rechazar ids fuera de la lista (400) y a invitados (403); `GET /auth/me` y login devuelven `avatarId`; la sala lleva el `avatarId` de cada cuenta y nada para invitados; perfil ajeno e historial lo llevan; la migración se aplica en una base limpia y sobre datos existentes (las cuentas existentes quedan con `NULL`).
- Cliente: `Avatar` con y sin avatar y con la imagen fallida; la ventana (abrir, elegir, guardar, error, quitar, Escape y foco de vuelta); el avatar se actualiza en el encabezado tras guardar; cada pantalla de §5 pasa el `avatarId`.
- E2E: una cuenta elige un avatar, su rival lo ve en la sala de espera y en el historial; tras recargar sigue elegido; quitarlo vuelve a las iniciales; una medida a 375 px del perfil con la ventana abierta.
- README: sección de avatares, la ruta nueva y los campos nuevos de la API y los eventos. Regenerar la captura del perfil si cambia.

## 10. Lo que se deja al implementador

- El nombre exacto de la columna, del archivo de la lista y de los tipos (siempre que el contrato de §7 se mantenga en espíritu).
- El tamaño y las columnas de la rejilla en escritorio; el escalado del arte dentro del círculo en cada tamaño.
- Cómo evitar el parpadeo de iniciales mientras carga la imagen.
- `aria-pressed` o grupo de opción única en la rejilla.
- Si el servidor lee el avatar con una consulta aparte o junto a otra que ya haga al crear o unirse.
