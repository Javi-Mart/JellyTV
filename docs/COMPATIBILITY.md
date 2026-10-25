# Compatibilidad

## Revisión 1.1.0-dev.0 — abierta

El entorno real es Server/Web **10.10.6**, shell Legacy. El candidato incluye un perfil estructural específico e integración Enhanced guardada por capacidades. El candidato anterior7985d738 pasó156 casos de geometría en Chrome y36 en cada motor Chromium/Edge/Firefox/WebKit. Esas pruebas omitían intersección logo/póster; una revisión de las mediciones encontró9colisiones. El nuevo Core596e1197 exige retest. **No hay PASS de compatibilidad completa para1.1 ni se hereda el PASS12.2 de1.0.** Ver [aceptación activa](ACCEPTANCE_VNEXT.md).

## Entrega histórica 1.0.0

JellyTV **1.0.0**, actualización del 22 de octubre de 2026. La compatibilidad está fijada a **Jellyfin Server 12.2.0 / Web 12.2**, commit Web `61b1f890365ad15138e943e694af723c1d47df2a`. Los resultados se refieren a las combinaciones ejecutadas; las versiones investigadas no se presentan como la última publicación actual.

## Web

| Motor ejecutado | Alcance | Resultado |
|---|---|---|
| Chrome 154.0.8037.100 | 13 viewports desktop/tablet/móvil/TV; Core solo y Enhanced | 65 Core + 78 Enhanced PASS; omisiones del hero en Core explícitas |
| Chromium 156.0.8078.4 | Laptop, móvil390, TV1080 | 18 Enhanced + 15 Core PASS |
| Edge 155.0.4283.62 | Laptop, móvil390, TV1080 | 18 Enhanced + 15 Core PASS |
| Firefox 157.0 | Laptop, TV1080 | 12 Enhanced + 10 Core PASS |
| WebKit 27.2 en Windows | Laptop, móvil390, TV1080 | 18 Enhanced + 15 Core PASS; no certifica Safari |
| Safari macOS/iOS | Plataforma Apple no ejecutada | UNVERIFIED |
| Legacy desktop independiente | No incluido en la matriz | UNVERIFIED; Legacy TV sí probado |

Desktop/móvil usan la aplicación Modern real; TV usa Legacy con el modo TV seleccionado. La auditoría adicional cubre landscape, zoom 100/200/400%, colores forzados, contraste, D-pad y lifecycle. Las resoluciones, resultados exactos y hashes están en [TESTING](TESTING.md). Quick Connect sin rechazos y Back antes de cargar una ficha requieren las [dos correcciones separadas para Web 12.2](INSTALL.md#quick-connect-en-web-122).

## Clientes

| Cliente / versión investigada | Core CSS | Enhanced / adaptación | Estado |
|---|---|---|---|
| Android Mobile 2.7.3 | UI web servida, compatible por arquitectura | Hero si recibe el módulo del webroot; reproductor nativo aparte | UNVERIFIED en aplicación/dispositivo |
| Jellyfin Mobile iOS 1.8.0.5 | UI web servida, compatible por arquitectura | Igual restricción de webroot | UNVERIFIED en aplicación/dispositivo |
| Media Player 1.12.0 | Depende del frontend/motor empaquetado | Inyección del servidor no garantizada | UNVERIFIED |
| Desktop 2.0.0 prerelease | Frontend/motor propios por comprobar | Integración no probada | UNVERIFIED |
| Android TV 0.19.10, adaptación JellyTV | No carga CSS | Kotlin/XML/Compose/Leanback; APK separado | PASS en emulador API34; límites abajo |
| Google TV / Fire TV | No carga CSS | Misma línea nativa, hardware distinto | UNVERIFIED |
| Swiftfin 1.6.1, iOS/tvOS | No | No se entrega fork Swiftfin | UNSUPPORTED por Core/Enhanced; ejecución nativa UNVERIFIED |
| Server/Web 10.10.x / 10.11.x y futuras | No prometido | Instalador Enhanced rechaza versiones distintas de 12.2 | UNVERIFIED |

Android TV se valida en emulador API34 x86/WHPX con salida física 1920×1080 y 3840×2160. El framework limita ambas superficies UI a 1920×1080/320dpi. Los ocho recorridos por configuración deben coincidir con el APK de [evidence/validation.json](../android-tv/evidence/validation.json); consulta [evidencia del dispositivo](../android-tv/docs/device-validation.md). UI rasterizada realmente a 4K, televisor físico, HDR, HDMI-CEC y decodificador 4K de hardware permanecen UNVERIFIED. El APK entregado es debug, no un cliente firmado para tiendas.

Dashboard/Users/Libraries/Plugins mantienen el layout administrativo original. La comparación no encuentra overrides ni errores adicionales de JellyTV; conserva un error upstream documentado en [administration.json](validation/administration.json).

## Actualizar Jellyfin

No aplicar el parche Android a otro commit ni el arreglo Quick Connect a otro bundle. Retira cambios del webroot antes de actualizar; conserva CSS y overrides por separado. Revisa DOM, plugin manager, API, router y playback del nuevo cliente; ejecuta unidades, matriz responsive, sesiones, D-pad, visuales y reproducción antes de declarar compatibilidad. Los instaladores rechazan bytes desconocidos para evitar restaurar archivos de una versión sobre otra.

Fuentes y decisiones: [RESEARCH](RESEARCH.md), [clientes](research/CLIENTS.md), [frontend](research/WEB.md), [comunidad](research/COMMUNITY.md), [arquitectura](ARCHITECTURE.md).
