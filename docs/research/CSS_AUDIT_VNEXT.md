# Auditoría CSS/Enhanced de JellyTV 1.0.0

Fecha: 23 de octubre de 2026. Fase: auditoría previa a implementación. **No se ha modificado ninguna regla CSS ni JavaScript runtime.** Las decisiones siguientes son propuestas; la validación visual de la instalación real sigue siendo una actividad separada.

## Evidencia y alcance

Se leyeron todos los módulos de `theme/` y `enhanced/`, build/instalador y las pruebas relevantes. No se encontraron `AGENTS.md` en el proyecto ni en sus padres consultados. Se revisaron la petición y las capturas suministradas: Home de baja densidad, ficha con una segunda imagen desmesurada, plugins y referencias Apple TV/Netflix. Una captura no identifica por sí sola la versión, el elemento DOM ni la regla ganadora.

El inventario inicial trataba el servidor real como desconocido. Durante la auditoría el usuario confirmó **Server/Web 10.10.6, commit Web c335a3024, CasaOS, Brave y Chrome**. La inspección del agente principal observó `layout-desktop`, ausencia de `data-theme` y Core dentro de `cssBranding` en el login real. Son datos distintos de las pruebas históricas: éstas corresponden al laboratorio aislado **Server/Web 12.2**, exigido explícitamente en `tests/e2e/global-setup.mjs:7–12`. No se puede trasladar su PASS a la instalación 10.10.6.

Fuentes oficiales consultadas mediante solicitudes de sólo lectura:

