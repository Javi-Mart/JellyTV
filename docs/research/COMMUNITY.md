# Investigación de temas, gestores y heroes comunitarios

Fecha de investigación: **2026-10-13**. Documento de investigación; no incluye una implementación ni certifica compatibilidad mediante ejecución.

## Alcance y calidad de la evidencia

Se consultaron repositorios, README, código y notas de publicaciones primarios. Las ramas `main` son referencias móviles: su contenido no equivale necesariamente al de una publicación. Donde GitHub mostró día y mes sin año, se conserva esa limitación. Algunas páginas servidas por el buscador estaban cacheadas; no se utiliza su ausencia de actividad para declarar abandonado un proyecto.

No se identificó un aviso de repositorio archivado en las páginas principales de los temas examinados. Esto no prueba mantenimiento activo. Se distinguen publicaciones recientes, mantenimiento limitado declarado y compatibilidad pendiente de comprobar.

## Temas estudiados

| Proyecto | Evidencia y alcance declarado | Aplicación al diseño de JellyTV |
|---|---|---|
| [Ultrachromic — CTalvio](https://github.com/CTalvio/Ultrachromic) | El autor describe el proyecto como antiguo y mantiene las combinaciones que utiliza; acepta correcciones comunitarias. No promete cubrir toda combinación de módulos. | Aprovechar la idea de módulos y presets; no asumir que un tema histórico funciona en todo Jellyfin actual. |
| [Scyfin — loof2736](https://github.com/loof2736/scyfin) | README separa Jellyfin 10.11+ de 10.10 y anteriores, que deben utilizar la línea v1.4. [Releases](https://github.com/loof2736/scyfin/releases) muestra v1.5.8, publicada el 4 de octubre, con cambios de compatibilidad v12 y Media Bar. | Mantener compatibilidad explícita por generación de frontend y adaptadores de plugins separados. |
| [ZestyTheme — stpnwf](https://github.com/stpnwf/ZestyTheme) | README declara 10.11+ y tablet, con importación legacy para 10.10. La [página de publicaciones](https://github.com/stpnwf/ZestyTheme/releases) consultada no mostraba releases. | Variables y paletas son reutilizables como concepto; fijar commit si no existe una publicación verificable. |
| [ElegantFin — lscambo13](https://github.com/lscambo13/ElegantFin) | README declara pruebas con servidor 10.11.11, Edge y Android 2.6.3; para Jellyfin 12 pide modo Legacy. Declara JMP basado en Qt5 no soportado por limitaciones CSS. [Releases](https://github.com/lscambo13/ElegantFin/releases) muestra v26.09.05. | Tomar tokens, compilación y add-ons aislados; comprobar motor web y modo de interfaz, además de versión del servidor. |
| [Finimalism — tedhinklater](https://github.com/tedhinklater/finimalism) | README ofrece `Finimalism11.css` y `Finimalism12.css`, y menciona Jellyfin Desktop 2.0. El [historial consultado](https://github.com/tedhinklater/finimalism/commits/main) muestra correcciones de TV/casting en 2026, pero estaba cacheado. | Separación por DOM útil; no afirmar último commit ni compatibilidad integral a partir del historial cacheado. |
| [Jellyfin Theme Guide](https://github.com/tedhinklater/JellyfinThemeGuide) | Guía comunitaria de aplicación global/por usuario, layouts, foco, selectores, caché y fijación de versiones. | Referencia de técnicas; no constituye una API ni contrato oficial de estabilidad del DOM. |

### Qué conservar y qué evitar

La inspección de [Scyfin `main`](https://raw.githubusercontent.com/loof2736/scyfin/main/CSS/scyfin-theme.css) muestra variables, `.layout-*`, media queries de hover y `@supports`, pero también dependencias de `#reactRoot`, hijos y texto del atributo `style`. La separación pre/post-v12 evidencia que las actualizaciones del frontend pueden requerir cambios incluso en temas mantenidos.

En [ZestyTheme `main`](https://raw.githubusercontent.com/stpnwf/ZestyTheme/main/theme.css) aparecen selectores posicionales que ocultan una pestaña por su posición, controles por orden e IDs de selects numerados. **Evaluación:** evitar estas técnicas para identificar funciones. Un nuevo control, cambio de orden o ID generado puede aplicar la regla al elemento equivocado.

[ElegantFin nightly](https://raw.githubusercontent.com/lscambo13/ElegantFin/main/Theme/ElegantFin-theme-nightly.css) organiza variables y estados, incluye clases MUI y legacy y separa add-ons; importa una fuente externa. [Finimalism11 `main`](https://raw.githubusercontent.com/tedhinklater/finimalism/main/Finimalism11.css) usa señales `data-type` y `:has()` para diferenciar páginas, junto con numerosos offsets y cadenas de clases. **Evaluación:** favorecer identificadores de componente y señales de tipo verificadas, limitando cadenas profundas y reposicionamiento absoluto. Probar zoom, traducciones y contenido largo.

[Ultrachromic `base.css` en `main`](https://raw.githubusercontent.com/CTalvio/Ultrachromic/main/base.css) usa componentes y layouts reconocibles, reglas globales y varios `!important`. **Evaluación:** adoptar su modularidad conceptual, sin heredar alcance administrativo o especificidad. El `!important` de JellyTV debería justificarse regla por regla frente al CSS real de Jellyfin.

## Gestores: proyectos distintos bajo nombres similares

| Proyecto | Mecanismo documentado | Decisión de investigación |
|---|---|---|
| [danieladov/jellyfin-plugin-skin-manager](https://github.com/danieladov/jellyfin-plugin-skin-manager) | Gestor histórico; [releases](https://github.com/danieladov/jellyfin-plugin-skin-manager/releases) muestra 2.0.2. No se confirmó ABI actual. | No seleccionarlo por reconocimiento del nombre; compatibilidad actual pendiente. |
| [Jellyfin-PG/Skin-Manager](https://github.com/Jellyfin-PG/Skin-Manager) | 10.11+, File Transformation, variables y temas por usuario. README indica que el trabajo se trasladó a Jellyframe. | No convertirlo en dependencia nueva obligatoria. |
| [NoahSKipp/Jellyfin-Theme-Manager](https://github.com/NoahSKipp/Jellyfin-Theme-Manager) | 10.11/net9; descarga CSS, ajusta URLs relativas y publica una hoja compuesta mediante Branding CSS; admite imports remotos. | Posible instalador opcional de Core. Core debe poder instalarse sin gestor. |
| [Skin-Manager-Themes](https://github.com/Jellyfin-PG/Skin-Manager-Themes) | Manifiesto con variables, versiones y caché; `latest` evita la comparación normal de versiones. | Distribuir artefactos reproducibles con versión exacta. |

## Hero dinámico: CSS no cubre la funcionalidad solicitada

**Conclusión técnica:** CSS puede presentar datos y controles existentes. Consultar recomendaciones, elegir contenidos, actualizar favoritos, decidir reproducción/reanudación y coordinar pausa de un carrusel requiere lógica y acceso a datos. Los proyectos siguientes lo resuelven con JavaScript e inyección/plugin; no son una capacidad añadida por Custom CSS.

| Proyecto | Hechos documentados | Evaluación |
|---|---|---|
| [MakD/Jellyfin-Media-Bar](https://github.com/MakD/Jellyfin-Media-Bar) | README presenta v6 fullscreen beta, suspende mantenimiento de la variante CSS normal y propone modificar `index.html`. Recomienda `defer` y versión fijada. | Referencia conceptual; no base de código a copiar. |
| [IAmParadox27/jellyfin-plugin-media-bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar) | Usa File Transformation y obtiene contenido del proyecto MakD; separa incidencias de inyección e interfaz. | Reduce instalación manual, pero conserva dependencia de otro upstream. |
| [CodeDevMLH/Media Bar Enhanced](https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced) | Recomendaciones, acciones, trailers y configuración por dispositivo. README menciona 10.11; [releases](https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced/releases) añade compatibilidad v12 desde v3.8.0.0 y muestra v3.9.2.0 el 12 de octubre. | Candidato existente razonable para integración opcional, no dependencia obligatoria ni garantía de calidad sin pruebas. |
| [21513/Jellyfeatured](https://github.com/21513/Jellyfeatured) | README dirigido a 10.11.8; recomendaciones y soporte ElegantFin. Autor declara disponibilidad limitada. Excluye Android TV y clientes sin inyección web. | Alternativa evaluada documentalmente. No se logró recuperar su JS para auditar ciclo de vida o credenciales. |
| [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) | Transforma contenido servido por Jellyfin Web sin requerir edición directa de sus archivos. | Transporte de Enhanced a comparar con un parche pequeño y versionado de jellyfin-web. No estabiliza por sí mismo DOM, reproducción o sesión. |

### File Transformation 3 y el inyector de MBE no son equivalentes

Las [notas de File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases) describen una reescritura en **3.0.0.0**, con middleware ASP.NET Core, soporte de Jellyfin 12 y retirada de 10.10.7. La página muestra **3.0.2.0** como última publicación y fecha 12 de octubre. Esto reduce dependencia de parcheos específicos del runtime según el propio proyecto; no confirma compatibilidad de todos los consumidores.

El [README de MBE](https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced#docker-permission-issues) recomienda File Transformation. Sin embargo, el [archivo `ScriptInjector.cs` consultado en `main`](https://raw.githubusercontent.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced/main/Jellyfin.Plugin.MediaBarEnhanced/ScriptInjector.cs) intenta primero leer y escribir `index.html`; registra una transformación como fallback cuando no encuentra el archivo o no puede modificarlo.

**Límite de esta observación:** se inspeccionó `main`, no el archivo fijado a `v3.9.2.0`. No se certifica aquí el comportamiento de ese tag. Tampoco se puede deducir que instalar File Transformation impida automáticamente modificaciones en disco por parte de MBE. Antes de integrarlo debe revisarse el código del artefacto exacto y comprobar el mecanismo utilizado.

## Incidencias reales que orientan la validación

- [Ultrachromic #112](https://github.com/CTalvio/Ultrachromic/issues/112), agosto de 2025: reporte de aplicación incompleta de un preset en 10.10.7/10.10.8. Es evidencia de un reporte, no de una causa confirmada.
- [Media Bar #106](https://github.com/MakD/Jellyfin-Media-Bar/issues/106), junio de 2026: capa invisible bloquea administración si se navega durante la carga. El cierre por inactividad no demuestra resolución.
- [MBE releases](https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced/releases): v3.9.1.0 corrige un bucle de MutationObserver al abrir reproducción; v3.9.2.0 restringe operaciones de renombrado de overlays a administradores y valida nombres; v3.6.0.0 detiene carga/búsquedas de trailers al salir de Home.
- [Scyfin v1.5.8](https://github.com/loof2736/scyfin/releases): arreglos de Media Bar/Enhanced, pantallas pequeñas y ausencia de backdrop. El autor reduce estilizado específico de plugins por coste de mantenimiento.
- [ElegantFin v26.09.05](https://github.com/lscambo13/ElegantFin/releases): correcciones de botones no clicables en cabecera, seekbar y Jellyfin 12 Legacy.

**Pruebas derivadas:** salir de Home durante peticiones, abrir/cerrar player, cambiar usuario, navegar rápidamente a administración, regresar con Back, perder backdrop, variar tamaño y verificar que overlays no intercepten eventos fuera del hero.

## Sesión, seguridad y rendimiento

En [Media Bar `slideshowpure.js` de `main`](https://raw.githubusercontent.com/MakD/Jellyfin-Media-Bar/main/slideshowpure.js) se observan acceso a `window.ApiClient`, inicio anticipado mediante credenciales guardadas y primer servidor almacenado, token en query para stream local, observadores globales y escucha de cambios de hash. También hay polling inicial frecuente y una opción que interviene capas de backdrop nativas.

Estos hechos no demuestran una vulnerabilidad explotable. Sí identifican decisiones que requieren revisión: selección del servidor activo, exposición de URLs autenticadas, limpieza en logout, alcance de observers y red de terceros. Para JellyTV se propone no duplicar persistencia de credenciales, no registrar tokens, usar el usuario/servidor activos y no modificar capas nativas. Las peticiones y caché deberían quedar vinculadas a sesión y cancelarse al desmontar.

Fuentes y trailers remotos afectan CSP y disponibilidad; la recomendación es pila tipográfica del sistema, artefactos locales, imágenes de tamaño adecuado y trailers externos desactivados inicialmente. Precargar un conjunto pequeño, no recorrer todas las imágenes de una biblioteca.

## Licencias y versiones

- [MakD README/licencia](https://github.com/MakD/Jellyfin-Media-Bar#license) declara DBAD, restricciones de redistribución y uso comercial, atribución y devolución de modificaciones. No se propone copiarlo ni empaquetarlo.
- GitHub identifica [MBE](https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced), [Jellyfeatured](https://github.com/21513/Jellyfeatured) y [Finimalism](https://github.com/tedhinklater/finimalism) como GPL-3.0, [ElegantFin](https://github.com/lscambo13/ElegantFin) como GPL-2.0 y [ZestyTheme](https://github.com/stpnwf/ZestyTheme) como MIT. Esta inspección de etiquetas no sustituye revisar los archivos concretos y su procedencia antes de reutilizar código.
- Inspiración visual y análisis no requieren heredar código. JellyTV debe mantener autoría y licencia claras para sus archivos originales.
- Fijar versión completa o SHA y conservar checksums de artefactos. `main`, `latest` y un rango mayor pueden cambiar sin una nueva decisión del administrador. La [guía de temas](https://github.com/tedhinklater/JellyfinThemeGuide#version-pinning) explica fijación y los efectos de caché de Jellyfin/CDN.

## Propuesta de arquitectura, todavía no implementada

1. **Core original:** tokens y módulos compilados en una hoja, sin tema comunitario completo como dependencia. Adaptadores explícitos para generaciones del DOM realmente soportadas.
2. **Enhanced opcional:** hero aislado, sin overlays de carga globales ni obligación de trailers, con contenedor propio y fallo que preserve Jellyfin si no encuentra sesión o capacidades necesarias.
3. **Comparar dos integraciones:** File Transformation 3 más adaptador JS frente a un parche pequeño/versionado del build de jellyfin-web. La elección depende de verificar exports reales de API, reproducción y ciclo de vida. La investigación comunitaria no basta para asumir que `window.ApiClient` o rutas internas son contratos estables.
4. **Preferencia provisional:** transformación de respuesta y assets same-origin si el adaptador puede usar integración verificable y desmontaje seguro. Sin fallback silencioso de escritura en `index.html`. Si solo un parche del build proporciona hooks estables, documentar mantenimiento, build y rollback antes de elegirlo.
5. **Ciclo de vida explícito:** montaje solo en Home, cancelación de peticiones y timers al salir, observers acotados y desconectados, invalidación al cambiar sesión, navegación/reproducción nativas preservadas.
6. **Accesibilidad del carrusel:** pausa al interactuar o mantener foco, control de pausa, reduced motion, teclado/D-pad y restauración de foco. Las preferencias y límites deben probarse en el cliente real.
7. **MBE opcional:** puede evaluarse un adaptador de estilos fijado a versión; no instalar dos heroes ni heredar su sistema de inyección por suposición.

Estas son propuestas de diseño y criterios de aceptación. No se ejecutaron plugins, no se conectó una instancia privada, no se evaluó un APK y no existe resultado PASS de plataforma derivado de este documento.
