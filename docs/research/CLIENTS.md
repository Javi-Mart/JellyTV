# JellyTV: investigación de clientes

Fecha de consulta: **2026-10-14** (America/El_Salvador). Investigación de documentación oficial, releases y código en tags concretos. Esta revisión de código demuestra la arquitectura; **no equivale a una prueba de ejecución del tema en dispositivos**.

## Resultado para la arquitectura

Custom CSS corresponde a Jellyfin Web. No es una API universal de temas: un cliente que dibuja sus pantallas con Android Views, Compose o SwiftUI no recibe una interfaz nueva por cambiar Branding. La documentación oficial limita expresamente CSS a clientes basados en Web. Permite configuración en Dashboard → Branding y, cuando la versión Web lo ofrece, Settings → Display. Los recursos externos los descarga cada cliente, por lo que una URL accesible solamente desde el servidor no sirve. [Documentación oficial de Custom CSS](https://jellyfin.org/docs/general/clients/css-customization/).

Decisión recomendada: compartir JellyTV Core y Enhanced entre superficies que realmente cargan Jellyfin Web; desarrollar Android TV como adaptación nativa separada del cliente oficial. El modo TV de Jellyfin Web es una superficie distinta del APK Android TV. Para iOS/iPadOS usar inicialmente el wrapper oficial; no crear un fork de Swiftfin solamente para duplicar esa cobertura. La equivalencia visual completa de Swiftfin/tvOS necesitaría un proyecto Swift independiente.

## Versiones y revisiones verificadas

Se consultaron las páginas de releases y la API pública de GitHub (`releases/tags/<tag>` y `commits/<tag>`). Fechas de publicación expresadas en UTC para conservar el dato de origen. El número superior no siempre identifica una versión estable.

| Cliente | Release estable analizada | Publicación UTC | Commit exacto |
| --- | --- | --- | --- |
| Android Mobile | [v2.7.3](https://github.com/jellyfin/jellyfin-android/releases/tag/v2.7.3) | 2026-09-14 | `9a5f9be6a76da47ca07733b982a12dbd0f75539b` |
| Android TV / Google TV / Fire TV | [v0.19.10](https://github.com/jellyfin/jellyfin-androidtv/releases/tag/v0.19.10) | 2026-08-16 | `984181a3d6ab14e9a6d2dcc850c582e1c138bd95` |
| Jellyfin Mobile iOS/iPadOS | [v1.8.0.5](https://github.com/jellyfin/jellyfin-ios/releases/tag/v1.8.0.5) | 2026-08-14 | `78bc20a0a63aec2b0f96d7ed2eaea4a2f9f9d40f` |
| Swiftfin | [1.6.1](https://github.com/jellyfin/Swiftfin/releases/tag/1.6.1) | 2026-08-23 | `5b794d2b7d4b54db89b041b8d6355461de7110db` |
| Jellyfin Media Player | [v1.12.0](https://github.com/jellyfin/jellyfin-desktop/releases/tag/v1.12.0) | 2025-03-20 | `41ba4348addd46b806ba7bd1a0c92b457ae5ed7c` |

Android TV **v0.20.0-beta.3**, publicado 2026-09-24, tiene `prerelease: true`; revisión `5b515f538f1303b823808a4ab76184cfb93e15d7`. El plan 0.20 eleva el requisito del servidor a Jellyfin 10.11; no mezclar sus cambios con un parche fijado a 0.19.10. [Release beta](https://github.com/jellyfin/jellyfin-androidtv/releases/tag/v0.20.0-beta.3), [plan oficial 0.20](https://github.com/jellyfin/jellyfin-androidtv/discussions/5783).

El repositorio del antiguo Media Player ahora es `jellyfin-desktop`. **v2.0.0**, publicado 2025-12-14, renombra el producto a Jellyfin Desktop, migra a Qt 6 y cambia directorios de configuración, pero sigue marcado **Pre-release**. Revisión `1634d3d263b881dccc62bf278d1289b471ec7af1`. No presentar 2.0 como última estable ni asumir migración automática de configuración. [Release 2.0.0](https://github.com/jellyfin/jellyfin-desktop/releases/tag/v2.0.0).

## Matriz de posibilidades

“Sí” significa que la arquitectura permite el tema; la certificación requiere las pruebas del proyecto.

| Cliente | Tecnología | Custom CSS | Tema JellyTV | Método / alcance |
| --- | --- | --- | --- | --- |
| Web Desktop | Jellyfin Web en navegador | Sí | Core + Enhanced | CSS; Enhanced integrado con el cliente Web y API |
| Web móvil/tablet | Mismo Web, layout responsive | Sí | Core + Enhanced | Mismo núcleo con touch, safe areas y breakpoints |
| Jellyfin Media Player 1.12 | Qt WebEngine + Web del servidor + MPV | Sí, superficie Web | Core; Enhanced sujeto a validación | CSS/JS Web; no cambia la ventana nativa ni el motor MPV |
| Jellyfin Desktop 2.0 prerelease | Qt 6 + WebEngine + MPV/MpvQt | Sí, superficie Web | Objetivo adicional no estable | Validar por separado respecto a 1.12 |
| Android Mobile 2.7.3 | Kotlin, Android WebView, integraciones nativas | Sí, dentro del WebView | Core + Enhanced Web | Pantallas/player nativos no admiten CSS |
| Jellyfin Mobile iOS 1.8.0.5 | Expo/React Native + WebView | Sí, dentro del WebView | Core + Enhanced Web | Shell, descargas y player nativos quedan fuera |
| Android TV 0.19.10 | Kotlin/Java, Compose y Leanback | No | Adaptación nativa | Parche/fork y APK específico |
| Google TV | Cliente Android TV | No | Adaptación nativa | Misma base; validar mando y plataforma |
| Fire TV | Cliente Android TV sobre Fire OS | No | Adaptación nativa | Misma base; validar dispositivo y reproducción |
| TV Web | Jellyfin Web en modo TV | Sí | Core + Enhanced TV Web | D-pad/teclado del Web; no es el APK nativo |
| Swiftfin iOS/iPadOS/tvOS | Swift/SwiftUI, reproductores nativos | No | Sin aplicación directa de Core | Cambiar código y compilar un fork para un tema integral |

Fuentes técnicas por cliente en las siguientes secciones. CSS no incorpora por sí solo un hero con consultas API, estado de favoritos, progreso, reproducción o rotación de contenido.

## Android Mobile: límite entre Web y nativo

El README identifica explícitamente el cliente como wrapper de Jellyfin Web. En v2.7.3 `WebViewFragment` administra Android WebView, conecta el servidor, inyecta el puente nativo y delega Back al Web. Usa `NativePlayer` y `ExternalPlayer`: elegir un reproductor nativo no convierte su UI a HTML. La selección/conexión del servidor, permisos, descargas e integraciones de Android también tienen implementación propia. [README v2.7.3](https://github.com/jellyfin/jellyfin-android/blob/v2.7.3/README.md), [WebViewFragment](https://github.com/jellyfin/jellyfin-android/blob/v2.7.3/app/src/main/java/org/jellyfin/mobile/webapp/WebViewFragment.kt).

Conclusión de compatibilidad: bibliotecas, Home y detalles servidos por Web pueden compartir Core. Un hero Enhanced puede entrar por esa misma distribución Web, pero se debe comprobar su integración con el puente de reproducción, WebView instalado, Back y ciclo background/foreground. No ofrecer cambios CSS a la UI de ExoPlayer, reproductor externo, Android Auto o pantallas nativas. Los sabores `libre` y `proprietary` difieren, entre otras cosas, en soporte Chromecast; no describir ambos como idénticos.

## Jellyfin Mobile iOS frente a Swiftfin

El repositorio vigente es `jellyfin-ios` (el nombre histórico `jellyfin-expo` aún aparece en algunas referencias). Es Expo/React Native con mejoras nativas alrededor de Web. `NativeShellWebView.tsx` carga `server.urlString`, instala el puente NativeShell y recibe eventos de reproducción/descargas. `HomeScreen.js` monta ese WebView junto a `AudioPlayer` y `VideoPlayer`, aplica safe areas y coordina navegación. Core puede cambiar lo que ocurre dentro del WebView; no puede rediseñar el tab bar React Native, vistas de error nativas ni controles nativos de reproducción. [README v1.8.0.5](https://github.com/jellyfin/jellyfin-ios/blob/v1.8.0.5/README.md), [NativeShellWebView](https://github.com/jellyfin/jellyfin-ios/blob/v1.8.0.5/components/NativeShellWebView.tsx), [HomeScreen](https://github.com/jellyfin/jellyfin-ios/blob/v1.8.0.5/screens/HomeScreen.js).

Swiftfin es otro cliente, escrito en Swift para iOS/iPadOS/tvOS. No carga las páginas Web como su UI principal. Su apariencia incluye opciones propias: `AppAppearance` contempla sistema, oscuro y claro; no es un importador CSS del servidor. Cambiar su composición o instalar JellyTV en tvOS exige modificar SwiftUI/recursos y compilar/distribuir una app. [README 1.6.1](https://github.com/jellyfin/Swiftfin/blob/1.6.1/README.md), [AppAppearance.swift](https://github.com/jellyfin/Swiftfin/blob/1.6.1/Shared/Objects/AppAppearance.swift). Una captura Web con viewport de TV no valida Swiftfin ni el mando de Apple TV.

## Desktop / Media Player

La base 1.12 usa el Web proporcionado por el servidor. `src/ui/webview.qml` contiene `WebEngineView`, carga la URL del cliente, instala NativeShell y compone vídeo MPV. CSS actúa sobre la UI Web; no sobre opciones internas de MPV ni ventanas del sistema. La versión Qt/WebEngine condiciona soporte de CSS moderno, por lo que el tema necesita fallbacks para blur y funciones recientes. El README documenta depuración remota con `--remote-debugging-port=9222`. [README 1.12](https://github.com/jellyfin/jellyfin-desktop/blob/v1.12.0/README.md), [webview.qml](https://github.com/jellyfin/jellyfin-desktop/blob/v1.12.0/src/ui/webview.qml).

## Android TV: puntos concretos para implementación

Base reproducible elegida: **v0.19.10**, commit `984181a3d6ab14e9a6d2dcc850c582e1c138bd95`. La app no es un WebView. `app/build.gradle.kts` habilita tanto `compose` como `viewBinding`, depende de Leanback y Compose, y usa módulos de reproducción Media3. [Configuración de app](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/build.gradle.kts).

La Home es híbrida. `HomeFragment` crea una `Column` Compose con `MainToolbar` y aloja `HomeRowsFragment` mediante `AndroidFragment`. Este último hereda `RowsSupportFragment` de Leanback y conserva filas, API, selección, reproducción y refresco. Existe lógica explícita de transferencia de focus entre toolbar y filas: solo deja salir hacia arriba desde la primera fila y limpia estado Leanback al transferirlo. Insertar un hero debe adaptar ese contrato y restaurar focus al volver, sin interceptar todas las teclas de forma global. [HomeFragment](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/home/HomeFragment.kt), [HomeRowsFragment](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/home/HomeRowsFragment.kt).

| Responsabilidad | Archivo verificado en v0.19.10 | Consecuencia |
| --- | --- | --- |
| Opciones de tema | [AppTheme.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/preference/constant/AppTheme.kt) | Enum compilado: DARK, EMERALD, MUTED_PURPLE |
| Aplicar estilo Android | [ActivityThemeExtensions.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/util/ActivityThemeExtensions.kt) | Mapea enum a `R.style` y recrea actividad al cambiar; preservar cautela del player |
| Preferencias existentes | [CustomizationPreferencesScreen.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/preference/screen/CustomizationPreferencesScreen.kt) | Permite tema incorporado, backdrop, reloj y otras opciones, no temas arbitrarios |
| Estilo Views/Leanback | [theme_jellyfin.xml](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/res/values/theme_jellyfin.xml) | Colores, fondos, radio de cards/botones, inputs, focus/progreso y popups |
| Proveedor Compose | [JellyfinTheme.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/base/JellyfinTheme.kt) | `CompositionLocalProvider` de esquema, formas y tipografía |
| Tokens Compose | [colorScheme.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/base/colorScheme.kt), [shapes.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/base/shapes.kt), [typography.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/base/typography.kt) | Esquema separado del XML: modificar ambos sistemas para coherencia |
| Cards legacy | [CardPresenter.java](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/presentation/CardPresenter.java), [view_card_legacy_image.xml](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/res/layout/view_card_legacy_image.xml) | Verificar selección, artwork, proporción y focus en filas reales |
| Controles Compose | [ButtonBase.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/base/button/ButtonBase.kt), [MainToolbar.kt](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/src/main/java/org/jellyfin/androidtv/ui/shared/toolbar/MainToolbar.kt) | Preservar manejo de interacción y semántica nativa |

Sin fork se pueden usar las opciones de personalización ya incorporadas. No se encontró un mecanismo de carga de CSS ni paquetes de temas nativos remotos en los puntos de configuración revisados. Añadir JellyTV, un hero nuevo, otra composición de tarjetas o una tipografía global exige cambios en código/recursos y una compilación. Recomendación: parche acotado sobre tag oficial que conserve autenticación, consultas, filas y reproductor existentes. Una app de demostración sin esas integraciones no satisface la adaptación nativa solicitada.

## Herramientas y validación nativa requerida

El tag estable fija **JDK 21**, **Kotlin 2.2.21**, **Android Gradle Plugin 8.11.1**, **compileSdk/targetSdk 36**, **minSdk 21**; su wrapper usa **Gradle 9.1.0**. No sustituir esas versiones por las de un tutorial antiguo. [libs.versions.toml](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/gradle/libs.versions.toml), [gradle-wrapper.properties](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/gradle/wrapper/gradle-wrapper.properties).

Android Studio/SDK son el entorno oficial. El README proporciona `assembleDebug` e `installDebug`. En PowerShell se usan `./gradlew.bat assembleDebug` y `./gradlew.bat installDebug`; la build debug agrega `.debug` al applicationId para coexistir con la app estable. Consultar primero `./gradlew.bat tasks --all` para ejecutar los tests/lint disponibles en la revisión. [README Android TV](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/README.md), [tipos de build](https://github.com/jellyfin/jellyfin-androidtv/blob/v0.19.10/app/build.gradle.kts).

Google documenta AVD de Android TV mediante Device Manager y pruebas en TV físico con depuración habilitada. Preparar emulador TV acelerado y usar ADB para instalar, recoger logs y reproducir secuencias de botones. La aprobación requiere recorrido Home → fila → detalle → Play → Back con D-pad, retorno de focus, rotación del hero pausada durante interacción, configuración y subtítulos, además de imágenes 1080p/4K. Emulador no sustituye una comprobación del decodificador, audio, HDR o particularidades Fire OS en hardware. [Crear/ejecutar una app TV](https://developer.android.com/training/tv/get-started/create), [AVD](https://developer.android.com/studio/run/managing-avds), [ADB](https://developer.android.com/tools/adb), [hardware y D-pad](https://developer.android.com/training/tv/get-started/hardware).

Estado de esta investigación: arquitectura y referencias verificadas; todavía no se afirma que JellyTV esté compilado, instalado o validado en Android TV, iOS, Swiftfin, Media Player ni hardware físico. Registrar pruebas reales y bloqueos en TESTING antes de cambiar ese estado.
