# Sistema de diseño — revisión web

Revisión del candidato Web 1.1.0-dev.3. Apple TV aporta la referencia de una composición centrada en el artwork, con lectura localizada y una acción principal clara. La referencia de Netflix aporta el ancho diferencial de la tarjeta activa y la información situada debajo del arte. JellyTV conserva sus propios controles, identidad y datos de Jellyfin. [Apple TV](https://tv.apple.com/) · [Netflix](https://www.netflix.com/)

## Composición

Core es completo sin hero: cabecera compacta, My Media discreto, filas próximas y cards con texto/acciones disponibles. El contenido determina el alto, sin espacios reservados para Enhanced. Fondo casi negro neutral, surfaces escalonadas, tipografía del sistema, blanco para Play y azul suave para foco. Una línea/borde debe distinguir selección además del color.

Escritorio comparte una línea de inicio para encabezados, Hero y filas. El Hero usa un degradado localizado bajo el texto y otro que lo funde con el borde inferior. El logo y el título de reserva comparten un área estable. El Play claro y las acciones secundarias oscuras conservan la misma jerarquía en el carrusel y la ficha.

En Web 10.10.6, el fondo opaco del wrapper cortaba el artwork justo antes del título. La ficha Legacy conserva el póster en flujo y funde el fondo desde su capa real. En escritorio el campo compartido mide hasta el 76 % del alto o el 39 % del ancho. En el modo compacto se desvanece la imagen inline. Ambas soluciones conservan la proporción del original y el encuadre superior. Los panoramas extremos aún pueden perder parte de los bordes, ya que Jellyfin 10.10.6 no aporta un punto focal a Core. La ficha conserva sinopsis, secciones técnicas y todos los enlaces nativos de Tags, en una zona de ancho acotado.

En móvil se acorta el fondo y se preservan los objetivos táctiles de 44 px. Los seis indicadores caben en una fila con puntero grueso y se mantiene el gesto de deslizamiento. Con teclado siguen disponibles las flechas de los selectores. El ancho de los tracks se adapta al espacio disponible.

## Componentes y estados

| Componente | Core | Enhanced opcional |
|---|---|---|
| Home | Navegación y filas compactas, My Media de menor protagonismo | Hero integrado y elección acotada de candidatos |
| Card | Artwork por rol, título/progreso, hover/foco/pressed, acciones nativas | Preview contextual tras intención; nunca relayout de la fila |
| Detail | Fondo/Primary/Logo separados; lectura y controles nativos | Enriquecimiento sólo si aporta datos reales sin duplicar ficha |
| Carousel | Scroll nativo y flechas/foco claros | Manual, swipe, rotación voluntaria y pausa por interacción |
| Music | Artist/Album/Tracks y Now Playing coherentes | No introducir un segundo reproductor |
| Admin | Colores/surfaces legibles, geometría administrativa | Ninguna composición cinematográfica |
| Loading/error | Geometría estable, mensajes nativos visibles | Petición cancelable, retry explícito y fallback por imagen |

La preview desktop se abre con pointer fino y hover sostenido; teclado tiene acceso equivalente. TV mantiene foco inmediato y revela contexto sólo al detenerse. No secuestrar foco, ocultar título/progreso ni bloquear D-pad. La tarjeta sigue navegando con tap móvil. Trailers automáticos quedan fuera del diseño inicial; no se reproducirá audio sin acción.

El corazón cambia de silueta y relleno con el estado real de Favoritos. La animación es secundaria a la señal persistente y a `aria-pressed`. [Sistema de movimiento](MOTION_SYSTEM.md)

## Compatibilidad

Primitivas compartidas y contratos estructurales separados. Un selector pre10.11 requiere `.detailPagePrimaryContainer.detailRibbon` con `infoWrapper`; uno posterior requiere el ribbon hijo. El build Core sigue siendo autocontenido. No cargar perfiles de geometría incompatibles por un simple ancho de pantalla. La detección de MUI aislado no identifica Modern. Cualquier versión no ejecutada permanece UNVERIFIED.

## Criterios de comparación

Capturas Stock/ElegantFin/Core1/nuevo con idénticos fixtures, viewport, fuentes cargadas y estado de scroll. Medir además: ancho/alto/rol de cada artwork, posición de CTA, texto presente, separación de filas, foco visible, desplazamiento por hover, overflow y targets. La valoración estética se acompaña de revisión humana de las capturas; no se convierte en un porcentaje automático de superioridad.

La evidencia de esta iteración usa activos sintéticos y contiene la comparación de escritorio y móvil, cambios de estado, vistas de detalle, transiciones y métricas de frames. Los dispositivos físicos quedan fuera de esa evidencia. En una futura adaptación Android TV conviene trasladar el fundido por capas y el corazón relleno, ajustando las duraciones a las primitivas nativas.
