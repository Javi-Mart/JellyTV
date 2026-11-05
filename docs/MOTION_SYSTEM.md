# Sistema de movimiento Web

Core y Enhanced incluyen el mismo archivo de tokens. CSS y Web Animations usan esas duraciones y curvas.

| Token | Valor | Uso |
|---|---:|---|
| `--motion-instant` | 80 ms | Feedback inmediato disponible para estados |
| `--motion-fast` | 140 ms | Presión, relleno del icono y salida de preview |
| `--motion-normal` | 210 ms | Entrada de identidad, preview y foco contextual |
| `--motion-select` | 320 ms | Expansión del carrusel y confirmación de Favoritos |
| `--motion-slow` | 420 ms | Movimiento pausado de superficies |
| `--motion-crossfade` | 520 ms | Mezcla de los dos backdrops y su iluminación |
| `--motion-handoff` | 170 ms | Salida del texto antes de cambiar el título |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Estado de color, relleno y borde |
| `--ease-enter` | `cubic-bezier(.16,1,.3,1)` | Aparición de artwork y texto |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Salida breve del portal |
| `--ease-blend` | `cubic-bezier(.42,0,.58,1)` | Fundido simétrico, relevo al 50 % |
| `--ease-emphasized` | `cubic-bezier(.2,.78,.25,1)` | Desaceleración del carrusel |
| `--ease-tactile` | `cubic-bezier(.2,.8,.3,1.15)` | Presión y pulso corto |

Los desplazamientos se limitan a 2 px en elevación y 5 px en entrada. La presión escala a 0.97. El pulso de confirmación escala el corazón hasta 1.12, mientras el botón conserva su geometría. La sombra señala elevación sin animar un desenfoque grande.

El Hero conserva el título activo mientras carga el backdrop siguiente. La imagen nueva aumenta su opacidad por encima de la saliente, que permanece opaca detrás hasta terminar el fundido. Al llegar al 50 %, cambia el título interactivo y entra el texto nuevo. Si el usuario pulsa una acción antes del relevo, se confirma el título que se está mostrando. Una selección nueva cancela las animaciones de la anterior y parte del último título confirmado. Si falla el backdrop, se funde hacia la superficie de reserva y se mantiene la navegación. Web Animations interpreta los tokens tanto en milisegundos como en segundos.

El carrusel mide los anchos visibles al recibir una nueva selección y anima solo las tarjetas que cambian de ancho. El layout queda acotado al carril. Los pósteres se mantienen bajo el artwork panorámico durante la mezcla y cada imagen conserva su proporción. La fila nativa y el panel conservan su posición vertical. El portal de preview abre tras unos 300 ms de intención con ratón o 650 ms de foco en TV. Los 120 ms de gracia se reservan al recorrido entre tarjeta y portal. Scroll, Escape y navegación retiran el portal inmediatamente.

La luz ambiental usa un muestreo de 12 × 8 píxeles de la imagen cargada y conserva como máximo una paleta por plaza de Hero. Solo lee imágenes del mismo origen. La luminosidad y la saturación se limitan antes de pintar dos gradientes sin filtros grandes. La luz se desvanece con el backdrop y queda estática con movimiento reducido. Se atenúa hasta desaparecer en fondos casi negros. Se omite en vistas de hasta 599 px, alto contraste e imágenes que no pueden leerse. El desmontaje cancela las animaciones y descarta la caché.

Favoritos mantiene el estado anterior durante la petición. El cambio de `aria-pressed`, relleno y color se produce tras la confirmación de Jellyfin. El Hero, el carrusel y la preview comparten el estado confirmado. Si falla, se conserva el estado previo y se anuncia el error.

Las transiciones de ruta siguen a cargo de Jellyfin. Core anima discretamente el título de la ficha visible sin cambiar su capa de navegación ni retrasar Back. Con `prefers-reduced-motion: reduce` se mantienen foco, indicadores y formas de estado. Las entradas, traslaciones y pulsos se suprimen.
