# Subasta Pokémon v2, proyecto 1: nueva puja — diseño

Cambia partes de [`2026-10-31-subasta-pokemon-design.md`](2026-10-31-subasta-pokemon-design.md). Donde se contradigan, manda este documento. Boceto aprobado: https://claude.ai/artifact/Fd8Rc1o9aXhQxpnKh4pTmR (privado de Marco; sus fondos se versionan en el repositorio).

## 1. Por qué

Marco jugó con un amigo: «se sintió muy rápida y no se entendía el juego». No se entendía cómo pujar, había poco tiempo y no se sabía de quién era el turno. Los objetos le parecen innecesarios. La pantalla no aprovecha el espacio y le falta color. No le molesta que las partidas duren más.

Este es el primero de tres proyectos, en este orden, cada uno jugable por separado:

1. **Nueva puja** (este documento).
2. Aspecto del combate estilo Showdown: de espaldas y de frente, escenarios pixel art.
3. Movimientos y habilidades reales: 4 movimientos fijos por Pokémon, efectos comunes y unas 20–30 habilidades.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos:** que dos personas que nunca han jugado entiendan cómo pujar y de quién es el turno sin que nadie se lo explique; pensar sin prisa; pantalla colorida que use el espacio; equipos de 6.

**No objetivos:** el aspecto del combate y sus reglas (proyectos 2 y 3); historial (#40); efectos por tipo (#42).

**Antiobjetivos:**
- Que el fondo de un lote o cualquier dato delate qué Pokémon es.
- Que un jugador conectado pueda dejar al otro esperando para siempre.
- Que quede sin revelar o sin decidir alguna partida: siempre tiene que terminar.

## 3. Lo que decidió Marco

- **Sin objetos.** Se eliminan del todo.
- **6 Pokémon por jugador,** 12 lotes.
- **Sin reloj a la vista en la puja.** Se turnan subiendo o retirándose hasta que uno se retira, y el otro se lleva el Pokémon por su última puja.
- **Aviso de inactividad:** tras 60 s sin decidir, «¿Sigues ahí?» con 15 s para responder; si no responde, se retira de ese lote.
- **La silueta tiene un fondo distinto por lote, al azar,** sin relación con el Pokémon.
- **Estilo pixel art** en la subasta, con sprites reales de PokeAPI.
- **La duración más larga no importa.**
- **Retirarse es definitivo en ese lote** (2026-10-31): quien se retira ya no vuelve. Si el otro abre o ya iba ganando, se lo lleva.

## 4. Reglas

Se mantiene todo lo de la spec original que no se nombra aquí, en particular las siluetas trampa y la fórmula del precio.

### Lotes
- 12 Pokémon en orden al azar: 4 débiles, 4 medios y 4 fuertes, por tercios del total de stats.
- **Dinero inicial:** 2.000.000 como punto de partida. El simulador puede cambiarlo, igual que el multiplicador del precio. Criterios: reconocer siluetas sigue dando ventaja sin ganar siempre, y guardar dinero no es siempre lo mejor.
- **Tope de puja:** dinero menos 50.000 por cada hueco que quede después de este lote. Sube el valor si el simulador muestra que no alcanza para completar.
- **Máximo 6:** si alguien ya tiene 6, los lotes restantes van al otro a precio inicial.
- **Si los dos se retiran sin pujar:** va a quien tenga menos Pokémon, a precio inicial; si empatan, a quien empezó ese lote. Si no le alcanza, gratis. Todos terminan con 6.
- Empieza un jugador distinto en cada lote; el primero, al azar.

### Turno sin reloj
- En cada turno se puede subir (+10.000, +50.000 o +100.000; la primera puja es el precio inicial) o retirarse.
- **Retirarse:** si hay puja, el otro se lleva el Pokémon por esa puja. Si no la hay, el otro decide: abre al precio inicial y se lo lleva en ese momento, o también se retira (entonces se aplica «si los dos se retiran»). Si no le alcanza para abrir, solo puede retirarse.
- Sigue la protección `turnId` contra toques tardíos.
- **Inactividad:** a los 60 s de turno sin decidir, el servidor abre el aviso; quien tiene el turno lo ve con 15 s de cuenta atrás y el rival ve «Esperando a X…». Responder «Sigo aquí» reinicia los 60 s, **como mucho 2 veces por turno**; a la tercera vez que se abriría el aviso, se retira. Pujar o retirarse también lo cierra. Si vencen los 15 s, se retira.
- **Desconexión:** el tiempo de inactividad sigue corriendo, pero nadie se retira mientras está caído: eso lo deciden los 30 s de gracia. Si vuelve con el plazo vencido, tiene un último aviso de 15 s, que no cuenta para el máximo de 2; se da una sola vez por turno, para que recargar no dé más tiempo.
- **Lotes que se reparten solos** (alguien ya tiene 6): se muestran uno a uno, unos 2 s cada uno, con su silueta, su fondo y el sello de venta, sin turno ni botones. Las trampas también cuentan en ellos y salen en la revelación.

### Revelación y alineación
- 3 s por Pokémon, 36 s en total; se salta con «Listo» de los dos.
- Alineación de 6, 30 s. Se ordena con botones, y el titular rival sigue oculto.

### Combate
Mismas reglas que hoy, sin objetos:
- La pausa de 15 s solo sirve para elegir titular.
- Sin Revivir ni Poción ni Cinta. Recuperar y Forcejeo se quedan hasta el proyecto 3.
- Pierde quien, al acabar una pausa, no tenga Pokémon vivos.
- El resumen deja de mostrar «gastado en objetos».

## 5. Pantalla

Referencia: boceto aprobado.

**Escritorio:** tres columnas. Tu panel a la izquierda (dinero, 6 huecos con las siluetas compradas, tope de puja explicado). En el centro, la franja de turno, el escenario y los botones. A la derecha, el panel del rival y el historial de pujas del lote.

**Móvil, 360 px:** apilado: los dos jugadores en dos columnas, franja de turno, escenario, y botones sin hacer scroll en un teléfono de 760 px de alto.

**Franja de turno:** grande, amarilla si te toca y rosa si le toca al rival, con el nombre. Late suavemente si te toca.

**Silueta:** la grande sale del arte oficial, como hoy y como en el boceto, servida por `/silhouettes/:token`. Las compradas de los paneles usan la misma imagen en pequeño, porque el cliente no debe conocer el Pokémon. La revelación usa los sprites pixel art de PokeAPI.

**Botones:** dicen el salto y a cuánto queda («+50.000, queda en ₽ 260.000»). «Retirarme» dice qué ocurre: con puja, «misty se lo lleva»; sin puja, «misty decide si lo abre». Cuando no se llega a la puja mínima: «No te alcanza: solo puedes retirarte».

**Cuando le toca al rival:** un recuadro explica qué pasa («Si misty se retira, es tuyo»).

**Primera vez:** una explicación corta de cómo pujar, en 3 pasos, se ofrece la primera partida de cada navegador; se guarda en `localStorage` y se puede reabrir con un botón «?». Sin bloquear el turno de nadie.

**Fondos:** 4 PNG de 320×180 en pixel art (bosque, volcán, playa y montaña de noche), originales, escalados con `image-rendering: pixelated`, servidos desde el sitio. El servidor sortea uno por lote, sin consultar el Pokémon.

**Animaciones:** la silueta flota; venta del lote con un sello sobre el escenario; la puja salta al subir; trampa con sacudida y destello en la revelación. Con «reducir movimiento», sin desplazamientos.

**Tipografía:** Pixelify Sans en títulos y cantidades de las pantallas de subasta, empaquetada con el proyecto como las demás. El resto del sitio no cambia.

## 6. Lo que se deja al implementador

- Los nombres de campos y eventos.
- Los colores concretos, respetando 4,5:1 en los 4 temas/modos; las pantallas de subasta pueden tener colores fijos propios.
- Si los fondos se generan con un script del repositorio o se versiona solo el PNG.
- El orden de los lotes por tercios y el ajuste de números con el simulador.

**Decisiones de Claude, revisables:** dinero inicial; alineación de 30 s; que el turno no pase por desconexión; máximo de 2 «Sigo aquí»; lotes automáticos a 2 s cada uno; explicación de 3 pasos; sello de venta.

**Simulador (2026-10-31):** con 2.000.000 y 300 por punto de stats, en 500 partidas por duelo: experta 77 %, derrochadora 50 %, tacaña 38 %, equilibrada 35 %. El dinero aprieta poco: una estrategia que solo paga por los fuertes gana entre el 72 % y el 88 % y le sobra dinero. Queda así hasta probarlo con personas.

**Recarga con el aviso:** se prueba con sockets y reloj simulado, porque en la E2E exigiría esperar 60 s reales.

## 7. Criterios de aceptación

- Simulador: con los números finales, ninguna estrategia gana siempre, todos completan 6 y ningún combate queda sin terminar.
- Ni los objetos ni el reloj de la puja quedan en motor, vista, pantallas, guía ni README.
- Una partida con dos jugadores que nunca responden termina sola, y pulsar «Sigo aquí» sin parar no la alarga más allá del máximo.
- Una prueba confirma que el fondo no depende del Pokémon.
- E2E de partida completa, con recarga en una puja y en el aviso de inactividad, y con revancha.
- Navegador real a 360 y 375 px y escritorio; contraste vacío en los 4 temas/modos; «reducir movimiento».
- Revisión final independiente.
