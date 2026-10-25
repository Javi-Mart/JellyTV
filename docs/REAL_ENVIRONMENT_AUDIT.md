# Auditoría del entorno real — revisión de JellyTV 1.0.0

23 de octubre de 2026. **Aceptación reabierta.** El PASS de la entrega anterior corresponde a Web 12.2; no certifica la instalación 10.10.6 del usuario. No se ha aplicado ninguna corrección a producción.

## Entorno identificado

| Dato | Evidencia | Resultado |
|---|---|---|
| Despliegue | Información del usuario | Jellyfin (Nvidia GPU), App Store de CasaOS |
| Server | Usuario y GET público `/System/Info/Public` | **10.10.6**, Jellyfin Server |
| Web | Información de versión del usuario; tag oficial cotejado | **10.10.6**, `c335a3024e436fb347078d4f657ba647647676e6` |
| Navegador original | Usuario | Brave; mismo defecto en Google Chrome; versiones exactas aún no registradas |
| Layout observado | DOM de login, Home y Movie Detail | `html.layout-desktop`, sin atributo `data-theme`; shell Legacy, no Modern 12 |
| Componentes | DOM y bundles públicos | Shell `.skinHeader`, componentes `.emby-*`, `.card`, `.detailRibbon`; bundles React/MUI presentes no convierten estas vistas en Modern |
| CSS activo | GET `/Branding/Css`, comparado byte a byte | Core 1.0.0 exacto: SHA-256 `f9d2e3af06ce25d75876af66d00a46edda405186e13a8afd02832859851896e3` |
| Enhanced activo | Hoja y pantalla inspeccionadas | La captura y la sesión corresponden a Core; no se observó hero JellyTV |
| ElegantFin del usuario | Declaración del usuario | Usa build estable; import y bytes exactos aún no registrados. Baseline público fijado por separado |

El acceso real se limita a lectura y navegación. Favoritos, reproducción, usuarios, metadata, plugins y configuración no se modifican para validar. La réplica 10.10.6 utiliza exclusivamente `127.0.0.1:18997`, directorio `.lab/vnext-10.10.6`, datos y credenciales separados del laboratorio anterior y de producción.

## Ficha rota: causa confirmada

**ANTES:** la imagen bajo el backdrop ocupa casi todo el ancho y tapa/desplaza la información. Se reprodujo en la película de `02.png` mediante la sesión real.

**CAUSA:** en 10.10.6 el árbol es `primaryContainer.detailRibbon > infoWrapper > detailImageContainer > card`. JellyTV 1.0.0 esperaba el árbol posterior `primaryContainer > detailImageContainer`, con un ribbon hijo separado. El CSS nativo 10.10.6 mantiene `position:absolute !important` en la card. La regla de JellyTV intenta `position:relative` sin vencerla, pero sí aplica `width:100%; max-width:none; max-height:none`. La card absoluta resuelve ese ancho sobre el contenedor amplio, fuera de la columna prevista.

Medición real, viewport de inspección **1046×884 CSS px**:

| Nodo | Relación / estilo calculado | Tamaño CSS px |
|---|---|---:|
| `.detailPagePrimaryContainer.detailRibbon` | `position:relative;display:grid` | ancho 1036 |
| `.detailImageContainer` | Padre `infoWrapper`; `position:static` | 230,414 × 0 |
| `.detailImageContainer .card.portraitCard` | `position:absolute`, límites `none` | **1036 × 1554** |
| `.cardImageContainer` de esa card | Ruta de imagen `Images/Primary`, `background-size:cover` | **1036 × 1554** |
| `.itemBackdrop` | Región distinta, `position:relative` | 1036 × 442 |

La imagen enorme es **Primary**, no otro backdrop ni un fallo demostrado de Fanart. El hash activo descarta una mezcla de otra versión de Core en Branding para esta observación. El perfil10.10.6 ya corrige posición y límites; la geometría del candidato7985d738 pasó en cinco motores. Una incidencia posterior de logo solapado exige retest del build actual.

**SOLUCIÓN implementada:** `theme/compat/details-legacy.css` exige el contrato `.detailPagePrimaryContainer.detailRibbon`, conserva el poster y le da límites propios. Vence únicamente la posición upstream que lo requiere, documentando ese `!important`; mantiene card y proporción nativas. El perfil posterior queda separado en las reglas existentes.

**VALIDACIÓN requerida:** mismo tipo de ficha 10.10.6 con Stock/ElegantFin/Core1/Core nuevo; tamaño máximo de poster, relación de aspecto, título/CTA visibles, ausencia de superposición, retest de móvil/zoom y de la estructura 12.2 por separado.

