# Pokémon Minigames — Etapa 6: Rediseño visual del cliente

Fecha: 2026-10-07 · Estado: pendiente de revisión

Complementa la spec general (`2026-09-30-pokemon-minigames-design.md`) y las de las etapas 2 a 5. Donde esta spec es más específica, manda esta. Las etapas 1 a 5 (juego completo, estadísticas, despliegue en Render y Neon) ya están en `main` y funcionan en https://pokemon-minigames.onrender.com.

## 1. Objetivo

Que la interfaz se vea como un juego moderno y pulido, con identidad propia, apto para un portafolio, sin cambiar lo que ya funciona: las reglas del juego, el tiempo real, las estadísticas, el servidor y el despliegue. Hoy la interfaz es correcta pero plana: un formulario gris sobre fondo negro, cajas con borde, selectores de tema sueltos y ninguna señal visual de que sea un juego de Pokémon. La etapa es solo de cliente (`client/`); no toca `server/` ni `shared/`.

## 2. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Dirección | Juego moderno y colorido: tarjetas grandes con el arte oficial, chips de tipo con relieve, fondos con carácter, animaciones suaves. |
| Temas | Se mantienen los dos, rehechos: **Clásico** es el estilo moderno y colorido; **Pokédex** es una piel retro del mismo diseño (bordes marcados, esquinas casi rectas, números monoespaciados). Cada uno en claro y oscuro. Siguen el selector, el modo automático y la preferencia guardada en el perfil. |
| Enfoque | Evolucionar el sistema de tokens y rehacer los componentes sobre Tailwind 4, sin librerías de interfaz ni de animación. |
| Movimiento | Moderado: solo CSS y un par de ayudantes pequeños; sin confeti ni sonido. Respeta «reducir movimiento». |
| Arte | Arte oficial de PokeAPI donde hay pocas imágenes a la vez; sprite pequeño en listas (sección 6). |
| Lo que no cambia | Textos y roles accesibles que ya prueban los tests, contraste AA, uso en móvil, comportamiento y API. |

## 3. Lenguaje visual y temas

Los componentes siguen usando solo variables CSS (tokens) a través de utilidades de Tailwind; no hay colores literales en los componentes, salvo los 18 colores de tipo. Los tokens actuales (`--bg`, `--surface`, `--fg`, `--accent`, `--line`, `--radius`, `--frame`…) **conservan su nombre y su papel**, para que lo ya escrito siga funcionando durante la migración; se añade una capa nueva.

**Clásico (claro y oscuro):**
- Fondo con degradado: cielo suave en claro, azul noche en oscuro, más una marca de agua grande de bola fija detrás del contenido.
- Tarjetas con esquinas de 24 px, controles de 14 px y píldoras de 999 px. El borde es un filo de 1 px más una sombra suave en dos capas (más tenue en oscuro).
- Acento «rojo Poké» para la acción principal, con azul y amarillo de apoyo. Los valores exactos los fija el plan y los validan las pruebas de contraste.
- Los 18 tipos con colores más saturados y chips con relieve (degradado del color del tipo).

**Pokédex (claro y oscuro):**
- Misma estructura y mismos componentes. Bordes de 2 px marcados, esquinas de 2 a 4 px, sin sombras difusas, números y etiquetas en monoespaciada, encabezado rojo tipo consola con luces LED decorativas y fondo de cuadrícula tipo pantalla.

**Capa nueva de tokens** (se añade sin renombrar nada): sombras (`--shadow-card`, `--shadow-pop`), aro de foco (`--ring`), fondos de arte (`--bg-art`, `--bg-mark`), radios por tamaño, duraciones (`--dur-fast` 120 ms, `--dur-base` 220 ms, `--dur-slow` 420 ms) y curva de aceleración (`--ease-out`).

**Tipografía** (empaquetada con el proyecto mediante `@fontsource-variable`, sin pedir nada a servicios externos; solo los subconjuntos latino y latino extendido, que cubren el español):
- Clásico: Fredoka para títulos y números grandes, Nunito para el texto.
- Pokédex: JetBrains Mono para números y etiquetas, Nunito para el texto.
- Presupuesto: las fuentes suman como mucho 130 KB; el JavaScript crece como mucho 40 KB comprimido (hoy 109 KB) y el CSS no pasa de 40 KB sin comprimir (hoy 17,7 KB).

**Reglas que no cambian:** contraste AA (4,5:1 para texto, 3:1 para componentes y texto grande) en los 4 temas y modos; sin texto con opacidad; diseño que se ve bien desde 375 px de ancho; foco visible en todo lo interactivo.

## 4. Estructura de la aplicación y kit de componentes

