# Laboratorio local reproducible

Este laboratorio usa **Jellyfin Server y Web 12.2.0 reales**, con usuarios, bibliotecas, imágenes, reproducción y subtítulos reales. No reemplaza Jellyfin con una maqueta ni emplea una biblioteca privada. Todos sus datos quedan en `.lab/`, excluido de Git. Solo escucha en `127.0.0.1:18996`; desactiva acceso remoto, descubrimiento, UPnP e IPv6. No instala un servicio de Windows.

## Preparación en Windows

Se necesitan Node.js 22 o posterior, PowerShell, Python 3 con Pillow y Google Chrome. La ejecución verificada utilizó Node 24.11.1 y Chrome instalado en `C:/Program Files/Google/Chrome/Application/chrome.exe`. `JELLYTV_CHROME` permite indicar otra ruta. Ejecute los comandos desde la raíz del proyecto:

```powershell
npm ci
npm run check
.\scripts\lab\prepare.ps1
python scripts/lab/generate-fixtures.py
.\scripts\lab\start.ps1
node scripts/lab/setup.mjs
node scripts/fix-quick-connect.mjs apply --root .lab/server/jellyfin/jellyfin-web
node scripts/fix-navigation.mjs apply --root .lab/server/jellyfin/jellyfin-web
node scripts/install.mjs install --root .lab/server/jellyfin/jellyfin-web --web-version 12.2
node scripts/lab-core.mjs
$env:JELLYTV_ENHANCED = '1'
npx playwright test tests/e2e/experience.spec.mjs
```

