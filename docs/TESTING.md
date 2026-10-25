# Validación y resultados

## Revisión 1.1.0-dev.0 — 24 de octubre de 2026

`npm run check`: build/lint y35unidades PASS. Incluye la regresión de colisión de artwork capturada y la notificación de favoritos solo tras éxito de la sesión activa.

Los informes `validation/vnext/layout-*-compat.json` identifican su propio hash. Los PASS de Core7985d738 son históricos respecto al candidato actual596e1197. `logo-overlap-before.json` reevalúa **sin abrir navegador** la geometría anterior:9casos fallan el nuevo guard. Esto acredita la laguna y el caso de regresión, no valida el CSS corregido.

Comandos de retest pendientes, únicamente sobre el laboratorio aislado10.10.6:

```text
node scripts/lab/vnext-layout.mjs --compat --matrix
node scripts/lab/vnext-layout.mjs --compat --engine=firefox
node scripts/lab/vnext-layout.mjs --compat --engine=webkit
node scripts/lab/vnext-layout.mjs --compat --engine=edge
node scripts/lab/vnext-layout.mjs --compat --engine=chromium
node scripts/lab/vnext-enhanced.mjs
```

El último runner está preparado pero no ejecutado. Comprueba montaje nativo, estabilidad de CTA, cancelación del hover, ausencia de desplazamiento de fila, Escape/foco, rutas, touch, TV y reduced motion. No representa todavía cobertura completa de favoritos/playback/a11y/performance. Las nuevas ejecuciones quedaron pendientes porque el revisor automático de permisos no pudo procesarlas por cuota. Lista completa en [ACCEPTANCE_VNEXT](ACCEPTANCE_VNEXT.md).

## Resultados históricos 1.0.0

Actualizado el **22 de octubre de 2026**. Los resultados se limitan al cliente, build y entorno registrados. La aceptación de la entrega está consolidada en [FINAL_REPORT](../FINAL_REPORT.md); los JSON conservan fechas UTC, hashes, diagnósticos y resultados reales. No se suman pruebas superpuestas como casos independientes.

## Suites web

| Prueba | Resultado | Evidencia |
|---|---|---|
| Build, ESLint, Stylelint | PASS | `npm run check` |
| Unidades | 24 PASS | Modelo 6, adaptador 7, instalador 7, corrección Quick Connect 3, navegación 1 |
| Chrome, Enhanced, 13 proyectos | 78 PASS | [enhanced-chrome.json](validation/enhanced-chrome.json) |
| Chrome, Core sin Enhanced | 65 PASS; 13 omisiones del hero que no se instala | [core-chrome.json](validation/core-chrome.json) |
| Chromium, laptop/móvil390/TV1080 | 18 PASS | [enhanced-chromium.json](validation/enhanced-chromium.json) |
| Edge, laptop/móvil390/TV1080 | 18 PASS | [enhanced-edge.json](validation/enhanced-edge.json) |
| Firefox, laptop/TV1080 | 12 PASS | [enhanced-firefox.json](validation/enhanced-firefox.json) |
| WebKit, laptop/móvil390/TV1080 | 18 PASS | [enhanced-webkit.json](validation/enhanced-webkit.json) |
| Core, Chromium | 15 PASS; 3 omisiones del hero | [core-chromium.json](validation/core-chromium.json) |
| Core, Edge | 15 PASS; 3 omisiones del hero | [core-edge.json](validation/core-edge.json) |
| Core, Firefox | 10 PASS; 2 omisiones del hero | [core-firefox.json](validation/core-firefox.json) |
| Core, WebKit | 15 PASS; 3 omisiones del hero | [core-webkit.json](validation/core-webkit.json) |
| Geometría, accesibilidad, zoom y D-pad | 22 PASS | [core-all.json](validation/core-all.json): 17 geometría/a11y, 3 zoom, 2 TV |
| Navegación rápida con latencia | 6 controles sin solapamientos | [navigation-race.json](validation/navigation-race.json); fallo original conservado |
| Lifecycle | 4 PASS | [enhanced-lifecycle.json](validation/enhanced-lifecycle.json) |
| Audio, colección, búsqueda vacía, touch | 7 PASS; 2 omisiones de touch fuera de móvil | [extended-chrome.json](validation/extended-chrome.json) |
| Login inválido y Quick Connect | PASS en baseline/Core/Enhanced | [authentication.json](validation/authentication.json); cero excepciones y rechazos |
| Logout, cambio de usuario, permisos | PASS en 9 sesiones nuevas | [session.json](validation/session.json) |
| Administración | 4 pantallas; comparación PASS | [administration.json](validation/administration.json) |
| Rendimiento, 50 ciclos por modo | PASS del protocolo | [performance.json](validation/performance.json) |

