# Sistema de diseño — revisión web

Especificación de trabajo, 23 de octubre de 2026. No representa aún una release validada. Basada en las capturas reales, `04.png`, cinco fotogramas del GIF de 5,4 segundos y la auditoría de Web10.10.6.

## Composición

Core es completo sin hero: cabecera compacta, My Media discreto, filas próximas y cards con texto/acciones disponibles. El contenido determina el alto, sin espacios reservados para Enhanced. Fondo casi negro neutral, surfaces escalonadas, tipografía del sistema, blanco para Play y azul suave para foco. Una línea/borde debe distinguir selección además del color.

Desktop comparte una línea de inicio para encabezados, hero y filas. Gutters fluidos de 24–80px; el hero tiene ancho máximo de composición, borde sutil y radio propio. En ultrawide las filas aprovechan la pantalla con cards que crecen moderadamente, sin transformar un poster en una miniatura ni llenar toda la pantalla con una sola imagen.

Detalle pre10.11: composición controlada de fondo, poster y contenido; el poster conserva su rol y no puede ensancharse al viewport. Texto con ancho de lectura de 60–68ch. Logo contenido, título accesible, metadata breve, acciones principales próximas y secciones secundarias de reparto/relacionados/técnica debajo. Música usa portada cuadrada; episodios apaisados; no se fuerza 2:3 a todo.

Móvil reorganiza: fondo más corto, bloque de título/metadata/CTA legible, poster pequeño cuando aporta información, acciones envolventes y tracks de ancho disponible. No hay expansión hover ni texto esencial oculto para ganar espacio. Landscape corto, zoom y títulos largos forman parte del diseño, no son correcciones posteriores.

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

## Compatibilidad

Primitivas compartidas y contratos estructurales separados. Un selector pre10.11 requiere `.detailPagePrimaryContainer.detailRibbon` con `infoWrapper`; uno posterior requiere el ribbon hijo. El build Core sigue siendo autocontenido. No cargar perfiles de geometría incompatibles por un simple ancho de pantalla. La detección de MUI aislado no identifica Modern. Cualquier versión no ejecutada permanece UNVERIFIED.

## Criterios de comparación

Capturas Stock/ElegantFin/Core1/nuevo con idénticos fixtures, viewport, fuentes cargadas y estado de scroll. Medir además: ancho/alto/rol de cada artwork, posición de CTA, texto presente, separación de filas, foco visible, desplazamiento por hover, overflow y targets. La valoración estética se acompaña de revisión humana de las capturas; no se convierte en un porcentaje automático de superioridad.

La cuadrícula mínima incluye 1920×1080, 2560×1440, 3440×1440, 3840×2160; 768×1024 y1024×768; 320×740,360×800,390×844,430×932 y844×390; TV Web1080p/4K. Arte completo y ausencias de logo/backdrop/Primary/overview, título largo, muchos géneros, 4K/HDR, colección, serie, episodio y música.
