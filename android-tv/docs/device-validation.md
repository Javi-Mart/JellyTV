# Validación nativa

Laboratorio aislado Jellyfin Server 12.2, cliente Android TV v0.19.10 con adaptación JellyTV, emulador Android TV API 34 x86 y aceleración WHPX en Windows. No se ha conectado a producción.

Los informes [1080p](../evidence/runtime-1080.json) y [salida 4K](../evidence/runtime-4k.json) registran el hash del APK instalado. Un resultado solo valida ese APK. La [compilación](../evidence/validation.json) registra 15 pruebas unitarias, los XML completos de lint y el hash del APK; `build.ps1` rechaza cualquier Error/Fatal aunque Gradle devuelva éxito.

## Recorridos

Cada ejecución usa únicamente teclas ADB del mando: Home, Info/Back con restauración de foco, favorito persistente y restauración, carrusel con artwork ausente/título largo, salida vertical hacia filas/header, reproducción real, reanudación desde 180 segundos y Home → fila → película → detalles → Play → Back → fila. No se inyectan vistas ni respuestas de medios. Los controles del hero se miden con un mínimo de 44 dp. Las capturas y el árbol accesible se conservan como evidencia complementaria.

La comprobación visual de Inicio exige píxeles de texto claro en el rectángulo de «Continue watching» de la biblioteca oscura controlada. Detecta el defecto encontrado al revisar capturas: Leanback desactiva el clipping de sus ancestros para ampliar el foco, y el backdrop `CENTER_CROP` podía tapar la fila aunque siguiera presente en el árbol accesible. `cropToPadding` acota la imagen a sus propios límites. La repetición del 22 de octubre pasa los ocho recorridos en ambas configuraciones con el APK corregido `e7d31d38…`; el título aporta 2.371 píxeles claros visibles en la comprobación 4K. Las capturas finales se revisaron visualmente.

## Resolución real

El emulador se arranca con `-skin 1920x1080` o `-skin 3840x2160`. La imagen Android TV establece `config_maxUiWidth=1920`, verificado con `adb shell cmd overlay lookup android android:integer/config_maxUiWidth`. Por ello la salida 4K utiliza una superficie UI de 1920×1080 a 320 dpi. El informe separa `outputPixels` de `viewportPixels`; no se afirma rasterización UI nativa 3840×2160. Este comportamiento está documentado en el [overlay oficial de Android TV](https://android.googlesource.com/device/google/atv/+/7744c276792cb868d5d24bb7e0a870e40b77a7d3/overlay/TvFrameworkOverlay/res/values/config.xml).

La primera prueba 4K aplicó 640 dpi sobre una UI que permanecía en 1080p y produjo solapamientos. Se conserva como [configuración inválida](../evidence/runtime-invalid-4k-density.json), no como evidencia 4K válida. El runner actual comprueba el framebuffer, el límite del sistema y las dimensiones PNG antes de aprobar una captura. No se cambia el límite del sistema para hacer pasar las pruebas.

## Reproducir

Primero prepara el laboratorio y guarda una sesión inglesa del usuario limitado en el emulador, con **Preferences → Display → Theme → JellyTV**. El APK debe coincidir con el informe de compilación. Mantén un servidor ADB dedicado al puerto 5038 y arranca el AVD con el framebuffer adecuado. Ejecuta las pruebas web y nativas que modifican progreso/favoritos **en secuencia**: comparten datos del usuario de laboratorio.

El runner requiere Python 3.10+ y Pillow (`python -m pip install Pillow`). Comprueba `sys.boot_completed=1` antes de ejecutarlo; el runner rechaza un arranque incompleto o un APK distinto del informe de build.

```powershell
python android-tv/scripts/validate-device.py --adb C:/tools/android-sdk/platform-tools/adb.exe --resolution 1080
# Reiniciar el emulador con -skin 3840x2160 antes de la siguiente ejecución.
python android-tv/scripts/validate-device.py --adb C:/tools/android-sdk/platform-tools/adb.exe --resolution 4k
```

Dos ejecuciones previas se interrumpieron al desaparecer el daemon ADB. Los informes `runtime-1080-before-adb-retest.json` y `runtime-1080-adb-transport-interruption.json` conservan esos fallos; no se ocultan con reintentos de acciones. El servidor ADB persistente resolvió las interrupciones posteriores.

Un intento del 22 de octubre empezó antes de terminar el arranque Android; se conserva en `runtime-4k-before-boot-ready.json`. La ejecución completa posterior pasa. El runner ahora rechaza ese estado antes de iniciar casos, sin reintentar teclas para ocultar fallos.

## Límites

UNVERIFIED: televisor físico, Google TV/Fire TV específicos, HDR, HDMI-CEC, decodificación 4K de hardware, lector de pantalla y rasterización UI nativa 4K. La evidencia corresponde al emulador y los medios locales descritos; no certifica cualquier dispositivo Android TV.