## Selectores y contratos

| Selector/contrato | Estado 10.10.6 | Cambio necesario |
|---|---|---|
| `.skinHeader`, `.headerTabs`, `.emby-tab-button` | Válidos en shell observado | Refino visual y densidad sin duplicar navegación |
| `:root[data-theme]` y puente palette 12 | No aplica al shell observado | Adaptación de paleta Legacy explícita |
| `.detailPagePrimaryContainer > .detailImageContainer` | No coincide | Perfil estructural anterior a 10.11 |
| `.detailRibbon` como hijo independiente | Supuesto falso | Aquí es el mismo primaryContainer; reglas separadas |
| `.detailPagePrimaryContent` como hijo del grid | Supuesto falso | Está dentro de `.detailPageContent` |
| `.detailImageContainer .card` | Coincide, pero reglas peligrosas | Límites y posición por estructura/rol |
| `.detailLogo` | Existe; oculto por responsive nativo en ancho inspeccionado | Composición y límites propios, validar móvil y desktop |
| `.scrollSlider`, cards portrait/backdrop | Presentes | Medir márgenes acumulados, My Media y acciones nativas |

Clasificación completa KEEP/REFACTOR/REMOVE/VERSION-SPECIFIC: [auditoría CSS](research/CSS_AUDIT_VNEXT.md). Fuentes oficiales: [HTML 10.10.6](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/controllers/itemDetails/index.html), [controlador](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/controllers/itemDetails/index.js), [estilos nativos](https://github.com/jellyfin/jellyfin-web/blob/c335a3024e436fb347078d4f657ba647647676e6/src/styles/librarybrowser.scss).

## Metadata observada y límites

La UI de la película real muestra nombre y título original, año, duración, clasificación, ratings, tagline, overview, géneros, reparto, estudios, enlaces de proveedores y selección de vídeo/audio/subtítulos. El vídeo seleccionado se identifica como 4K HEVC Dolby Vision/HDR10. Hay Primary, Logo y fondo. Esto acredita la información expuesta en esa ficha, no presencia universal de todos los campos ni reproducción HDR verificada.

La captura de Plugins muestra los ocho proveedores indicados por el usuario. Estado Active no prueba qué proveedor rellenó cada dato. No se han extraído credenciales ni publicado IDs, rutas de medios o respuestas privadas. La API y fixtures se contrastan en la réplica; una muestra DOM no se etiqueta como respuesta API autenticada.

## Comparación y decisión de arquitectura

ElegantFin estable público está fijado en [su investigación](research/ELEGANTFIN_BASELINE_VNEXT.md). El baseline inicial en `comparison/10.10.6/baseline.json` contiene9pantallas por tres temas y dos tamaños; la primera iteración nueva también tiene capturas. No cubre aún13pantallas ni certifica el CSS actual. Completar cuatro contextos aislados Stock/ElegantFin/Core1/Core nuevo, con layout móvil real y Enhanced desactivado en cada uno. Nunca apilar temas.

La nueva arquitectura conserva Core CSS autónomo y Enhanced opcional. Separa primitivas compartidas de adaptaciones estructurales pre10.11 y posteriores. Los selectores de geometría exigen la relación DOM que realmente estilizan; no se selecciona una variante por la versión de Server únicamente. Enhanced debe comprobar el contrato de cliente/router/API 10.10.6 antes de activarse. Android TV permanece en su versión anterior hasta estabilizar el diseño web.

## Incidencia adicional: título gráfico detrás del póster

Las capturas posteriores del usuario muestran el borde inferior del logo tapado por el póster. La medición ya guardada del candidato7985d738, fixtureA en1920×1080, contiene el mismo fallo: logo `y129,59375 + h129,59375`, póster `y248,390625`; intersección vertical10,796875px. Limitar ambos tamaños no evita una colisión si el logo sigue absoluto y el foreground sube mediante un margen negativo independiente.

La corrección actual pone el logo en flujo con su altura/gap reservados, limita su rol con `contain` y garantiza espacio bajo la cabecera. Solo si hay logo se neutraliza el offset duplicado del wrapper; las fichas sin logo conservan su composición compacta. Móvil define su propia altura, separación y margen seguro. El test ahora comprueba intersección con póster,título yacciones, además de dimensiones. La unidad confirma que el caso anterior falla el guard; **la nueva captura y prueba de navegador siguen pendientes** por el límite de cuota del revisor automático de permisos.

**Estado:** implementación activa, build/lint/35unidades PASS; aceptación de la siguiente versión **PENDIENTE**. No se ha publicado una nueva release. Ver [estado completo](ACCEPTANCE_VNEXT.md).
