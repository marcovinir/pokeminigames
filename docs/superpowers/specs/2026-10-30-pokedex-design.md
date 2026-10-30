# Pokédex — diseño

Diseñado con Marco el 2026-10-30. Maquetas en `2026-10-30-pokedex-maquetas/`: `pokedex-lista.html` (Marco eligió la **A, tarjetas**) y `pokedex-ficha.html`. Referencia que trajo Marco: <https://pokemondb.net/pokedex/bulbasaur>.

## 1. Intención

Marco quiere una zona complementaria para «buscar datos de un Pokémon y ver sus estadísticas para ganar partidas, aprender de Pokémon». Es algo común en páginas parecidas y hoy falta. Se compone de esta Pokédex y de la tabla de tipos (`2026-10-30-tabla-de-tipos-design.md`), de la que reutiliza la regla de efectividad.

Funciona bien si alguien busca «Charizard», o filtra por fuego y volador, abre la ficha y encuentra lo que necesita, sin cuenta y desde el teléfono, en una página que carga rápido aunque haya 1025 Pokémon.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- `/pokedex`: lista en **tarjetas** de los 1025 Pokémon, con buscador, filtro por dos tipos, filtro por generación y orden.
- `/pokedex/:id`: **ficha** con stats, tipos, debilidades, evoluciones, habilidades con su descripción y una entrada de lore.
- Públicas: con cuenta, como invitado o sin sesión.
- Un enlace «Pokédex» en el encabezado.

**No objetivos** (Marco: «lo dejamos para después»)
- Movimientos, ubicaciones, crianza, datos de entrenamiento, sprites alternativos y otros idiomas.
- Megaevoluciones, formas regionales y otras formas.
- Vista de tabla ordenable (se descartó a favor de las tarjetas).
- Todas las entradas de Pokédex de cada juego: una por Pokémon.

**Antiobjetivos** (aunque funcione, sería un fracaso)
- Que la Pokédex cambie o ralentice las partidas: el catálogo del juego y sus respuestas siguen siendo los mismos.
- Que la lista descargue de golpe 1025 imágenes en datos móviles.
- Que depender de PokeAPI en vivo pueda tumbar la página: los datos van guardados con el proyecto.
- Presentar textos oficiales como propios, sin crédito.

## 3. Lo que decidió Marco

- **Tarjetas** para la lista.
- **Filtro por dos tipos**, aunque facilite buscar respuestas de «Doble tipo» en otra pestaña: «completa, con filtro por dos tipos».
- Contenido de la ficha: «stats, tipos, debilidades, evoluciones y habilidades, lore».
- **Lore y descripciones de habilidades sí se muestran.** Primero decidió quitar el lore; tras ver que Pokémon Database lo publica, lo recuperó. Se le explicó que son textos oficiales copiados tal cual, que quedan guardados en un repositorio público y que el riesgo es bajo pero existe.
- Se llega desde el **encabezado**.

## 4. Comportamiento

**Lista.** Cada tarjeta: sprite, número, nombre en español y tipos. Buscador por nombre en español o inglés, o por número, sin distinguir tildes ni mayúsculas (`normalizeName`). «Tipo 1», «Tipo 2» y «Generación» combinables; con dos tipos salen los que tienen ambos, en cualquier orden. Orden por número (por defecto), nombre o total de stats, para compensar que las tarjetas no comparan stats de un vistazo. Si nada coincide, lo dice y ofrece limpiar los filtros. Los filtros viven en la dirección (`/pokedex?tipo1=fire&tipo2=flying&gen=1&orden=total`), y un valor desconocido se ignora sin romper la página. Se ven 60 tarjetas y «Ver más» añade 60 (imágenes con `loading="lazy"`), conservando filtros y posición al volver de una ficha.

**Ficha.** Página propia con enlace compartible (`/pokedex/6`). Cabecera con arte oficial, número, generación, nombre y tipos. Stats base con barra (escala hasta 255) y total. Daño recibido en ×4, ×2, ×½, ×¼ y ×0, con `damageTaken` de `shared`. Cadena de evolución completa, con ramas (Eevee), el Pokémon actual marcado, enlaces a cada ficha y la condición en español; si no se puede expresar, «condición especial». Si no evoluciona, lo dice. Habilidades con nombre, descripción y marca de «oculta». Una entrada de lore con el juego del que viene. Un número inexistente muestra «Ese Pokémon no existe» y un enlace a la lista. Anterior y siguiente por número.

