# Sistema de movimiento Web

Core y Enhanced incluyen el mismo archivo de tokens. CSS y Web Animations usan esas duraciones y curvas.

| Token | Valor | Uso |
|---|---:|---|
| `--motion-instant` | 80 ms | Feedback inmediato disponible para estados |
| `--motion-fast` | 140 ms | Presión, relleno del icono y salida de preview |
| `--motion-normal` | 210 ms | Entrada de identidad, preview y foco contextual |
| `--motion-select` | 280 ms | Desplazamiento del carrusel y confirmación de Favoritos |
| `--motion-slow` | 420 ms | Entrada del backdrop preparado |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Estado de color, relleno y borde |
| `--ease-enter` | `cubic-bezier(.16,1,.3,1)` | Aparición de artwork y texto |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Salida breve del portal |
| `--ease-emphasized` | `cubic-bezier(.2,.78,.25,1)` | Desaceleración del carrusel |
| `--ease-tactile` | `cubic-bezier(.2,.8,.3,1.15)` | Presión y pulso corto |

Los desplazamientos se limitan a 2 px en elevación y 5 px en entrada. La presión escala a 0.97. El pulso de confirmación escala el corazón hasta 1.12, mientras el botón conserva su geometría. La sombra señala elevación sin animar un desenfoque grande.

El Hero conserva el título activo mientras descarga el backdrop siguiente. Al llegar la imagen, cambia el conjunto de artwork y metadata en la misma operación. La imagen nueva entra desde 74 % de opacidad sobre la superficie del Hero. Un fallo muestra el título correcto con la reserva de arte correspondiente. La rotación sigue siendo voluntaria. La generación anterior se descarta cuando cambia la selección o se desmonta el Hero.

El carrusel expande el ancho final de la tarjeta una sola vez y anima las posiciones con `transform`. Las capas de artwork usan una única transición de opacidad. La fila nativa y el panel conservan su posición vertical. El portal de preview abre tras unos 300 ms de intención con ratón o 650 ms de foco en TV. Los 120 ms de gracia se reservan al recorrido entre tarjeta y portal. Scroll, Escape y navegación retiran el portal inmediatamente.

Favoritos mantiene el estado anterior durante la petición. El cambio de `aria-pressed`, relleno y color se produce tras la confirmación de Jellyfin. El Hero, el carrusel y la preview comparten el estado confirmado. Si falla, se conserva el estado previo y se anuncia el error.

Las transiciones de ruta siguen a cargo de Jellyfin. Core anima discretamente el título de la ficha visible sin cambiar su capa de navegación ni retrasar Back. Con `prefers-reduced-motion: reduce` se mantienen foco, indicadores y formas de estado. Las entradas, traslaciones y pulsos se suprimen.
