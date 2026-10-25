# Informe de entrega — revisión 1.1 abierta

**24 de octubre de 2026: la nueva revisión NO está terminada ni aceptada.** El informe de 1.0.0 se conserva debajo como antecedente. La versión de desarrollo actual y sus comprobaciones no heredan la aceptación de Web 12.2. Ver [criterios pendientes](docs/ACCEPTANCE_VNEXT.md).

## Correcciones de la revisión actual

| Antes | Causa | Cambio aplicado | Validación disponible / pendiente |
|---|---|---|---|
| Primary podía ocupar todo el ancho de la ficha 10.10.6 | Contrato DOM distinto y card nativa absoluta `!important`, sin límites efectivos | Perfil `theme/compat/details-legacy.css`, póster en flujo con ancho 220–300px y ratio nativo | Geometría del candidato anterior: 156 casos Chrome y 36 por cada uno de otros cuatro motores; repetir con el hash actual |
| Logo gráfico parcialmente debajo del póster, confirmado en las nuevas capturas del usuario | Posición absoluta del logo independiente del inicio del grid; el test solo limitaba tamaño | Logo en flujo, altura y separación reservadas, mínimo de backdrop cuando existe logo, variante móvil | Caso capturado de solapamiento de 10,796875px incorporado al test; retest visual actual PENDIENTE |
| Salir de una card justo antes del umbral podía abrir su preview | La gracia de cierre de 120ms no cancelaba el temporizador inicial | Cancelación inmediata mientras no existe un portal abierto | E2E preparado en `vnext-enhanced.mjs`, todavía no ejecutado |
| Escape podía reabrir la preview | Restaurar foco disparaba de nuevo el manejador de entrada | Restauración protegida y atributos ARIA temporales restaurados al cerrar | E2E preparado, todavía no ejecutado |
| Favoritos podían diferir entre hero y preview | Objetos/cachés separados | Notificación por sesión tras confirmación del servidor | Unidad PASS para éxito, fallo y cambio de usuario; interacción real pendiente |

Build, lint y 35 unidades web pasan. La ejecución de navegador pendiente no pudo iniciarse porque la revisión automática de permisos agotó su cuota, no por una decisión de seguridad. No se eludió ese control. Faltan comparativa completa, E2E, inspección visual actual, accesibilidad/performance y regresión funcional en el entorno 10.10.6. No hay nueva release ni cambios Android TV en esta fase.

## Informe histórico — JellyTV 1.0.0

22 de octubre de 2026. **JellyTV 1.0.0: criterios de aceptación cumplidos en el alcance ejecutado y documentado.** La regresión final pasa con los assets de entrega y los dos arreglos del frontend identificados por SHA-256. Las plataformas UNVERIFIED permanecen explícitamente fuera de esa validación.

## Arquitectura entregada

**Core** es CSS modular autocontenido para Jellyfin Web 12.2: tokens, colores, tipografía del sistema, cards, header, login, búsqueda, bibliotecas, fichas, diálogos, formularios, OSD, responsive y foco. La administración conserva su layout original.

**Enhanced** añade un hero opcional con hasta seis películas/series accesibles al usuario: backdrop/logo, nombre alternativo, metadata, sinopsis, progreso, Play/Resume, Info y favoritos persistentes. Carrusel manual, swipe y rotación voluntaria con pausa por interacción. Delega navegación, permisos y reproducción al cliente nativo web; no mantiene otro reproductor ni catálogo. La caché se separa por servidor/usuario, las peticiones se cancelan al salir y los listeners se retiran al desmontar. Las filas conservan el orden elegido en Jellyfin.

**Android TV** es una adaptación Kotlin/XML/Compose/Leanback independiente sobre v0.19.10, commit `984181a3d6ab14e9a6d2dcc850c582e1c138bd95`. Tema opt-in, hero y acciones reales, foco y navegación nativos. Se entrega APK debug y código completo correspondiente; no es una publicación en tiendas ni CSS dentro de Android TV.

