# Carrusel con tarjeta activa expandida

Componente de Enhanced en desarrollo. La referencia visual inspira una fila de altura estable: una tarjeta seleccionada panorámica, vecinas compactas y un panel de información debajo. No introduce un catálogo ni una API de recomendaciones externos.

## Integración

`ExpandingCarousel` se exporta desde `enhanced/carousel.mjs`. Instanciar después del hero:

```js
this.carousel = new ExpandingCarousel({
  host: this.host, after: this.hero.root, items,
  adapter: this.adapter, session, signal
});
```

`plugin.mjs` ya lo instancia y `build.mjs` concatena `carousel.css` con el CSS de Enhanced. Al ocultar Home se llama `carousel.pause()`; al desmontarlo, `carousel.destroy()`. También se destruye al abortar la señal recibida. La instancia expone `root`, `index`, `items`, `lastFocus`, `navigationIntent` y `select(index, options)` para validación/restauración de foco del controlador. La instancia no modifica las filas nativas.

## Datos y artwork

- Comparte los seis ítems acotados que ya recibió Home: no añade una consulta inicial.
- La tarjeta activa utiliza Backdrop o Thumb horizontal. Primary permanece en su caja secundaria contenida si falta fondo; nunca se ensancha para fingir un backdrop.
- Vecinas usan Primary; Thumb/Art alternativos se contienen, sin deformar su proporción.
- Logo se contiene en una región propia. Si falta o falla, se conserva el título tipográfico.
- Imágenes compactas son lazy; paisaje y logo se asignan por primera vez solo al seleccionar ese ítem.
- Metadata, progreso, Play/Resume y favoritos usan el modelo/adaptador existente. Un cambio confirmado de favoritos actualiza el resto de superficies mediante el canal de UserData de la sesión.

## Interacción

Mouse fino: 300ms de intención. Cambios geométricos sin movimiento físico no encadenan selecciones. Salir cancela intención. TV: foco inmediato y selección tras 650ms; no se cambia el foco al expandir. Teclado: izquierda/derecha, Home/End, abajo para acciones y arriba/Escape para volver a la tarjeta seleccionada. Dirección horizontal respeta RTL. Tocar selecciona; swipe horizontal cambia el ítem. El desplazamiento vertical de Home permanece disponible. El componente permite pinch zoom, pero el viewport nativo de10.10.6 lo bloquea; no se promete esa función en ese cliente. Los botones de siguiente/anterior también permiten recorrer la fila.

La selección no abre la ficha: Más información es una acción explícita, al igual que Reproducir/Continuar y Favorito. No hay tráiler ni audio automático ni rotación automática.

## Lookdev y movimiento

Rail con radio medio, foco visible y borde activo. La tarjeta activa mantiene relación panorámica aproximada16:9; las compactas2:3. El panel reserva filas para título, metadata, sinopsis, acciones, progreso y estado, evitando saltos verticales cuando faltan datos. El texto visible se limita por líneas; su texto accesible y el acceso a la ficha permanecen disponibles.

La geometría final se aplica una vez y las tarjetas se trasladan con FLIP durante260ms; el backdrop aparece por opacidad. No se anima width/height ni se escala el póster. Reduced motion suprime esas animaciones. Se evita `scrollIntoView` para que la selección cambie únicamente el scroll horizontal del rail, no la posición vertical de Home.

## Estado de validación — 29 de octubre

JS `5ae3f1ed…`, CSS `224f761c…`, Core `e165b30f…`. Chrome25/Edge24/Chromium24/Firefox23/WebKit23 casos PASS. Los informes `docs/validation/vnext/carousel-ENGINE.json` conservan hashes, capturas y controles.

Se verificaron roles de imagen, intención/cancelación mouse300ms, focoTV650ms, panel y scroll vertical estables, roving keyboard, Escape, RTL, zoom de texto200%, targets44px, favoritos persistentes/restaurados por API, Info/Back con retorno de foco, fallbacks y reduced motion. Play/Resume usan reproducción nativa real en Chrome. Swipe touch nativo y tap posterior pasan en Chrome/Edge/Chromium; Firefox/WebKit no certifican ese gesto físico.

El rail aísla touchstart/pointerdown del pan de pestañas nativo sin preventDefault; pointerup confirma taps cortos y suprime el click/foco tardío duplicado. La superficie conserva `pan-y pinch-zoom`; tres controles CDP verifican pan vertical y dos dedos sin cambiar selección ni navegar, con el CSS previo y el mismo JavaScript. No certifica zoom físico: también está bloqueado en Stock por el viewport nativo.

WebKit cargaba el JS antiguo instalado en el laboratorio después de recargar, por el service worker. Se corrigió el aislamiento del runner y se conservó el fallo original; no se alteró el plugin por ese diagnóstico. Los contextos interceptados bloquean service workers. La suite independiente installer-browser.json pasa ocho casos de instalación, actualización, rollback y desinstalación en Chrome/WebKit con archivos reales, perfiles persistentes y service worker activo, sin interceptar recursos ni vaciar caché.

La auditoría automatizada no sustituye contraste manual/lector ni equipos físicos. La aceptación global permanece abierta; ver `ACCEPTANCE_VNEXT.md`.

Los degradados de las tarjetas se ampliaron para proteger títulos largos sobre fondos claros.