- [Release Web 10.10.6](https://github.com/jellyfin/jellyfin-web/releases/tag/v10.10.6), cuyo tag resuelve a `c335a3024e436fb347078d4f657ba647647676e6` mediante la API GitHub.
- [DOM de detalle 10.10.6](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/controllers/itemDetails/index.html).
- [Controlador de detalle 10.10.6](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/controllers/itemDetails/index.js).
- [Estilos nativos 10.10.6](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/styles/librarybrowser.scss).

La comparación local usa también el árbol fijado de Web 12.2 `61b1f890365ad15138e943e694af723c1d47df2a`, conservado por JellyTV 1.0.0. Este documento distingue la incompatibilidad estática confirmada de la medición pendiente de la ficha real.

Recuento con PostCSS sin escribir archivos: **181 reglas / 484 declaraciones en Core** y **78 reglas / 222 declaraciones en Enhanced**. Hay **7 declaraciones `!important`**, todas comentadas: foco/reduced-motion (5), radio action sheet (1), padding móvil (1). No existe `width:100vw` en estas hojas. Eso no elimina el riesgo: `width:100%` con un containing block de página puede producir el mismo ancho excesivo.

## Incompatibilidad de detalle confirmada en las fuentes

| Contrato | Web 10.10.6 oficial | Web 12.2 usado por JellyTV1.0 | Consecuencia en JellyTV |
|---|---|---|---|
| Imagen y contenedor | `primaryContainer > infoWrapper > detailImageContainer` (`index.html:7–9`) | Imagen desktop hija directa de `primaryContainer` (`index.html:7–8`) y segunda imagen móvil | El selector `web.css:192` de hijo directo no alcanza la imagen 10.10.6. |
| Ribbon | El controlador añade `detailRibbon` al propio `primaryContainer` (`index.js:556`) | Ribbon es otro hijo del contenedor | `web.css:206–212` presupone un hijo y modifica el propio grid en 10.10.6. |
| Posición de card | `position:absolute !important` (`librarybrowser.scss:857`) | La fuente local 12.2 usa posición relativa (`:827`) | `web.css:197` intenta `position:relative` sin `!important`; no gana a 10.10.6. |
| Límite de ancho | Nativo limita card a `25vw` (`:859`, `:896`) | JellyTV confía en columna grid | `web.css:200–202` impone `width:100%;max-width:none;max-height:none` sin comprobar relación estructural. |

**Mecanismo técnicamente sustentado:** una card que sigue siendo absoluta, con ancho100% y sin max-width, puede resolver su ancho contra un ancestro posicionado amplio; el grid que JellyTV esperaba no contiene la imagen del modo previsto. Además el mismo nodo actúa como grid y ribbon. Esta combinación explica un riesgo concreto de expansión y solapamiento en10.10.6. La ficha real debe confirmar el containing block, dimensiones, cascada y tipo de imagen antes de declarar cerrada su causa exacta.

El tratamiento de imagen es además incompleto: Core no tiene una regla para `.detailLogo` y el selector de card no distingue Primary/Backdrop/Thumb/Art/Banner. La fuente nativa asigna formas según metadata; Primary de álbum o de una persona no es siempre poster2:3. No solucionar con una proporción universal ni ocultando el nodo.

Hipótesis que deben comprobarse en la misma película de la captura:

| Hipótesis | Prueba necesaria |
|---|---|
| H1: card absoluta ensanchada por la incompatibilidad anterior | Elemento real y ancestros, `position`, `offsetParent`, rectángulos, regla ganadora de ancho/límites, comparación al desactivar sólo esas declaraciones temporalmente. |
| H2: imagen secundaria/fallback tiene rol diferente al supuesto poster | Tipo de `/Images/{type}`, ImageTags, PrimaryImageAspectRatio y dimensiones originales; no inferir el tipo de su apariencia. |
| H3: CSS efectivo contiene overrides/imports o caché de otra variante | Hash y orden de cssBranding/hojas/imports, caché/service worker y reglas ganadoras; una sola variante por contexto de comparación. |
| H4: combinación backdrop/logo/ribbon reserva regiones incompatibles | Geometría de todas las capas, márgenes/paddings, posiciones antes/después y mismo scroll con stock/ElegantFin/JellyTV. |

No existe evidencia para atribuir este fallo a Fanart, TMDb u otro proveedor. La presencia de sus tarjetas en Plugins tampoco prueba la procedencia de una imagen concreta.

## Clasificación completa por bloques fuente

Los intervalos agrupan reglas contiguas con la misma responsabilidad y cubren todos los módulos CSS. `KEEP` conserva intención/contrato, sujeto a revalidación10.10.6. `REFACTOR` cambia diseño o alcance. `REMOVE` señala declaraciones sin consumo o sustituciones necesarias, nunca eliminación de controles/artwork. `VERSION-SPECIFIC` exige una familia de DOM comprobada. Nada se ha eliminado todavía.

### Tokens y base

| Archivo/líneas | Decisión | Acción |
|---|---|---|
| `tokens.css:2–34,38–56` | REFACTOR | Conservar paleta semántica, fuente local y targets; separar diseño/compatibilidad. Crear motion tokens completos; densidad/cards fluidas y Core sin dependencia del hero. |
| `tokens.css:35,37` | REMOVE | `--blur-none` y `--blur-medium` carecen de consumidores en theme/Enhanced. Retirar del núcleo o documentar como API reservada; comprobar overrides del usuario antes de retirar API pública. `--blur-small` sí se consume. |
| `tokens.css:58–95` | VERSION-SPECIFIC | Puente `--jf-palette-*` exige `:root[data-theme]`: no aplica al login real observado10.10.6. No extrapolar slots MUI. Preservar exclusión dashboard. |
| `base.css:3–54` | KEEP | Tipografía, wrap, texto secundario, selección y scrollbars sin forzar display. Confirmar slots y marcador admin. |
| `base.css:56–62` | REFACTOR | Margen único de secciones y headings; medir suma de espacios nativos y diferenciar Home/detalle. No atribuir todo el hueco a estos2rem sin geometría. |
| `base.css:64–67` | KEEP | Superficies de lista/card dependientes de tokens. |

### Componentes

| `components.css` | Decisión | Acción |
|---|---|---|
| `2–39` | REFACTOR | Radios/sombras/textos/footer/overlay de cards: distinguir My Media, película, episodio, álbum y Continue Watching. Conservar padders nativos. |
| `41–43` | KEEP | Overlay visible con foco; verificar acceso/nombres de acciones. |
| `45–59` | KEEP | Indicadores/progreso real, contrastes sobre artwork y estado no sólo por color. |
| `61–73` | KEEP | Primitivas de listas y texto que puede encogerse; composición nueva de temporadas/música por separado. |
| `75–110` | KEEP | Botones/targets con exclusión OSD; preservar semántica primaria/secundaria/destructiva. |
| `112–132` | REFACTOR | Disabled/pressed/busy/skeleton parciales. Busy sólo cambia cursor, no reserva geometría; completar matriz de estados. |
| `134–199` | KEEP | Inputs/labels/errores/checks/switches/sliders; probar slots de versión sin perder estados ni validación. |
| `201–208` | KEEP | Diálogos y superficies sin interferir con apertura/cierre. |
| `210–213` | VERSION-SPECIFIC | `!important` de radio action sheet vence regla upstream conocida; conservar sólo donde resulte necesario. |
| `215–266` | KEEP | Menús, selección, tooltip, avatar, alertas, cabeceras/pies y backdrop de diálogo; revalidar admin/contraste. |

### Navegación, filas y ficha

| `web.css` | Decisión | Acción |
|---|---|---|
| `3–22` | REFACTOR | App bar siempre opaca/scrim; diseñar estado Home-top/scroll sin revelar header Legacy oculto ni alterar OSD. |
| `24–53` | REFACTOR | Tabs/header/drawer genéricos; jerarquía de navegación sin hardcodear bibliotecas ni reemplazar router. |
| `55–67` | REFACTOR | Anchuras de rails casi fijas; añadir densidad medible para1440p/ultrawide/4K y My Media. Grids necesitan criterio propio. |
| `69–73` | VERSION-SPECIFIC | Clipping de `.animatedScrollX` por `:has()`. Proteger foco y decidir capa/portal antes de incorporar expansión. No ocultar overflow a nivel página. |
| `75–88` | REFACTOR | Flechas, espacio de foco, escala/sombra y paddings deben diseñarse como conjunto. |
| `90–114` | VERSION-SPECIFIC | Backdrop/pseudo-elemento/wrapper/ribbon: estructura diferente confirmada10.10.6. |
| `116–178` | REFACTOR | Buenas primitivas de título/acciones/overview/tracks, sin composición completa por tipo de contenido/artwork. |
| `181–195` | VERSION-SPECIFIC | Grid y fila de imagen exigen árbol12.2; no activar con10.10.6. |
| `196–204` | REMOVE / sustituir | Retirar de capa compartida width100% y límites none aplicados a cualquier card de detalle. Sustituir por límites por rol y contrato estructural; conservar imagen útil. |
| `206–219` | VERSION-SPECIFIC | Ribbon/content como ítems de grid; incorrecto si ribbon es el mismo contenedor. |
| `222–260` | KEEP | Búsqueda y login con ancho legible, verificando selectores reales. |
| `262–283` | KEEP | Player sólo chrome; mantener vídeo/subtítulos/gestos/tiempo/stacking nativos. |

### Responsive, TV Web y accesibilidad

| Archivo/líneas | Decisión | Acción |
|---|---|---|
| `tablet.css:1–7` | REFACTOR | Densidad y altura hero; unificar con composiciones responsive. |
| `tablet.css:9–19` | KEEP | Gutter header y tracks; confirmar targets. |
| `tablet.css:22–27` | VERSION-SPECIFIC | Variante del grid12.2 para900–1199px. |
| `mobile.css:1–26` | REFACTOR | Tokens/header/login/search: diseño móvil propio. |
| `mobile.css:28–50` | KEEP | Diálogos con límites y acciones envolventes; comprobar landscape/zoom. |
| `mobile.css:53–101` | VERSION-SPECIFIC | Ficha presupone estructura/utilidades nativas; posición absoluta!important10.10.6 también afecta esta rama. Padding!important documentado debe revisarse contra versión real. |
| `mobile.css:103–115` | KEEP | Targets coarse sin intervenir OSD; medir todos los controles, no sólo hero. |
| `mobile.css:117–125` | REFACTOR | Alturas fijas landscape; validar textos/acciones reales. |
| `tv-web.css:1–61` | KEEP / refinar tokens | Activación por layout, navegación nativa, gutters y foco inmediato; foco mantenido contextual como capa cancelable. |
| `tv-web.css:63–66` | VERSION-SPECIFIC | Otra variante de grid, misma incompatibilidad. |
| `tv-web.css:68–74` | KEEP | Tipografía y action sheet TV. |
| `tv-web.css:76–88` | REFACTOR | Salto de tamaños en2560px CSS; no confundir viewportCSS/framebuffer/dispositivo físico. |
| `animations.css:1–41` | REFACTOR | Transform/opacity son buena base, pero hover inmediato no es preview intencional; faltan delays/curvas/estados coherentes. |
| `accessibility.css:1–33` | KEEP | Outline e inset para foco, inputs y disabled; conservar reparación upstream. |
| `accessibility.css:35–57` | KEEP | Reduced-motion; extender a slots nuevos y cambios de estado inmediatos. |
| `accessibility.css:59–103` | KEEP | Contraste y forced-colors con colores del sistema/bordes. |

### Enhanced CSS

| `enhanced/hero.css` | Decisión | Acción |
|---|---|---|
| `1–19` | REFACTOR | Min-height y ancho del host, sin max-width cinematográfico; integrar primera fila y fallback, preservando aislamiento/touch-action. |
| `21–45` | REFACTOR | Capas backdrop/shade válidas sólo para ese rol; no trasladar100%cover a Primary/Logo. |
| `47–101` | REFACTOR | Jerarquía/body/meta/overview; conservar título accesible y logo contain con límites. |
| `103–163` | KEEP / unificar tokens | Wrap,44px,pressed/disabled/focus; eliminar duplicación de valores mediante tokens comunes. |
| `165–201` | REFACTOR | Indicadores/navigation; dot anima width, sustituible por transform/opacity. Preservar targets y opt-in. |
| `203–245` | KEEP | Progreso real, estado accesible, hidden local y texto accesible. Hidden funcional no es workaround de imagen rota. |
| `247–254` | KEEP / unificar motion | Hover sólo mouse; timings/colores compartidos. |
| `256–348` | REFACTOR | Breakpoints/alturas propios y recorte72%; integrarlos con Core, variantes de artwork y layout. |
| `350–383` | KEEP | Reduced-motion/forced-colors; título permanece cuando se omite arte decorativo por accesibilidad. |

## Auditoría de Enhanced JS

| Archivo/líneas | Decisión | Hallazgo |
|---|---|---|
| `model.mjs:2–18,39–51` | KEEP / ampliar | Texto seguro, límites/deduplicación y rutas. Strings loading/show/movie sin consumo: usar o retirar; reforzar tipos al ampliar campos. |
| `model.mjs:21–36` | REFACTOR | Metadata sólo año/clasificación/community rating/dos géneros. `imageSpec` distingue Logo y todos los demás kinds caen a Backdrop: añadir Primary/Thumb/Art/Banner requiere contrato exhaustivo, con unknown seguro y parent ID/tag emparejados. |
| `adapter.mjs:7–33,50–74` | KEEP / VERSION-SPECIFIC | Identidad activa, abort, favoritos/reproducción/router. Confirmar rutas/métodos10.10.6; `session()` llama serverId sin comprobar antes esa capacidad. |
| `adapter.mjs:35–47` | REFACTOR | Consulta acotada correcta; solicita Taglines/PrimaryImageAspectRatio sin consumirlos. Campos mínimos por componente, caché y carga bajo demanda. |
| `plugin.mjs:7–37,60–123` | KEEP | Singleton, generaciones, deadline, cleanup, caché, retry y restauración de foco. |
| `plugin.mjs:39–58` | VERSION-SPECIFIC | Host fijo/events/hidden dependen del frontend; conservar observador local, nunca ampliarlo a document permanente. |
| `hero.mjs:3–37,165–184,230–258` | KEEP | DOM textContent, iconos, estado y limpieza; delegación nativa de acciones. |
| `hero.mjs:39–163,186–229` | REFACTOR | Separar composición, artwork e interacción; conservar rotación opt-in/pausas/swipe/async. Preview como componente propio reutilizando acciones, no otra implementación de favoritos/playback. |
| `scripts/build.mjs:7–23`, `scripts/install.mjs:99` | VERSION-SPECIFIC | Build etiqueta12.2 e instalador Enhanced sólo admite12.2. No saltar guard para instalar en10.10.6; crear contrato y manifiesto de compatibilidad probado. |

## Lagunas de fixtures y tests

Los helpers guardan PNG (`tests/e2e/helpers.mjs:83–104`); no hay `toHaveScreenshot`/`toMatchSnapshot` ni comparación stock/ElegantFin/current/new. Las capturas son evidencia para inspección, no equivalencia visual automatizada. El PASS histórico no certifica superioridad respecto a ElegantFin.

| Requisito | Cobertura1.0 / laguna | Próxima prueba |
|---|---|---|
| Imagen gigante | `validate-core.mjs:77` registra poster, pero `verifyGeometry:98–104` no limita sus dimensiones/proporción. Imagen enorme de ancho de página puede pasar noOverflow. | DOM10.10.6 real, regla!important y tipo artwork; assert por rol de ancho/alto/ratio, contención, logo no recortado, CTA accesible. Debe fallar con1.0 y pasar después. |
| A: película completa | Artwork1600×900, poster400×600, logos simples y dos géneros (`generate-fixtures.py:17–62`). | Ratios extremos, logos altos/anchos, fondos claros/detallados y campos reales sanitizados. |
| B: sin logo | Alterna logo en`:96`; no prueba exhaustiva de composición del detalle. | Título tipográfico Hero/ficha en todos los tamaños. |
| C/D: sin backdrop / sin poster | Sólo ausencia de todo artwork (`:100–104`). | Ausencias independientes con Thumb/Art/Banner disponibles; fallback por rol. |
| E: sin Overview | Metadata siempre crea plot. | Vacío/null/ausente, sin huecos ni CTA inestable. |
| F: título largo | Existe en`:93`, pero E2E ficha usa The Quiet Horizon. | Detalle explícito con/sin logo, zoom e idiomas. |
| G: muchos géneros | Dos géneros; unidad sólo truncado. | Muchos géneros/studios/people y acceso a información completa. |
| H:4K HDR | Medios720p/360p SDR; viewport4K no es mediaHDR. | Metadata/streams realistas, badges correctos; separar decodificación no ejecutada. |
| I: colección | Dos ítems y navegación en extended. | Arte/descripción/fechas/orden/progreso y conjunto extenso/sin artwork. |
| J/K: serie/episodio | 1serie,2temporadas,6episodios y rutas reales. | NextUp ausente, episodio/título largo, serie completa/en emisión, herencia de arte ausente. |
| L: música | Dos tracks y captura álbum; folder reutiliza poster vertical (`generate-fixtures.py:117–122`). | Cover cuadrado, artista, álbum, pistas, NowPlaying, cola/reproducción. |
| CoreHome | Setup fuerza ContinueWatching primero (`global-setup.mjs:36–49`). | Home como captura: MyMedia primero, dos bibliotecas, sin progreso/NextUp, distintas preferencias; no reordenar usuario real para mejorar demo. |
| Ultrawide |3440×1440 ausente en matrices. | Añadir con densidad/anchos útiles y mismo contenido. |
| Hover/foco | Sin preview, delay/cancelación ni layout-shift. | Hover intencional/salida rápida/edges/scroll/touch/TV/Escape/foco; medir CLS y clipping. |
| Motion | Capturas desactivan animación; performance mide navegación/counters, no FPS. | Movimiento normal y reducido, frames/reflow/CLS/red por interacción. No marcar60FPS sin medición. |
| Admin/player | Recorridos anteriores útiles pero versión distinta. | Marcador admin real, plugins grid, dialogs, forced/SDH/CC/audio activo/targets. |

Las pruebas previas se conservan como regresión funcional. No ejecutar scripts de laboratorio que modifican preferencias/progreso contra producción. El inspector/debug solicitado debe ser opt-in, sin alterar layout, mostrar rol/selector/dimensiones/contenedor/ratio y no persistir tokens, URLs firmadas ni datos privados.

## Arquitectura de compatibilidad propuesta

1. Identificar Server/Web/layout/base-path, CSS efectivo y capacidades por separado en REAL_ENVIRONMENT_AUDIT; completar la reproducción de la ficha real.
2. Compartir tokens de diseño/artwork/motion; Core debe funcionar sin Enhanced y sin que la calidad dependa de un hero.
3. Separar adaptadores CSS de detalle/rails/header10.10.6 y12.2. Nombres iguales no equivalen a contratos iguales. Usar estructura inequívoca o build seleccionado por manifiesto; no aplicar todos los parches por versiones indiscriminadamente. Si falla el contrato, conservar layout nativo y decoración segura.
4. Normalizar roles primary/backdrop/logo/thumb/art/banner con ratio, máximo, contain/cover y fallbacks permitidos. Álbum/persona no heredan poster de película. CSS limita nodos nativos comprobados; Enhanced comparte vocabulario/modelo.
5. Adaptador JS por capacidades reales: API Jellyfin como única fuente, sesiones/router/player nativos, campos acotados y caché. Hero/preview comparten acciones, montaje/cleanup; sin polling/observerglobal/preloadmasivo ni llamadas directas a proveedores.
6. Aislar administración/reproductor y preservar utilidades hidden/permisos/foco. `!important` sólo contra declaración upstream comprobada. No asumir que CSS en `@layer` ganará a upstream sin capas; comprobar cascada antes.
7. Comparison lab con mismo ítem/usuario/viewport/scroll por stock/ElegantFin estable fijado/JellyTV1.0/candidato; variantes mutuamente exclusivas. Medir artwork, información visible, densidad, legibilidad, acciones y foco; inspección visual además del diff.

Esta clasificación precedió a la implementación. Al24deoctubre ya existen `home.css`, `compat/details-legacy.css`, tokens compartidos y el modelo de roles Enhanced. El perfil10.10.6 mantiene un único override de posición nativa!important, resetea transformTV y el flex de labels de tracks. Los wrappers genéricos usan `display:contents`, mientras encabezados/acciones conservan sus nodos. Los selectores12.2 excluyen el contrato `.detailRibbon` anidado.

El candidato7985d738 pasó las comprobaciones de geometría en cinco motores, pero las nuevas capturas revelaron un logo solapado que esas pruebas no detectaban. El candidato596e1197 reserva logo/gap en flujo y añade intersecciones logo/póster,título,acciones. Requiere retest visual. AndroidTV permanece intacto. **No hay aceptación visual final ni compatibilidad nueva certificada.**