Espere a que `http://127.0.0.1:18996/System/Info/Public` responda antes de ejecutar `setup.mjs`. Si Enhanced ya está instalado, use `update` en lugar de `install`. El script `prepare.ps1` descarga el ZIP oficial de [Jellyfin 12.2 para Windows](https://repo.jellyfin.org/files/server/windows/stable/v12.2/amd64/jellyfin_12.2-amd64.zip) y comprueba SHA-256 `AB247745B54CEA9AF2460C3D62622F5F30A323B02B92D11CEA501B67B9A8D83F` antes de extraerlo. FFmpeg viene en ese paquete; no modifica el PATH del equipo.

`setup.mjs` se limita al puerto local, verifica versión e identidad del servidor, crea contraseñas aleatorias para `JellyTV Admin` y `JellyTV Viewer` y las escribe únicamente en `.lab/credentials.local.json`. No publique ese archivo, `.lab/auth/`, los traces de Playwright ni `test-results/`: contienen sesiones autenticadas. El usuario Viewer no es administrador ni puede borrar contenido.

## Contenido y preferencias

`generate-fixtures.py` produce paisajes procedimentales originales, logos de texto, vídeo H.264/AAC de 12 minutos, subtítulos SRT y audio de prueba. Incluye siete películas (una sin imágenes y otra con título largo), una serie con dos temporadas y seis episodios, y un álbum de dos pistas. Los metadatos NFO son locales y se desactivan los proveedores externos. No se distribuyen imágenes de Apple TV ni películas comerciales.

`setup.mjs` establece una película a los 180 segundos, una favorita y el primer episodio visto. La preparación Playwright guarda estados autenticados separados para escritorio y modo TV. Configura **solo el usuario de laboratorio** mediante la pantalla nativa de preferencias: Continuar viendo, Mis medios, A continuación y contenido reciente. Espera la respuesta real de guardado antes de navegar. JellyTV respeta el orden elegido por cada usuario; no impone ese orden en su código.

## Baseline de consola

El 15 de octubre de 2026 se retiró Enhanced mediante su desinstalador y se vació `CustomCss` temporalmente en este laboratorio. Se efectuaron tres inicios de sesión con contextos nuevos. Los tres mostraron este error antes de autenticar:

```text
WebSocket connection to 'ws://127.0.0.1:18996/socket' failed: Error during WebSocket handshake: Unexpected response code: 403
```

En los tres casos no había scripts JellyTV ni tokens de tema; el inicio de sesión terminó correctamente. La evidencia sanitizada está en [upstream-login.json](../validation/upstream-login.json). El helper de E2E permite **como máximo uno en Chromium**, únicamente en el test de login, la ruta `/login` y con ese mensaje exacto. Esa excepción no filtra errores después de autenticar, excepciones ni rechazos de promesas. El control de audio adicional se delimita por separado más abajo.

La comparación del 19 de octubre también reprodujo el rechazo previo al login en Firefox 157.0 y WebKit 27.2: tres contextos nuevos por motor, con login exitoso, sin variable global Enhanced, sin hero y sin tokens Core. Firefox emite un mensaje distinto y en una ejecución lo duplicó; WebKit usa otra redacción del código 403. [upstream-browser-login.json](../validation/upstream-browser-login.json) registra los mensajes exactos. La excepción de diagnóstico se limita al motor, texto, ruta y número máximo observado (dos en Firefox, uno en WebKit). Se reproduce con `node scripts/lab/verify-browser-login.mjs`: usa respuestas de control en cada contexto y no cambia archivos ni configuración del servidor.

Para reproducir esa comparación use `node scripts/lab/verify-upstream.mjs`, únicamente con la instalación de laboratorio activa. Restaura Branding y Enhanced en `finally`; no lo ejecute simultáneamente con pruebas ni durante una actualización. Ese script vuelve a instalar el `dist` actual al terminar.

## Ampliación de fixtures y diagnósticos

Para colección y reproducción con dos pistas de audio, ejecuta `python scripts/lab/generate-fixtures.py --extended-only`, seguido de `node scripts/lab/prepare-extended.mjs`. Añade el vídeo original Two Frequencies (90 segundos, dos pistas AAC) y una colección real de dos películas. El script limita sus cambios a este servidor verificado. No hace falta regenerar todos los medios.

El control [upstream-audio.json](../validation/upstream-audio.json) reproduce tres veces en Web sin tema el mensaje HLS `otherError / internalException / Fatal: false` al iniciar ese medio. La excepción del helper se limita al test de audio, motor/versión, origen, ruta exacta de ese ítem y como máximo una aparición; conserva el diagnóstico. No autoriza excepciones ni rechazos de promesas.

Los 401 durante logout están conservados en [upstream-logout.json](../validation/upstream-logout.json): doce controles con orden y carga distintos. `validate-session.mjs` compara sesiones nuevas baseline/Core/Enhanced; no cierra la sesión compartida de `.lab/auth`.

Quick Connect tenía un rechazo `undefined` reproducido en los tres modos. [authentication-before-quick-connect-fix.json](../validation/authentication-before-quick-connect-fix.json) conserva el fallo. `validate-authentication.mjs` exige el hash corregido y cero excepciones/rechazos. La corrección es idéntica en los tres modos, incluida la referencia sin tema; se instala y revierte por separado, según [INSTALL](../INSTALL.md#quick-connect-en-web-122).

Las suites web y Android que modifican progreso/favoritos deben ejecutarse **en secuencia**, incluso si no cambian Branding: usan el mismo usuario. Las comparaciones baseline solo deshabilitan Core/Enhanced; no revierten la corrección Quick Connect. Los controles históricos anteriores al parche mantienen sus fechas y hashes originales.

## Matriz y resultados

`playwright.config.mjs` ejecuta Chrome en 13 configuraciones: 1920×1080, 2560×1440, 3840×2160, 1366×768, tabletas 768×1024 y 1024×768, móviles de 320/360/390/430/480 píxeles y modo TV a 1080p y 4K. Móvil/tableta activan `hasTouch`; TV se selecciona en las preferencias reales de Jellyfin. `JELLYTV_BROWSER=edge|chromium|firefox|webkit` permite otras instalaciones de navegador. Una emulación de viewport no demuestra compatibilidad con dispositivos físicos.

Los resultados de cada ejecución están en `test-results/results.json`; las capturas sin secretos de interfaz se guardan en `docs/screenshots/`. Consulte [TESTING.md](../TESTING.md) para los resultados consolidados y sus límites. El éxito de compilar o iniciar el servidor no sustituye el resultado de las pruebas.

Antes de autenticar, la preparación compara los bytes de Core en Branding y los archivos Enhanced instalados con `dist/`. También verifica que `JELLYTV_ENHANCED` coincide con los plugins realmente instalados. Así, una compilación reciente no puede aprobarse usando accidentalmente un tema antiguo. Para comprobar Core sin Enhanced, desinstale Enhanced con `scripts/install.mjs uninstall`, conserve Core en Branding y use `JELLYTV_ENHANCED=0`; reinstale Enhanced al finalizar si desea seguir utilizándolo.

Los recorridos de TV usan los controles Legacy reales: tarjetas y temporadas son botones, las preferencias emplean un selector nativo y el botón de usuario abre directamente la página de ajustes. Las pruebas direccionales usan `ArrowLeft`, `ArrowRight`, `ArrowDown`, `Enter` y `Escape`, comprueban foco visible y verifican que se puede salir del hero hacia las filas nativas.

Para ejecutar otros motores y conservar evidencia pública sin sesiones ni traces:

```powershell
npx playwright install chromium firefox webkit
$env:JELLYTV_ENHANCED = '1'
$env:JELLYTV_BROWSER = 'firefox' # También edge, chromium o webkit
npx playwright test tests/e2e/experience.spec.mjs --project=laptop --project=tv-1080
node scripts/lab/summarize-e2e.mjs enhanced-firefox
```

El resumen incluye versión real del navegador, pruebas por proyecto, errores inesperados, errores upstream ya documentados, auditoría de accesibilidad y hashes del build. La selección de proyectos de Firefox evita `hasTouch`, que Playwright no admite en ese motor. WebKit sobre Windows no sustituye una prueba de Safari en macOS/iOS, y Chrome con viewport móvil no sustituye Android WebView. Las capturas de motores adicionales llevan el nombre del navegador para no sobrescribir la evidencia de Chrome.

Para detener solo este proceso:

```powershell
.\scripts\lab\stop.ps1
```

El script comprueba que el PID aún corresponde al ejecutable ubicado dentro de `.lab/server/jellyfin/` antes de detenerlo. La carpeta `.lab` puede conservarse para repetir las validaciones.

El control [navigation-race-before-fix](../validation/navigation-race-before-fix.json) reproduce la ficha tardía sobre Inicio en seis contextos sin tema/Core/Enhanced, retrasando 300ms el controlador real y regresando antes de cargar. [navigation-race](../validation/navigation-race.json) repite exactamente el protocolo tras cancelar las vistas abandonadas: solo Inicio queda visible. Los informes finales verifican los dos hashes del frontend mediante `compatibilityEvidence`; las comparaciones sin tema conservan ambos arreglos.