**Barra superior:** logo propio en SVG (una bola partida en dos colores) con el nombre en la fuente de títulos. A la derecha: avatar con iniciales, «Mi perfil» y un botón de paleta que abre un menú con **Tema** y **Modo** como grupos de botones segmentados (`radiogroup` accesible, operable con teclado) en vez de los dos `<select>`. En móvil la barra queda solo con iconos y nombres accesibles.

**Fondo y pie:** el fondo del tema (sección 3). El pie lleva el texto fijo «Proyecto de fans sin fines de lucro. Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company; no hay relación con ellos. Arte y datos de PokeAPI.»

**Cabecera del documento:** icono de favicon (SVG, la bola del logo), `theme-color` y etiquetas `og:title` y `og:description` para que el enlace se vea bien al compartirlo.

**Componentes** (se rehacen con los mismos roles y nombres accesibles que hoy):
- `Button`: el principal es una píldora grande con efecto de presión en Clásico y plano con borde marcado en Pokédex; secundario y fantasma. `loading` y `aria-busy` se conservan.
- `TextField`: más alto, foco visible con el color de acento; etiqueta, ayuda y error siguen asociados (`aria-describedby`, `aria-invalid`).
- Opciones de radio del lobby como tarjetas seleccionables (siguen siendo `input type="radio"` reales).
- `TypeChip`: relieve con degradado del color del tipo. El texto se calcula con `readableOn` y debe pasar 4,5:1 sobre **los dos extremos** del degradado.
- `Timer`: anillo SVG que se vacía (radio 44, trazo 8) con el número dentro; pasa a rojo en los últimos 5 s. Conserva `role="timer"`, su nombre accesible y la regla de no anunciar cada segundo.
- `PokemonCard`: versión compacta (sprite de 96 px sobre un círculo del color del primer tipo) y versión grande (arte oficial). Muestra un esqueleto brillante mientras carga la imagen.
- `Notice` con icono, `StatTile` (ficha de estadística), `Badge` (Ganaste, Empate, Perdiste, acierto, fallo), `Avatar` (iniciales sobre un color elegido de forma determinista a partir del nombre entre 8 colores que pasan AA) y `ScoreBoard` (marcador con puntos animados).
- `LoadingScreen` con una bola que gira (conserva el aviso de arranque lento a los 5 s).

## 5. Pantallas

Mismo comportamiento y mismos textos; cambia la estructura y el aspecto. Se diseñan primero para 375 px y se ensanchan en escritorio (≥ 768 px, ancho máximo 1024 px).

- **Acceso y registro:** en escritorio, dos columnas: a la izquierda el logo, el lema «Nombra el Pokémon, gana más stats» y una mini tarjeta de ronda de ejemplo; a la derecha el formulario. En móvil, el formulario con el logo arriba.
- **Lobby:** saludo con el nombre de la persona. El aviso «Tienes una partida en curso» pasa a un banner destacado con su botón. «Crear sala»: los modos como tarjetas seleccionables y el largo de la partida como botones segmentados. «Unirse»: el código en un campo grande, monoespaciado y con letras espaciadas.
- **Sala de espera:** el código en grande, en casillas por letra, con el botón de copiar; debajo, dos huecos de jugador (tú y un hueco que palpita mientras llega el rival).
- **Cuenta atrás:** número gigante dentro del anillo y, a los lados, los dos avatares con un «VS».
- **Elegir tipo:** los 18 tipos como cuadrícula de teselas de colores, con el elegido resaltado y el cronómetro en anillo arriba.
- **Ronda:** una «arena» central con los puntos de progreso, el par de tipos como dos chips grandes unidos por un «+», el anillo de tiempo y el campo grande con las sugerencias estilizadas. A los lados, tu equipo y el rival como marcadores con avatar y puntos. En móvil el marcador queda fijo arriba.
- **Resultado de la ronda:** dos tarjetas enfrentadas con el arte oficial grande, una insignia de acierto o fallo y los puntos ganados; la ganadora de la ronda se resalta. Una barra fina muestra la cuenta atrás hacia la siguiente ronda.
- **Resumen:** cabecera grande con «Ganaste», «Perdiste» o «Empate» y el marcador, con un halo suave si ganaste. Los equipos son cuadrículas de tarjetas compactas con las seis estadísticas como barras; la tarjeta del mejor Pokémon de cada equipo usa el arte grande. Los tres botones de siempre quedan abajo.
- **Perfil propio y ajeno:** cabecera con avatar y nombre; fichas de estadísticas con un anillo para el porcentaje de victorias; los tres Pokémon más ganados como podio con arte grande; historial con una insignia de color por resultado. El perfil ajeno es igual pero sin historial.
- **Estados:** carga (bola que gira), errores con reintento y el 404 con un mensaje amable y una ilustración sencilla en SVG.