El nombre `core-all` corresponde a la auditoría de Core **con Enhanced instalado**. `core-chrome` es la prueba exclusiva de Core. Los informes `core-matrix`, `core-a11y`, `core-zoom` y `core-tv` anteriores se conservan como historial; `core-all` contiene la repetición conjunta posterior.

## Resoluciones y recorridos

| Modo | Viewports CSS |
|---|---|
| Desktop | 1920×1080, 2560×1440, 3840×2160 |
| Laptop | 1366×768 |
| Tablet | 768×1024, 1024×768 |
| Móvil | 320×740, 360×800, 390×844, 430×932, 480×900; landscape 844×390 |
| TV Web, layout TV seleccionado | 1920×1080, 3840×2160 |

La matriz comprueba login, Home, hero, favoritos persistidos, Continue Watching, biblioteca, búsqueda, película, serie, temporadas, episodios, música, ajustes, menú de usuario, diálogos, reproducción real y subtítulos. La ampliación añade una colección real de dos ítems, búsqueda sin/con resultados, cambio a la segunda pista de audio mediante petición real, volumen, mute/unmute y seek. El swipe usa eventos touch del navegador; comprueba también el fallback sin artwork y el tap de Info en landscape.

TV se recorre solo con flechas/Enter/Back: Home → fila → película → detalle → Play → Back, salida vertical del hero y restauración de foco. La prueba de reproducción exige avance del reloj del reproductor; Resume parte de progreso persistido. No se acepta un botón que solo cambie texto.

## Accesibilidad y rendimiento

Las comprobaciones ejecutadas no muestran errores críticos/serios de axe. Se conserva el aviso moderado upstream `meta-viewport` (`user-scalable=no`); no se declara conformidad WCAG completa. Se miden targets del hero de al menos 44px, foco visible, contraste de superficies resueltas, movimiento reducido, colores forzados y zoom real del navegador 100/200/400%. Lector de pantalla, notch físico y todas las combinaciones de artwork quedan UNVERIFIED.

Performance usa 5 ciclos de calentamiento y 50 Home → detalle → Home en cada modo, espera de animaciones, recolección CDP y dos frames antes de medir. El JSON publica muestras intermedias, heap, nodos, listeners, tiempos, long tasks y peticiones. Se exige ausencia de errores/rechazos y un único lote de candidatos. La comparación permite distinguir crecimiento del cliente original; no demuestra ausencia universal de fugas ni rendimiento de un TV físico.

## Diagnósticos upstream y correcciones