**Compatibilidad del frontend** incluye dos correcciones separadas. Quick Connect corrige una promesa rechazada del diálogo de Web 12.2 mediante un cambio acotado al call-site. El aplicador exige hashes exactos, guarda originales y permite revertir. No oculta errores globalmente. La segunda corrección cancela la carga de una ficha abandonada, evitando que aparezca sobre Inicio después de Back. Ambas son independientes de Core/Enhanced y tienen comandos de desinstalación propios.

La [investigación](docs/RESEARCH.md) y [arquitectura](docs/ARCHITECTURE.md) documentan los contratos y decisiones. Se descartaron contenido hardcodeado, imágenes de Apple, fuentes propietarias, trailers automáticos y un fork móvil innecesario. Toda metadata runtime procede de Jellyfin. El laboratorio emplea medios procedimentales propios y usuarios descartables; no se accedió a producción.

## Validación y aceptación

Los recuentos y comandos reproducibles están en [TESTING](docs/TESTING.md); los resultados de la regresión final se reúnen en [release-check.json](docs/validation/release-check.json). Cada JSON identifica el build ejecutado. No se suman reintentos, pruebas solapadas ni controles históricos como casos independientes.

| Criterio | Evidencia y alcance |
|---|---|
| Build/lint web y unidades | `npm run check`; 24 unidades, sin fallos |
| Chrome completo | 78 Enhanced y 65 Core; 13 omisiones intencionales del hero ausente en Core |
| Otros motores | Chromium/Edge/WebKit: 18 Enhanced + 15 Core por motor; Firefox: 12 Enhanced + 10 Core |
| Responsive | 13 proyectos; geometría adicional con landscape, sin overflow accidental conocido |
| Accesibilidad | 17 geometría/a11y, zoom 100/200/400%; sin hallazgos críticos/serios conocidos en los recorridos |
| Teclado y TV Web | 2 recorridos completos 1080p/4K, sin mouse, Play y retorno del foco |
| Touch y reproducción ampliada | 7 casos: swipe real, landscape, fallback, colección, búsqueda vacía, audio dual, volumen/mute/seek; 2 omisiones de touch fuera de móvil |
| Robustez SPA | 4 casos lifecycle: navegación, rotación, cancelación, timeout/reintento |
| Autenticación | Login inválido y Quick Connect reales; cero excepciones/rechazos con la corrección; cambio de usuario/permisos en sesiones nuevas |
| Administración | Dashboard, Users, Libraries y Plugins utilizables, sin overrides ni errores adicionales del tema |
| Performance | 50 ciclos por modo, un lote de candidatos; mediciones conservadas, sin errores/rechazos |
| Android build/lint | APK exacto, cero Error/Fatal de lint, 15 unidades; 6 pruebas del paquete reversible |
| Android runtime | 8/8 D-pad en salida 1080p y 8/8 en salida 4K; playback real, Resume, favorito, Info/Back, salida a filas y foco |
| Revisión visual | Capturas de todas las pantallas; clipping nativo corregido y comprobado también mediante píxeles visibles |
| Presupuesto final | Cero errores atribuibles a JellyTV, promesas sin manejar, botones muertos, traps, UI rota u overflow accidental conocidos dentro de lo ejecutado |

La matriz Chrome usa 1920×1080, 2560×1440, 3840×2160, 1366×768, 768×1024, 1024×768, 320×740, 360×800, 390×844, 430×932, 480×900 y TV Web 1920×1080/3840×2160. Se añade móvil landscape 844×390. Son píxeles CSS, no certificación de dispositivos físicos. Navegadores: Chrome 154.0.8037.100, Chromium 156.0.8078.4, Edge 155.0.4283.62, Firefox 157.0 y WebKit 27.2/Windows.

En la medición final de 50 ciclos, baseline y Enhanced terminan con **0 nodos adicionales y +50 listeners cada uno**. El heap aumenta 1,413,288 y 1,432,468 bytes, respectivamente. Inicio: 525/570 ms; 50 ciclos: 32733/33030 ms. Enhanced realiza un lote de candidatos; ambos modos registran cero errores y rechazos. Son observaciones de esta ejecución, no una garantía universal de memoria o velocidad.