## 6. Arte y movimiento

**Arte.** `artworkUrl(id)` devuelve `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png` (475 × 475 px) a partir del id, que ya llega en los datos; no cambian el servidor ni el catálogo. El arte grande se usa solo donde hay pocas imágenes a la vez: las dos tarjetas del resultado de ronda, el podio del perfil (3) y la tarjeta del mejor Pokémon de cada equipo en el resumen (1 por equipo). Todo lo demás usa el sprite de 96 px que ya llega en `spriteUrl`. Cada imagen lleva tamaño fijo (sin saltos de diseño), `decoding="async"` y `loading="lazy"` salvo en el resultado de ronda; si falla el arte oficial cae al sprite y, si también falla, a la bola neutra. Las imágenes son decorativas (`alt=""`): el nombre sigue en texto.

**Movimiento** (solo CSS, más los ayudantes `useCountUp` y `useReducedMotion`):
- Fundido de entrada de cada pantalla (`--dur-base`) y tarjetas que aparecen escalonadas (60 ms entre una y otra).
- El anillo del cronómetro se dibuja a partir de la cuenta atrás que ya existe (`useCountdown`), sin temporizadores nuevos.
- Los marcadores cuentan hasta el nuevo valor en 500 ms.
- Halo suave al ganar y efecto de presión en los botones.
- Con `prefers-reduced-motion: reduce` una sola regla global desactiva animaciones y transiciones, y `useCountUp` salta directo al valor final.

## 7. Pruebas y verificación

- **Pruebas existentes:** las 426 de cliente y las 4 E2E siguen pasando en cada tarea. Los textos, roles y nombres accesibles que ya fijan no cambian. La única excepción es el control de tema: `client/test/components/header-theme.test.tsx` fija los dos `<select>` actuales y se actualiza junto con el menú nuevo, que conserva los nombres «Tema» y «Modo».
- **Pruebas nuevas:** anillo del cronómetro (rol, nombre, últimos 5 s, no anuncia cada segundo); menú de tema con teclado y su persistencia; cadena de respaldo del arte (oficial, sprite, bola); marcador y `useCountUp` con y sin «reducir movimiento»; `Avatar` determinista y con contraste; `artworkUrl`; y que ninguna imagen decorativa tenga texto alternativo.
- **Contraste:** `client/test/theme/tokens.test.ts` se amplía a todos los pares de color nuevos en los 4 temas y modos, incluido el texto sobre los dos extremos de cada degradado de tipo.
- **Verificación visual real:** recorrer cada pantalla en el navegador contra el servidor local, en los 4 temas y modos, en 375 px y en escritorio, y pasar la auditoría de contraste del navegador (`client/scripts/contrast-audit.js`).
- **Portafolio:** el README gana capturas de las pantallas principales.
- **Mutaciones:** romper a propósito las protecciones nuevas (`useReducedMotion`, la cadena de respaldo del arte, el contraste de los degradados) y comprobar que las pruebas las detectan.
- **Entrega:** rama `etapa-6-rediseno`, una tarea por área (tokens y tipografías, kit de componentes, acceso, lobby, sala, partida, perfil, cierre), revisión final independiente, fusión en `main` y subida; Render redespliega solo.

## 8. Riesgos

- **Tamaño del trabajo:** unas 1.700 líneas de interfaz. Se mitiga yendo de abajo arriba (tokens, kit, pantallas) y con las pruebas verdes en cada tarea.
- **Disponibilidad del arte:** las imágenes vienen de `raw.githubusercontent.com`, no de un CDN pensado para ello. Para un portafolio basta; la cadena de respaldo evita pantallas rotas si falla.
- **Peso de las imágenes:** el arte oficial pesa decenas de KB cada una; por eso se limita a pocas imágenes por pantalla (sección 6).
- **Contraste sobre degradados:** el texto debe pasar AA sobre ambos extremos; lo verifica una prueba, no el ojo.
- **Arranque en frío de Render:** el aumento de peso (fuentes y JavaScript) debe respetar el presupuesto de la sección 3 para no alargarlo.

## 9. Fuera de alcance

Sonido, confeti, funciones nuevas, cambios en `server/` o `shared/`, otros idiomas, modo sin conexión, y reemplazar PokeAPI como origen del arte.

## 10. Aparte: `TRUST_PROXY` en Render

Durante la revisión del sitio en vivo se comprobó que `TRUST_PROXY=1` es demasiado bajo para Render: seis intentos de login fallidos seguidos no llegan a bloquearse, así que los límites por IP casi no protegen. No forma parte de esta etapa, pero se corrige antes de empezar, como cambio pequeño en `render.yaml` (probar `2`) con las dos pruebas de la sección 5 de `docs/despliegue.md`.