**Textos que faltan en español.** PokeAPI no trae lore en español para al menos los Pokémon de la generación 9 (muestra: 906, 1000 y 1025 tienen 0 en español y 2 en inglés), ni descripción para algunas habilidades recientes. Se muestra el inglés con la marca «(en inglés)». Si tampoco hay inglés, se omite el bloque o la descripción. Nunca se traduce a máquina.

**Crédito.** Bajo el lore y las habilidades: «Textos oficiales de los juegos de Pokémon, © Nintendo / Game Freak / Creatures. Datos vía PokeAPI.» Aviso legal y Acerca de se actualizan para decirlo.

**Datos.** Un archivo nuevo versionado `server/data/pokedex.snapshot.json`, generado por un script a partir de PokeAPI, igual que `catalog.snapshot.json`. Sin migraciones ni base de datos: es de solo lectura y se carga al arrancar. El catálogo del juego no se toca. Rutas públicas, cacheadas como `/pokemon/names`:
- `GET /pokedex`: lo ligero de todos (id, nombres, tipos, total, generación).
- `GET /pokedex/:id`: la ficha; 404 si no existe.

El script guarda la entrada de lore más reciente en español (o, si no hay, en inglés) y el juego de origen; las habilidades con su descripción; y la cadena de evolución como datos estructurados. Las condiciones de evolución las redacta el cliente en `i18n`. Las imágenes siguen cargándose de PokeAPI, como hoy.

**Encabezado.** Igual que el enlace de la tabla de tipos: icono y texto «Pokédex» (solo icono con nombre accesible en pantallas estrechas), oculto en `/sala/:code`. Debe caber a 360 y 375 px con un nombre de 30 letras y como invitado; si no cabe, se decide con Marco antes de seguir.

**Sonido.** Con sesión suena la música de sala, como en el menú; sin sesión, silencio, como en el resto de la página.

## 5. Decisiones del implementador (de Claude, revisables por Marco)

- Solo las 1025 especies del catálogo, cada una con su forma base.
- 60 tarjetas por tanda y «Ver más» en lugar de paginación numerada o desplazamiento infinito (más simple y accesible).
- Orden y filtro por generación: los añadió Claude y Marco los aceptó en el resumen.
- Datos servidos por la API en lugar de empaquetados en el cliente, para no engordar la carga inicial.
- Páginas cargadas aparte (`lazy`).
- Enlaces a anterior y siguiente en la ficha.

## 6. Dependencias y orden

Conviene hacer antes la tabla de tipos, porque aporta `damageTaken`. Si se invierte el orden, esa función se crea aquí. Al terminar la segunda, el selector de tipos enlaza a la lista filtrada.

## 7. Criterios de aceptación

- Pruebas del script con respuestas de PokeAPI simuladas: entrada en español, sin español, sin nada, cadena con ramas y condición desconocida.
- Prueba de integridad del archivo: 1025 Pokémon, todos los destinos de evolución existen, cada uno con al menos una habilidad.
- Pruebas de rutas (lista, ficha, 404, caché, sin sesión) y de páginas: buscador, dos tipos en ambos órdenes, generación, orden, «Ver más», dirección compartible, valores inválidos, lista vacía, ficha sin evolución, con ramas y con texto en inglés.
- E2E: buscar, filtrar por dos tipos y abrir la ficha sin sesión; a 360 y 375 px, `boundingBox` del encabezado con nombre de 30 letras, tarjetas y ficha.
- Una prueba que confirme que `/pokemon/names` y las partidas siguen igual, más la E2E completa.
- Navegador real a 375 px y escritorio con imágenes reales; auditoría de contraste vacía en los 4 temas/modos.
- `docs/guia-tecnica.md`, los dos README y las páginas legales al día; prueba de humo tras desplegar.
- Revisión final independiente de la rama.