## Correcciones y retest

| Problema encontrado | Cambio y comprobación |
|---|---|
| Targets menores de 44px por fuente raíz Jellyfin | Mínimo explícito y adaptación 320px; medición real en la matriz |
| Respuestas tardías/timeout al salir de Home | AbortController, generación de sesión y cleanup; lifecycle con respuesta demorada y reintento |
| Foco perdido al volver de Info | Se conserva control/título y se restaura al montar; SPA y D-pad |
| Primer clic perdido en Firefox TV | Se difiere el foco de mouse hasta click para evitar el scroll nativo entre pointerdown/up; regresión Firefox |
| Identidad HTTP distinta de la sesión activa | Se reutilizan y validan Client/Device/DeviceId/Version; unidades y comparación de sesiones |
| Swipe terminaba en pointercancel | `touch-action: pan-y pinch-zoom`; evento touch real conserva desplazamiento vertical y zoom |
| Back antes de cargar el controlador dejaba Inicio y ficha superpuestos | Cleanup del efecto activa la cancelación existente en Web 12.2; seis controles con latencia pasan y el mismo test lifecycle pasa sin modificarlo |
| Instalación interrumpida o archivos editados | Journal/hash y recuperación conservadora; pruebas de rollback y rechazo de cambios ajenos |
| Quick Connect dejaba rechazo undefined | Captura de la cancelación esperada en su creador; otros errores se propagan; autenticación estricta en tres modos |
| Lint Android heredaba 41 errores | API compatible, desugaring, API pública Leanback, plural serbio y excepciones CLDR y notificación justificadas; cero Error/Fatal, XML retenidos |
| Backdrop Android tapaba Continue watching | `cropToPadding` limita el dibujo de ImageView; XML solo no lo detectaba. Revisión visual y 2.371 píxeles claros del título en ambas configuraciones |
| Falsa configuración 4K | El framework limita UI a 1920 px; runner separa salida/framebuffer/superficie/densidad y rechaza arranque incompleto o APK distinto |

Las modificaciones de locators/esperas son correcciones de pruebas, no del producto. El primer crash aislado WebKit no se reprodujo en el control posterior ni en la matriz repetida; no se le asigna una causa no demostrada. Los fallos originales y las interrupciones ADB/arranque permanecen en el historial.

## Diagnósticos y límites reales

Los errores nativos de WebSocket403 previo al login, logout401 y HLS no fatal en el medio dual están reproducidos sin tema. Los tests conservan cada diagnóstico y solo admiten firmas/contextos/cantidades demostrados; nunca se suprimen globalmente pageerrors o rejections. Users conserva un `Unexpected null reference` upstream tanto con como sin tema. Sus controles están enlazados en [TESTING](docs/TESTING.md).

Axe conserva el aviso moderado upstream `meta-viewport`. La paleta medida no certifica todo artwork. Android lint conserva 280 warnings/440 hints heredados y cero hallazgos semánticos nuevos: PASS significa cero Error/Fatal, no ausencia de advertencias. Las decisiones están en [lint-decisions](android-tv/docs/lint-decisions.md).

**UNVERIFIED:** Safari en Apple, aplicaciones Android/iOS físicas, Media Player/Desktop empaquetados, Legacy desktop independiente, lector de pantalla, notch físico, TV físico, Google TV/Fire TV específicos, HDR, CEC y decodificador 4K de hardware. Swiftfin no soporta estas capas y no se entrega un fork. Otras versiones Jellyfin requieren nueva regresión.

El emulador Android TV API 34/WHPX verifica salida física 1920×1080 y 3840×2160, pero `config_maxUiWidth=1920` limita ambas UI a 1920×1080/320dpi. **Rasterización UI nativa 4K: UNVERIFIED.** No se presenta una captura 1080p como una UI 4K. Véanse [compatibilidad](docs/COMPATIBILITY.md) y [validación nativa](android-tv/docs/device-validation.md).

## Builds e instalación

