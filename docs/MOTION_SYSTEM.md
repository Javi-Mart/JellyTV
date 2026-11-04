# Sistema de movimiento — revisión web

Especificación implementada en el candidato1.1.0-dev.0. Los tiempos siguen pendientes de evaluación perceptual y medición en el build final; no representan resultados de rendimiento.

| Token | Valor inicial | Uso |
|---|---:|---|
| `--motion-instant` | 80ms | Confirmación discreta de estado |
| `--motion-fast` | 140ms | Botones, pressed, iconos |
| `--motion-normal` | 200ms | Card/foco y menús |
| `--motion-slow` | 600ms | Fondo del hero |
| `--ease-standard` | cubic-bezier(.2,0,0,1) | Cambios de estado |
| `--ease-emphasized` | cubic-bezier(.2,.8,.2,1) | Elevación contextual |
| `--ease-enter` | cubic-bezier(0,0,.2,1) | Aparición |
| `--ease-exit` | cubic-bezier(.4,0,1,1) | Salida |

Hover intencional: aproximadamente300ms, cancelado al salir/scroll/navegar. Foco TV: contorno inmediato y escala pequeña; contexto tras unos650ms, cancelado por movimiento rápido. La expansión contextual usa transform/opacity en una capa independiente: no animar ancho/alto de la fila ni reservar espacio invisible. Sin observers globales permanentes ni polling.

La gracia de120ms solo se aplica para pasar de una card a un portal ya abierto; salir antes de la intención cancela de inmediato timer/request. Escape restaura el foco sin programar otra apertura. En escritorio, Alt+ArrowDown lleva a las acciones de la preview; se muestra una ayuda y se retiran sus atributos ARIA al cerrar. TV muestra contexto sin apropiarse del foco; móvil con puntero grueso no abre previews. Interacciones preparadas en `vnext-enhanced.mjs`, ejecución pendiente.

Hero: crossfade de backdrop, lectura estable, CTA no cambia de posición. No rotar durante interacción, foco o pestaña oculta. Favorite: pressed, estado pendiente y confirmación real del servidor; no fingir éxito. Page transition: respetar router/transición nativa, sin agregar espera a Back ni superponer vistas abandonadas.

`prefers-reduced-motion: reduce`: expansión/crossfade/traslación se vuelven cambios inmediatos; se conservan foco, contorno, texto y confirmación. El modo no elimina funcionalidad. Móvil no simula hover. No declarar60FPS sin medición; comparar frames, layout shift, peticiones y listeners con baseline.
