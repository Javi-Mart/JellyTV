# ElegantFin: baseline de calidad para JellyTV siguiente versión

Investigación: **2026-10-23**, America/El_Salvador. Fuentes primarias: código, releases, README e issues de los mantenedores. Este documento registra investigación estática; **no acredita comparación visual ejecutada en el servidor real**. No se modificó CSS/JS de JellyTV durante esta investigación.

## 1. Baseline identificable

| Referencia | Versión estable consultada | Commit fijado | Papel en la comparación |
| --- | --- | --- | --- |
| [ElegantFin original](https://github.com/lscambo13/ElegantFin/releases/tag/v26.09.05) | v26.09.05 | `5efc1105e9a56424d2252d73c04cafe484fb9e92` | Baseline principal para el frontend Legacy compatible |
| [Companion para Modern](https://github.com/mihaif7/elegantfin-jf12/releases/tag/v26.10.13) | v26.10.13 | `f390b76c5bf852af6523a1aab4ef4b2b68766c2f` | Capa adicional, solamente si el entorno auditado usa Modern de Jellyfin 12 |

La API de GitHub `releases/latest` y los refs de ambos tags confirmaron esos commits. El build estable original tiene **78.810 bytes**, SHA-256 `779aa801b912d21089d488ddf5a426fc8c02970ec953566ceee416e0d8bce643`; su fuente legible, **108.373 bytes**, SHA-256 `2155ddec54716675e8938aacb74ad66faa8b6793245b844432afd4e8219a8a66`. El companion tiene **84.662 bytes**, SHA-256 `e8443da56f445dce0bd2672ea9d78057f041ac39771cdf5e0fe1575bad07a6b1`.

Descargas exactas, sin depender del alias mutable `main`:

- [Build estable original](https://raw.githubusercontent.com/lscambo13/ElegantFin/5efc1105e9a56424d2252d73c04cafe484fb9e92/Theme/ElegantFin-jellyfin-theme-build-latest-minified.css).
- [Fuente legible original](https://raw.githubusercontent.com/lscambo13/ElegantFin/5efc1105e9a56424d2252d73c04cafe484fb9e92/Theme/ElegantFin-theme-v26.09.05.css).
- [Companion Modern fijado](https://raw.githubusercontent.com/mihaif7/elegantfin-jf12/f390b76c5bf852af6523a1aab4ef4b2b68766c2f/Theme/ElegantFin-jf12-modern-v26.10.13.css).

Copias de lectura, licencias y respuestas API están en `.lab/research/elegantfin-vnext/`. No son dependencias de producción ni se incorporan al CSS de JellyTV. El stable actual **no prueba cuál está cargando el usuario**: se deben registrar URL, bytes, hash, overrides y add-ons de su hoja efectiva, porque un import con `@main` puede conservar un build en caché. La galería upstream todavía muestra v25.08.02; no debe presentarse como captura de v26.09.05. [README fijado](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/README.md).

## 2. Compatibilidad y variantes

La versión REAL del usuario sigue siendo un dato que debe venir de la auditoría de su instalación, no de estas referencias. El anuncio oficial explica que **10.11.x fue la última rama con el prefijo 10; la siguiente es 12.x**. No corresponde inventar un adaptador `11.x` por abreviar `10.11.x`. [Numeración oficial](https://jellyfin.org/posts/jellyfin-release-12.0/).

| Frontend detectado | Baseline candidato | Qué comprobar antes de elegirlo |
| --- | --- | --- |
| 10.10.x / estructura anterior a 10.11 | Stable original con sus reglas históricas | DOM efectivo, imágenes y ribbon; soporte reciente no implica validación exhaustiva de cada versión antigua |
| 10.11.x Legacy | Stable original | README declara pruebas en Server 10.11.11, Edge y Android 2.6.3; registrar también versión Web real |
| 12.x Legacy desktop/mobile | Stable original | El mantenedor declara soporte Legacy; no trasladar esa declaración a Modern |
| 12.x Modern desktop/mobile | Original + companion, en ese orden | Presencia de `.MuiAppBar-root`, palette MUI, espaciador del header y toolbar secundaria; verificar el parche sobre la versión exacta |
| TV Web Legacy | Original, con revisión específica de D-pad | No equiparar CSS de TV Web con Android TV nativo; existen incidencias con títulos largos |
| Motor embebido antiguo | Medir individualmente | El original limita soporte de JMP/TV antiguos; el companion incorpora fallback sin `:has()` para JMP 1.12, sin demostrar compatibilidad universal |

ElegantFin añadió soporte inicial de 10.11 en [v25.10.27](https://github.com/lscambo13/ElegantFin/releases/tag/v25.10.27). Su autor confirma Legacy y pospone compromiso con Modern en [#309](https://github.com/lscambo13/ElegantFin/issues/309#issuecomment-5600787192). El companion se presenta como capa temporal, no reemplazo, y declara Modern 12.0 + ElegantFin v26.09.05 o posterior. [README companion fijado](https://github.com/mihaif7/elegantfin-jf12/blob/f390b76c5bf852af6523a1aab4ef4b2b68766c2f/README.md).

Se encontró además [deepakcloudsoffical/ElegantFin_v12](https://github.com/deepakcloudsoffical/ElegantFin_v12). Su README consultado conserva el import upstream y referencias a pruebas 10.11.1; el nombre del repositorio no acredita una adaptación Modern funcional. No se selecciona como baseline hasta demostrar diff, release y recorrido reproducible. Para 10.11, los parches históricos previos a v25.10.27 no deben apilarse automáticamente encima del stable actual.

## 3. Arquitectura y decisiones de diseño observadas

El original utiliza una hoja principal amplia, variables CSS compartidas, snapshots por release, build minificado y add-ons separados. PostCSS/cssnano generan los builds; no necesita JavaScript propio para sus estilos. Importa Inter e iconos de Google: la comparación debe esperar fuentes y registrar fallos/red externa. JellyTV no necesita heredar esas dependencias. [Configuración del build](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/package.json).

El companion organiza reglas por componentes y conecta tokens de ElegantFin con `--jf-palette-*`. Su geometría Modern se limita principalmente con `body:has(.MuiAppBar-root)`; añade ramas para motores sin `:has()`. La presencia de MUI en un diálogo aislado no identifica por sí sola el layout. [Fuente companion](https://github.com/mihaif7/elegantfin-jf12/blob/f390b76c5bf852af6523a1aab4ef4b2b68766c2f/Theme/ElegantFin-jf12-modern-v26.10.13.css).

| Área | Qué se estudió | Criterio propio para JellyTV |
| --- | --- | --- |
| Home / densidad | Márgenes compartidos, recuento adaptable de cards, proporción especial de My Media y Continue Watching | Core debe componer filas completas sin reservar espacio para un Hero inexistente; medir primera fila visible y separación útil |
| Details / artwork | Tratamientos separados de `.itemBackdrop`, `.detailLogo`, `.detailImageContainer .card`, `.backdropCard` y `.squareCard` | Limitar por rol y contenedor; conservar poster útil y fallback correcto; no tratar todos los tipos como backdrop |
| Series / seasons | Grid de metadata, orden de Next Up/temporadas y grid de episodios con imagen 16:9 | Mantener continuidad y lectura; probar episodio que hereda un poster de serie, no solo thumb perfecto |
| Hover / pressed | Escala pequeña, contorno, brillo y acciones nativas; no constituye una preview contextual con metadata enriquecida | Diseñar intención y delay propios en Enhanced; Core conserva feedback y acciones; expansión sin relayout ni pérdida de texto |
| Navegación | Superficie y blur local de cabecera, tabs/pills, ajuste al desplazamiento y safe areas | Separar header Legacy/MUI; asegurar hit testing, foco, barra de scroll y retorno desde player |
| Dialogs / player | Superficies consistentes; fullscreen en pantallas bajas; seekbar y controles tratados individualmente por motor | Preservar labels/roles y geometría interactiva real; no cubrir Close ni desplazar la posición calculada del seek |
| Music | Album/artist y tracks reciben reglas específicas; clear logo de artista opcional | Mantener portada cuadrada, nombre disponible y jerarquía de tracks; no forzar composición de película |
| TV Web | Foco explícito, reordenación de tracks y reducción de algunas animaciones | Contorno inmediato y detalle demorado; probar D-pad rápido, títulos largos y foco restaurado sin depender de mouse |

Observaciones de código: cards y episodios en [líneas 433–1128](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/Theme/ElegantFin-theme-v26.09.05.css#L433), details en [1137–1653](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/Theme/ElegantFin-theme-v26.09.05.css#L1137) y agrupación de metadata en [2942–3137](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/Theme/ElegantFin-theme-v26.09.05.css#L2942).

## 4. Selectores, responsive, movimiento y límites

El cambio anterior/posterior a 10.11 aparece en reglas diferentes para `.detailPagePrimaryContainer.detailRibbon` y `.detailPagePrimaryContainer > .detailRibbon`, además de `.detailPagePrimaryContent`. Este es un ejemplo de **cambio de estructura**, no un problema que se resuelva aumentando especificidad global. Para JellyTV, inventariar ambas formas y los selectores realmente presentes, sin aplicar todas las ramas simultáneamente.

Los breakpoints de cards del original van de 30em a 300em, con puntos 48.125, 62, 80, 100, 120, 140, 170, 200, 220, 240 y 270em. El header usa 75/100em; dialog usa 80em o altura 45em; móvil apaisado usa altura 40em. El companion mezcla 600/767px, orientación y 75em para MUI. Estos números describen su implementación, **no son especificación para copiar**. Deben compararse densidad, zoom y longitudes reales antes de escoger tokens JellyTV.

La revisión del CSS estable no encontró `prefers-reduced-motion` ni `focus-visible`; sí estilos de `.show-focus:focus`. Incluye transiciones de ancho de card y animaciones de backdrop/logo que JellyTV no debe trasladar. El companion condiciona algunas animaciones a `prefers-reduced-motion: no-preference`, pero eso no desactiva todas las heredadas. La propuesta JellyTV requiere un sistema único de movimiento, transform/opacity, reducción global coherente y comprobación de teclado y lector de pantalla. La fuente estática por sí sola no prueba 60 FPS ni accesibilidad.

Hay decisiones de ElegantFin incompatibles con esta fase: oculta por defecto `.detailImageContainer .card` y reabre tipos concretos; oculta título cuando existe logo; reduce algunas acciones/ratings por configuración. **No copiar ese mecanismo para arreglar la imagen gigante ni ocultar información útil.** El fallo de la captura `02.png` debe trazarse hasta el nodo, tipo de imagen, regla ganadora y dimensiones en el DOM real.

## 5. Cambios recientes y casos de regresión derivados

| Evidencia upstream | Estado publicado / alcance | Prueba que requiere JellyTV |
| --- | --- | --- |
| [v26.09.05](https://github.com/lscambo13/ElegantFin/releases/tag/v26.09.05) | Seekbar, hit testing de top bar, scroll snap móvil, Legacy 12 logo/créditos/música y gaps | Click/touch en extremos del seek, navbar funcional y separación estable tras Back |
| [v26.06.06](https://github.com/lscambo13/ElegantFin/releases/tag/v26.06.06) | Hover atascado, menú contextual recuperado, orden de Collections, grid/alineación y Firefox slider | Hover→Detail→Back; menú disponible en keyboard/móvil; colección no pierde información |
| [Companion v26.09.21](https://github.com/mihaif7/elegantfin-jf12/releases/tag/v26.09.21) | Espacio reservado cuando episodio usa poster de serie, Next Up/temporadas y gaps de sección | Episode con fallback portrait + logo, sin solapamiento de título |
| [Companion v26.10.07](https://github.com/mihaif7/elegantfin-jf12/releases/tag/v26.10.07) | Botones New Collection/Playlist y alineación OSD | Toolbar completa y tamaños consistentes, también con textos largos |
| [Companion v26.10.13](https://github.com/mihaif7/elegantfin-jf12/releases/tag/v26.10.13) | Fallback sin `:has()` para JMP 1.12; header vacío sobre player | Mostrar limitación real del motor, no declarar soporte nativo a partir de un navegador moderno |
| [#312](https://github.com/lscambo13/ElegantFin/issues/312), abierta | Título largo de episodio rompe TV 4K reportado | Título extremo + zoom + D-pad sin overflow ni foco oculto |
| [#317](https://github.com/lscambo13/ElegantFin/issues/317), abierta | Play existe en DOM pero desaparece en móvil 12.2 reportado | Acción realmente visible y tocable, no solo `count()>0` |
| [#310](https://github.com/lscambo13/ElegantFin/issues/310), abierta | Close de playback info no clicable reportado | Abrir/cerrar overlay, Escape/Back y retorno de foco |
| [#311](https://github.com/lscambo13/ElegantFin/issues/311), abierta | Padding de Collections en Android Modern reportado | Captura y bounding boxes en móvil; evitar doble espaciador |
| [#319](https://github.com/lscambo13/ElegantFin/issues/319), abierta | Override antiguo de transparencia falla en 12.2 reportado | Registrar overrides cargados; no confundir API de tokens antigua con regla rota del nuevo tema |
| [#267](https://github.com/lscambo13/ElegantFin/issues/267#issuecomment-4618453579), cerrada | Clipping 1440p/4K no reproducido después; causa no confirmada | Incluir Firefox, zoom y escala fraccional; no atribuir una corrección específica sin evidencia |
| [#308](https://github.com/lscambo13/ElegantFin/issues/308#issuecomment-5322682388), cerrada | Capa duplicada deliberada quedaba visible al quitar su blur | Evitar duplicar artwork para profundidad; **no es evidencia de la causa de la captura JellyTV** |

Los issues son reportes, no fallos verificados localmente. Cerrado tampoco significa que el cambio exacto esté identificado; la tabla conserva esa distinción.

## 6. Comparison lab: protocolo antes de implementar

1. Registrar Server/Web reales por separado, URL local auditada, build/hashes, navegador, layout, viewport, DPR, zoom, tema base, CSS global/personal, plugins visuales, idioma, usuario y permisos. Guardar solamente evidencias saneadas.
2. Congelar fixtures y estado de usuario: mismos IDs, orden, filtros, favoritos y progreso. Incluir A–L pedidos: metadata completa, sin logo/backdrop/poster/overview, título largo, muchos géneros, 4K HDR, colección, serie, episodio y música. No sustituir silenciosamente artwork imperfecto por imágenes más favorecedoras.
3. Crear cuatro brazos aislados: STOCK, ELEGANTFIN, JELLYTV_1_0_0_CORE y JELLYTV_NEW_CORE. ElegantFin debe usar la build efectiva del usuario; añadir una quinta referencia estable actual si difiere. Si Modern necesita companion, etiquetar explícitamente `ELEGANTFIN + companion` y registrar ambos hashes. No comparar con un ElegantFin deliberadamente incompatible para aparentar mejora.
4. El mismo frontend y backend deben servir a todos los brazos. Desactivar Enhanced y otros scripts visuales en la comparación Core. Reemplazar hojas únicamente en el contexto del laboratorio; no cambiar Branding global del servidor real ni ocultar errores upstream. La comparación Enhanced es un pase adicional sobre el Core aprobado.
5. Capturar Home, Movie Library/Detail, Series, Season, Episode, Collections, Search, Favorites, Artist/Album/Tracks, Player, Dialogs, Settings y Dashboard/Plugins. Capturar estado normal, hover mantenido, foco, reproducción y retorno. Esperar imágenes/fuentes con un criterio común; registrar fallbacks de red.
6. Ejecutar los viewports pedidos: 1920×1080, 2560×1440, 3440×1440, 3840×2160; 768×1024 y 1024×768; 320×740, 360×800, 390×844, 430×932 y móvil apaisado. Añadir TV Web como modo independiente, zoom 200/400%, reduced motion y navegación teclado. Chromium, Chrome/Edge, Firefox y WebKit deben conservar su evidencia separada.
7. Evaluar información visible, lectura, clics para acciones, área útil, título/metadata conservados, foco visible y densidad. Medir geometría de cada rol de artwork, huecos entre secciones, overflow de página y desplazamiento de hermanos durante hover. Capturas comparables a igual escala; no usar una puntuación estética arbitraria como sustituto de pruebas.
8. Por fallo: ANTES + nodo/regla/medición → CAUSA confirmada → cambio acotado → test → nueva captura con las cuatro variantes. Conservar fallos históricos fuera del conjunto PASS actual. Una pantalla peor que ElegantFin no se compensa con otra mejor.

Evidencias propuestas: manifiesto por escenario con versiones/hashes/configuración, captura, geometría JSON, consola, acciones y resultado. El conjunto debe pasar por revisión visual además del test automatizado. Un plan de laboratorio o investigación estática **no se marca PASS visual**.

## 7. Licencia y límites de reutilización

Ambos proyectos declaran **GPL-2.0**: [licencia original fijada](https://github.com/lscambo13/ElegantFin/blob/5efc1105e9a56424d2252d73c04cafe484fb9e92/LICENSE), [licencia companion fijada](https://github.com/mihaif7/elegantfin-jf12/blob/f390b76c5bf852af6523a1aab4ef4b2b68766c2f/LICENSE). Este trabajo usa sus resultados como referencia de calidad, sin incorporar sus reglas a JellyTV ni renombrar sus tokens. Las copias de laboratorio conservan su licencia. Si posteriormente se distribuyen referencias GPL, deben permanecer identificadas y separadas del código propio; no presentarlas bajo la licencia de JellyTV.

Pendiente para cerrar aceptación: identificar la instalación real, fijar su ElegantFin efectivo, ejecutar comparación y revisar las capturas. La investigación no demuestra que JellyTV ya supere a ElegantFin.