| Archivo web | Bytes | Gzip | SHA-256 |
|---|---:|---:|---|
| [jellytv-core.css](dist/jellytv-core.css) | 36,827 | 7,554 | `f9d2e3af06ce25d75876af66d00a46edda405186e13a8afd02832859851896e3` |
| [jellytv-core.min.css](dist/jellytv-core.min.css) | 30,348 | 5,815 | `50919b65f287f9ea812a8c2bdd8158be5454d9aed949101218ff96da4978bb16` |
| [jellytv-enhanced.css](dist/jellytv-enhanced.css) | 7,352 | 2,264 | `ce3294426996da0975302e5c0137ba51bdffcac957c6c3ae35cdfb8f6b10c94d` |
| [jellytv-enhanced.js](dist/jellytv-enhanced.js) | 18,734 | 6,327 | `3a256f67a31bf94f3d4a2b720095677301b8494ab670dc04979fdc3e4cbe213f` |

Enhanced JS ocupa 6,18 KiB gzip; Core minificado + Enhanced CSS 7,89 KiB gzip. Están por debajo de los presupuestos 60/35 KiB, sin dependencias runtime ni fuentes remotas obligatorias. Los assets JellyTV solo cambian el comentario de versión de Core y los manifiestos respecto a 0.1.0. El frontend anfitrión incorpora además la corrección de navegación descubierta en la última regresión; se repite toda la matriz con ambos arreglos identificados por hash.

El [APK](android-tv/dist/jellyfin-androidtv-v0.19.10-jellytv.1-debug.apk), de 31.026.922 bytes, tiene SHA-256 `e7d31d38aee854fa1990b6e01dee9f596bab0cc8274c0ec3b11945632e942216`. Los informes 1080p/4K y build contienen ese mismo hash. El [manifiesto nativo](android-tv/dist/manifest.json) identifica también las [fuentes completas](android-tv/dist/jellyfin-androidtv-v0.19.10-jellytv.1-source.zip). Web conserva las [fuentes correspondientes a ambos arreglos](web-compat/jellyfin-web-12.2-compat-source.zip).

Instalación exacta, actualización, rollback y retirada: [INSTALL](docs/INSTALL.md) y [Android TV](android-tv/README.md). Core se pega en Branding; Enhanced usa instalador local con dry-run y respaldo; Quick Connect y navegación usan aplicadores separados. No hace falta reinstalar Jellyfin. Los parches rechazan versiones/bytes desconocidos.

## Estructura y capturas

```text
theme/          tokens y nueve módulos CSS
enhanced/       modelo, sesión/API, vista y lifecycle
web-compat/     parches Quick Connect/navegación, manifiestos, licencia y fuentes
android-tv/     parche/payload reversible, scripts, APK, fuentes y evidencia
scripts/        build, instalación, laboratorio, validación y empaquetado
tests/          unidades, integración/E2E y fixture GPL
docs/           investigación, arquitectura, manuales, JSON y capturas
dist/           cuatro assets web y manifiesto
releases/       paquete de entrega y hashes
README.md, FINAL_REPORT.md, CHANGELOG.md, LICENSE
```

- [Home laptop](docs/screenshots/enhanced-laptop-home.png), [móvil390](docs/screenshots/enhanced-mobile-390-home.png), [TV Web](docs/screenshots/enhanced-tv-1080-home.png).
- [Película](docs/screenshots/enhanced-laptop-movie.png), [player](docs/screenshots/enhanced-laptop-player.png), [subtítulos](docs/screenshots/enhanced-laptop-subtitles.png).
- [Android Home](android-tv/evidence/screenshots/runtime-1080-home.png), [detalle](android-tv/evidence/screenshots/runtime-1080-flow-detail.png), [reproducción](android-tv/evidence/screenshots/runtime-1080-flow-player.png).

El paquete excluye credenciales, sesiones, `.lab`, node_modules, traces, informes privados y logs. Se conservan los JSON sanitizados y capturas de medios originales de prueba. Código propio web MIT; Android y derivados Web GPL-2.0 con fuentes y licencias incluidas. Proyecto independiente, sin afiliación a Apple ni Jellyfin.
