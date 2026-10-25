# JellyTV — investigación y decisión técnica

Investigación iniciada el 13 y contrastada el **14 de octubre de 2026**. Esta investigación precede a la implementación. Los estados de ejecución se registrarán separadamente en `TESTING.md`; lectura de código no equivale a una prueba de cliente.

## 1. Resultado

La experiencia requiere **tres capas distintas**: un tema CSS para clientes que cargan Jellyfin Web; un módulo web opcional para el hero con datos y acciones; y una adaptación nativa independiente para Android TV. No existe un CSS que transforme Android TV o Swiftfin. La estética se comparte mediante especificación de tokens, no mediante un único runtime.

Se selecciona **Jellyfin Server y Web 12.2** como referencia, publicado el 5 de octubre: [Server](https://github.com/jellyfin/jellyfin/releases/tag/v12.2), [Web](https://github.com/jellyfin/jellyfin-web/releases/tag/v12.2). Sus revisiones publicadas son `ca0f16e` y `61b1f89`. `master` no es la base de compatibilidad. No se necesita actualizar el servidor del usuario para investigar ni probar.

## 2. Cambios que afectan el planteamiento original

La línea actual se llama 12.x, no 10.12/11.x. Desde 12.0, Modern es la interfaz predeterminada de escritorio/móvil; Legacy sigue disponible y TV usa el frontend Legacy. Los plugins de servidor anteriores requieren adaptación a .NET 10 y a las interfaces nuevas. Referencia: [anuncio oficial 12.0](https://jellyfin.org/posts/jellyfin-release-12.0/).

Por ello, reutilizar sin revisión un tema para 10.10 o seleccionar únicamente `.skinHeader` dejaría sin cubrir parte del frontend actual. La versión del servidor tampoco identifica por sí sola la versión web empaquetada por un cliente.

## 3. Server, Branding, plugins y API

Custom CSS es un mecanismo documentado de personalización. La interfaz lo permite globalmente mediante Branding y por usuario mediante Display. Solo lo aplican los clientes que utilizan Jellyfin Web. Los recursos importados se descargan desde cada dispositivo; una URL accesible al servidor puede ser inaccesible al teléfono. Se prefiere una hoja autocontenida y sin fuentes externas. [Documentación CSS](https://jellyfin.org/docs/general/clients/css-customization/).

El [BrandingController de 12.2](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/BrandingController.cs) expone configuración y CSS. Branding no es un sistema general de plugins JavaScript. Los [plugins de servidor](https://jellyfin.org/docs/general/server/plugins/) amplían el backend: su existencia no implica que puedan cambiar cualquier cliente. Las [opciones de config.json](https://jellyfin.org/docs/general/clients/web-config/) incluyen enlaces y plugins web, pero los contratos internos de estos últimos requieren fijar la versión.

El hero utilizará únicamente el servidor y usuario activos. La API de 12.2 dispone de estas operaciones, verificadas en controladores; antes de publicar se contrastarán con OpenAPI y SDK de la versión ejecutada:

| Necesidad | Operación de 12.2 | Fuente primaria |
|---|---|---|
| Bibliotecas permitidas | `GET /UserViews`, usuario actual | [UserViewsController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/UserViewsController.cs) |
| Candidatos, búsqueda y filtros | `GET /Items`, límite y campos explícitos | [ItemsController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/ItemsController.cs) |
| Continuar viendo | `GET /UserItems/Resume` | [ItemsController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/ItemsController.cs) |
| Next Up y episodios/temporadas | `/Shows/NextUp`, `/Shows/{id}/Episodes`, `/Shows/{id}/Seasons` | [TvShowsController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/TvShowsController.cs) |
| Detalle y favoritos | `/Items/{id}`, `POST`/`DELETE /UserFavoriteItems/{id}` | [UserLibraryController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/UserLibraryController.cs) |
| Backdrop, logo, poster | `/Items/{id}/Images/{type}`, tag y dimensiones | [ImageController](https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/ImageController.cs) |

No se supondrá que las rutas antiguas `/Users/{id}/Items/...` constituyen la API recomendada: varias aparecen obsoletas. Play no consiste en solicitar un archivo de vídeo: debe delegarse al reproductor del cliente para conservar transcodificación, selección de versiones, subtítulos, cast y reporte de progreso. No se usarán claves administrativas incrustadas ni se elegirá el primer servidor guardado en localStorage.

## 4. Arquitectura de jellyfin-web

Es una SPA con aplicaciones Modern y Legacy, navegación hash y componentes compartidos. Modern incorpora React/MUI/Emotion y variables de tema; Legacy conserva plantillas, controladores y componentes `emby-*`. La Home moderna reutiliza lógica de secciones existente. Deben distinguirse shell, tarjetas compartidas y contenido de las páginas.

La investigación de archivos, clases, breakpoints y ciclo de vida se desarrolla en [WEB.md](research/WEB.md). Ninguna clase interna se considerará una API pública inmutable. Se favorecerán variables upstream y clases de componente; se excluyen hashes Emotion, IDs numerados, posiciones `nth-child` y búsqueda de módulos por hashes de webpack.

El reproductor, menús, diálogos y administración conservarán su comportamiento. El tema aplicará decoración y tamaños sin reordenar acciones ni ocultar ajustes. No se convertirán temporadas, música o colecciones en copias del detalle de una película.

## 5. Compatibilidad real

“Sí” significa que el mecanismo existe, **no que JellyTV ya esté verificado**. La matriz versionada y el estado de las pruebas están en [COMPATIBILITY.md](COMPATIBILITY.md); las fuentes de clientes se conservan en [CLIENTS.md](research/CLIENTS.md).

| Cliente | Tecnología | Custom CSS | Método JellyTV |
|---|---|---|---|
| Web desktop/tablet/móvil | Jellyfin Web Modern o Legacy | Sí | Core; Enhanced si se carga su integración |
| Web modo TV | Jellyfin Web Legacy, navegación espacial | Sí | Core TV y Enhanced con controles de foco |
| Jellyfin Media Player 1.12 | Qt WebEngine + reproducción nativa | Sí en UI web, motor antiguo | Core limitado por motor; Enhanced depende del web que carga |
| Jellyfin Desktop 2.0 | Cliente sucesor; publicación preliminar | Parte web | Evaluar por separado, no convertir prerelease en requisito estable |
| Android Mobile | WebView + shell/reproducción nativos | Parte web | Reutilizar Core; Enhanced depende de entrega web |
| Jellyfin Mobile iOS | Contenido web + integración nativa | Parte web | Reutilizar Core; no estiliza controles nativos |
| Android TV | Kotlin, Compose y Leanback | No | Adaptación nativa específica |
| Google TV | Cliente Android TV | No | Misma adaptación nativa; probar dispositivo |
| Fire TV | Cliente Android TV, entorno Amazon | No | Misma base; validación independiente |
| Swiftfin iOS/tvOS | Swift/SwiftUI y reproducción nativa | No | Requiere cambios del cliente; fuera de Core/Enhanced web |

Un WebView no implica que el CSS alcance reproductores externos, pantallas iniciales, permisos del sistema o menús nativos. Tampoco implica que una transformación del webroot del servidor llegue a un cliente con web empaquetado localmente.

## 6. Temas y gestores estudiados

Se revisaron Ultrachromic, Scyfin, ZestyTheme, ElegantFin, Finimalism, Jellyfin Theme Guide y varios proyectos denominados Skin/Theme Manager. [COMMUNITY.md](research/COMMUNITY.md) contiene enlaces, versiones, código inspeccionado, limitaciones de evidencia y problemas reportados.

Conclusiones: modularidad y tokens son buenas bases; las hojas para generaciones distintas del frontend deben separarse; los selectores posicionales y offsets extensos son frágiles; `latest` dificulta reproducibilidad. Un gestor puede facilitar la instalación pero no debe ser requisito de Core. No se copiará ningún tema completo ni se combinarán varios temas sobre el mismo DOM.

## 7. Hero: alternativas y decisión

| Aproximación | Ventajas | Costes / límites | Decisión |
|---|---|---|---|
| Solo CSS | Instalación y rollback simples | No consulta catálogo ni crea acciones/rotación accesible | Core, sin prometer hero funcional nuevo |
| Media Bar | Funcionalidad existente y amplia | Inyección, dependencias internas y licencia restrictiva según repo | Referencia; no copiar |
| Media Bar Enhanced | Plugin con funciones avanzadas y versión para 12 | Su inyector inspeccionado puede escribir index.html; mantenimiento y comportamiento propios | Alternativa documentada, no dependencia |
| Jellyfeatured | Recomendaciones integradas | Cobertura/mantenimiento más limitados; no Android TV | No base del producto |
| File Transformation + módulo propio | Evita parche permanente del webroot si se configura exclusivamente así | Plugin de terceros, versión/orden de carga y bridge web por validar | Transporte opcional compatible con la arquitectura |
| Módulo propio + instalación reversible en copia de webroot | Determinista, funciona sin depender de un gestor remoto | Hay que gestionar archivo bootstrap/config y actualizar por versión | Método controlado inicial de Enhanced |
| Fork completo de jellyfin-web | Control total | Duplica mantenimiento y aumenta coste de cada actualización | Evitar salvo que el bridge no pueda funcionar |
| Fork pequeño Android TV | UI nativa, control remoto y playback existentes | APK, firma, toolchain y pruebas propias | Necesario para entregar diseño en ese cliente |

**Decisión:** Core original sin JS; Enhanced original pequeño, con integración al plugin manager de la versión fijada y servicios del cliente. El transporte y el hero estarán desacoplados. El instalador trabajará sobre una copia administrada del webroot, conservará respaldo/manifiesto y permitirá restaurar; no se ejecutará contra producción durante desarrollo. File Transformation puede sustituir el transporte tras verificar versión y comportamiento, sin fallback silencioso de escritura.

No se utilizará una promesa vacía de “API estable”: los puntos de integración del frontend son internos. Un guard de capacidades debe desactivar Enhanced cuando no coincidan; Core y la Home nativa deben seguir utilizables. La decisión se amplía en [ARCHITECTURE.md](ARCHITECTURE.md).

## 8. Referencia Apple TV y captura del usuario

Se inspeccionó [tv.apple.com](https://tv.apple.com/) sin iniciar sesión, en viewports de 1440×900 y 390×844. Se observó cabecera compacta, hero amplio, texto y CTA sobre degradado y navegación de destacados; en móvil se reorganizan cabecera y bloque textual. El sitio público promocional no equivale a la aplicación tvOS autenticada. Las capturas de investigación no son assets distribuibles del tema.

La imagen suministrada muestra una composición 16:9 dentro de un monitor: margen lateral aproximado de 4–5% del contenido, título/metadata/acciones en el tercio inferior izquierdo, figura central/derecha, indicadores centrados y primera fila visible antes del borde inferior. No se copiarán el monitor, marca, texto, imágenes, logos ni tipografía propietaria. No puede inferirse comportamiento de hover, loading o D-pad a partir de una imagen estática.

Para JellyTV: hero integrado con la primera fila, CTA claro, secundarios discretos pero grandes, capas de degradado lateral/inferior y título textual si falta logo. El arte de cualquier biblioteca puede tener sujetos en otra posición; no se promete segmentación de personas ni recomposición automática. En móvil se priorizan título, clasificación y acciones; descripción y géneros pueden reducirse sin esconder información indispensable. Véase [ARCHITECTURE.md](ARCHITECTURE.md) para tokens y estados.

## 9. Accesibilidad, rendimiento y fallos observados en el ecosistema

El patrón [WAI de carrusel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) requiere control de rotación y pausa al recibir foco; no debe reiniciar por sí solo tras interacción. Se conservará el orden Tab y se añadirá navegación espacial acotada al hero para TV. Flechas y swipe no deben impedir salir hacia la primera fila. Back debe cerrar el estado pertinente y restaurar foco.

Los reportes de capas invisibles bloqueando administración, loops de MutationObserver al abrir el player y controles no clicables de temas comunitarios se convierten en regresiones obligatorias. Sin observer global de atributos, intervalos rápidos, listas completas de imágenes ni trailers automáticos. Peticiones limitadas, cache por usuario/servidor y cancelación al salir de Home.

Objetivo de contraste: 4.5:1 para texto normal y 3:1 para texto grande/elementos de UI pertinentes, según [texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Targets de 44px son una decisión de diseño del proyecto, no una descripción incorrecta del mínimo WCAG AA. Se verificará el compuesto real sobre artwork, además de los colores sólidos.

## 10. Seguridad de desarrollo y estado de la evidencia

El directorio inicial no contenía código ni repositorio Git. Hay Node/npm, Git, .NET 10 y navegadores Chrome/Edge. Docker CLI existe pero su daemon no responde. No se encontró Android SDK/JDK en las rutas comunes examinadas; eso no prueba inexistencia absoluta. No hay Xcode en este host Windows.

El laboratorio usará una instancia aislada y datos de prueba propios. No se ha autorizado ni realizado acceso a un servidor privado. Cualquier plataforma no ejecutada permanece **UNVERIFIED**; los criterios de release se definen en [TESTING.md](TESTING.md). Hasta cumplirlos no se publicará ni etiquetará 1.0.0.

El nombre JellyTV sigue siendo provisional. La [guía de marca de Jellyfin](https://jellyfin.org/docs/general/contributing/branding/) desaconseja nombres confundibles con clientes oficiales; se identificará expresamente como proyecto independiente.