- WebSocket403 antes de login: tres controles Chrome y tres por motor Firefox/WebKit en [upstream-login](validation/upstream-login.json) y [upstream-browser-login](validation/upstream-browser-login.json). Excepciones exactas por motor, mensaje, ruta y cantidad.
- Logout401: doce controles sin tema en [upstream-logout](validation/upstream-logout.json). La comparación conserva frecuencias y rechaza firmas adicionales.
- Audio HLS `internalException`, no fatal: tres controles sin tema en [upstream-audio](validation/upstream-audio.json). Excepción limitada al test, versión, archivo de origen, ruta exacta del medio y una aparición. Reproducción, audio y seek deben funcionar igualmente.
- Administración: `Unexpected null reference` en Users se reproduce con y sin tema; Dashboard, Users, Libraries y Plugins continúan utilizables. Core no se monta allí.
- Quick Connect: el rechazo `undefined` del diálogo original se conserva en [authentication-before-quick-connect-fix](validation/authentication-before-quick-connect-fix.json). Se corrigió el call-site, sin listeners globales que oculten errores. La prueba actual exige el hash corregido y **cero excepciones/rechazos** en los tres modos. Véase [instalación](INSTALL.md#quick-connect-en-web-122).

Los fallos iniciales de Firefox, WebKit, sesión y los recorridos interrumpidos permanecen en los informes históricos. Se corrigieron el foco de mouse TV, la cancelación de vistas abandonadas del anfitrión, el montaje asíncrono y los locators/esperas que confundían cambio de URL con detalle listo; se repitieron los recorridos. No se atribuye un crash aislado a upstream sin evidencia: el control WebKit posterior y la regresión completa no lo reprodujeron.

## Android TV

El [informe nativo](../android-tv/evidence/validation.json) registra APK, Gradle, 15 unidades y lint sin Error/Fatal. Persisten 280 warnings y 440 hints upstream, sin hallazgos semánticos añadidos. Las correcciones y excepciones puntuales se justifican en [lint-decisions](../android-tv/docs/lint-decisions.md); no se desactiva lint globalmente.

Los recorridos del APK corregido están en [1080p](../android-tv/evidence/runtime-1080.json) y [salida 4K](../android-tv/evidence/runtime-4k.json). La aceptación requiere 8 PASS en cada archivo y el mismo SHA-256 que el APK de entrega. [device-validation](../android-tv/docs/device-validation.md) explica D-pad, favoritos, reanudación, clipping visual y resolución real. El sistema limita la UI de la salida 4K a 1920×1080: rasterización UI nativa 4K y hardware físico son UNVERIFIED.

## Reproducir

Prepara el [laboratorio](research/LAB.md). Usa solo loopback, medios propios y usuarios descartables. Ejecuta suites que cambian progreso, favoritos, Branding o instalación **en secuencia**. No publiques `.lab`, estados autenticados, traces ni informes completos de Playwright.

```powershell
npm run check
$env:JELLYTV_ENHANCED = '1'
$env:JELLYTV_BROWSER = 'chrome'
npx playwright test tests/e2e/experience.spec.mjs
node scripts/lab/summarize-e2e.mjs enhanced-chrome
npx playwright test tests/e2e/extended.spec.mjs --project=desktop-1080 --project=mobile-390 --project=tv-1080
node scripts/lab/summarize-e2e.mjs extended-chrome
npx playwright test --config playwright.lifecycle.config.mjs
node scripts/lab/summarize-e2e.mjs enhanced-lifecycle
node scripts/lab/validate-core.mjs --mode=all
node scripts/validate-authentication.mjs
node scripts/validate-session.mjs
node scripts/validate-administration.mjs
node scripts/validate-performance.mjs
```

Para Core solo, desinstala Enhanced del laboratorio, usa `JELLYTV_ENHANCED=0`, ejecuta la matriz y reinstálalo al terminar. Para otros motores usa `JELLYTV_BROWSER`; Firefox se limita a proyectos sin `hasTouch`, no admitido por Playwright. Guarda cada resumen antes de ejecutar la siguiente suite. `./scripts/validate-release.ps1` ejecuta secuencialmente la matriz final de ambos modos y los controles adicionales sobre el laboratorio ya preparado; deja los logs privados en `.lab` y publica solo el resumen sanitizado. `python scripts/package-release.py` comprueba los hashes y los PASS vigentes antes de generar el ZIP de entrega.

## Criterio de aceptación

Build/lint/tests PASS; cero errores atribuibles a JellyTV, rechazos sin manejar, botones muertos, traps de foco, UI rota u overflow horizontal accidental conocidos en el alcance probado. Toda excepción upstream requiere evidencia exacta conservada. Las plataformas no ejecutables se declaran UNVERIFIED según [COMPATIBILITY](COMPATIBILITY.md), sin extrapolar WebKit a Safari ni responsive a apps nativas. El cierre y los artefactos quedan registrados en [FINAL_REPORT](../FINAL_REPORT.md).

La última regresión detectó un solapamiento real al volver antes de cargar una ficha; [lifecycle anterior](validation/enhanced-lifecycle-before-final-navigation-retest.json) conserva el fallo. No se debilitó esa prueba: el cleanup del efecto de Web 12.2 activa su flag de cancelación existente. Se repiten el mismo lifecycle y los seis controles con latencia; la suite final exige los hashes de ambas correcciones.
