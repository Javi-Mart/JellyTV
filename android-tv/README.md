# JellyTV para Android TV

Adaptación nativa y opcional de Jellyfin Android TV **v0.19.10**, commit `984181a3d6ab14e9a6d2dcc850c582e1c138bd95`. Usa recursos Android, Compose y Leanback; el CSS de Jellyfin Web no se aplica a este cliente.

Adaptación JellyTV 1.0.0. Se entrega un APK de depuración para instalación local, con build, lint y 15 unidades PASS; ocho recorridos D-pad pasan tanto en salida 1080p como 4K del emulador. No es una publicación firmada para tiendas. Los hashes, resultados y límites se documentan en [evidence/validation.json](evidence/validation.json) y [validación del dispositivo](docs/device-validation.md).

Incluye colores oscuros compartidos con Web, foco visible en tarjetas y controles, botones de 44 dp y un hero que consulta hasta seis películas o series accesibles al usuario. El hero presenta fondo, logo con título alternativo, sinopsis, metadatos, progreso, Play/Resume, Info, favoritos e indicadores manuales. Las acciones utilizan las API, el enrutamiento y el reproductor nativos. Mantiene las filas configuradas por el usuario; no reproduce automáticamente ni guarda tokens adicionales.

## Instalación de prueba

El APK de `dist/` utiliza el identificador `org.jellyfin.androidtv.debug`: puede convivir con la aplicación oficial. Necesita iniciar sesión por separado. Instálalo únicamente en un dispositivo de pruebas que controles:

```powershell
adb install -r android-tv/dist/jellyfin-androidtv-v0.19.10-jellytv.1-debug.apk
```

En la aplicación abre **Preferences → Display → Theme → JellyTV** y vuelve a Inicio. El tema es opcional: seleccionar el tema anterior revierte la apariencia y retira el hero. Reinicia la actividad si el cliente lo solicita. El APK de depuración puede reemplazar otra instalación de depuración firmada con la misma clave; no reemplaza la aplicación oficial.

Para retirar únicamente esta aplicación de pruebas (incluidos sus ajustes y sesiones locales):

```powershell
adb uninstall org.jellyfin.androidtv.debug
```

## Archivos y licencia

- [APK debug](dist/jellyfin-androidtv-v0.19.10-jellytv.1-debug.apk).
- [Fuentes completas correspondientes](dist/jellyfin-androidtv-v0.19.10-jellytv.1-source.zip), con upstream y los 23 cambios.
- [Manifiesto SHA-256](dist/manifest.json).
- [Decisiones de lint](docs/lint-decisions.md) y [recorridos/capturas](docs/device-validation.md).

El archivo de fuentes incluye instrucciones de compilación y la licencia GPL-2.0. La clave privada debug se genera localmente y no se distribuye.

## Compilación reproducible

Requisitos: Git, Python 3.10+, JDK 21, Android SDK con plataforma 36 y Build Tools 36.0.0. El wrapper fijado por upstream descarga Gradle 9.1.0. No se incluye una clave privada de publicación.

```powershell
git clone https://github.com/jellyfin/jellyfin-androidtv.git jellyfin-androidtv
git -C jellyfin-androidtv checkout 984181a3d6ab14e9a6d2dcc850c582e1c138bd95
python android-tv/scripts/theme.py apply jellyfin-androidtv
python android-tv/scripts/theme.py check jellyfin-androidtv
./android-tv/scripts/build.ps1 -Source jellyfin-androidtv -JdkHome C:/tools/jdk-21 -SdkHome C:/tools/android-sdk
```

El script comprueba los 1.033 archivos de upstream y los hashes del payload antes de compilar. Ejecuta `assembleDebug`, `lintDebug` y `testDebugUnitTest`, y lee los XML de lint. Upstream permite que Gradle termine con éxito aunque existan errores de lint; el script de JellyTV devuelve error en ese caso. No confundir `BUILD SUCCESSFUL` con aceptación completa.

## Actualización y reversión del código

La adaptación está fijada a este commit. No aplicar el parche a otra versión: el comprobador lo rechaza. Conserva una copia de tu checkout antes de actualizar y prueba cada nueva adaptación en un checkout limpio.

```powershell
python android-tv/scripts/theme.py revert jellyfin-androidtv
```

`apply`, `check` y `revert` son idempotentes; no sobrescriben ediciones locales ni aceptan un parche parcialmente aplicado. El [parche unificado](patches/jellytv-v0.19.10.patch), [payload](payload/) y [manifiesto](manifest.json) contienen el mismo cambio. La prueba reversible se ejecuta con `python android-tv/scripts/test_package.py jellyfin-androidtv`.

## Alcance y límites

- Interfaz y cadenas nuevas en inglés y español; otras lenguas utilizan fallback inglés para esas cadenas.
- Carrusel manual: no hay temporizador que cambie el contenido mientras el mando está en uso.
- API y reproducción reales contra el laboratorio Jellyfin 12.2; ningún servidor privado se ha modificado.
- La validación en emulador no demuestra decodificación, HDR, HDMI-CEC ni comportamiento de mandos de un televisor físico. Estas comprobaciones requieren hardware real.
- La licencia de esta adaptación y del código upstream distribuido es [GPL-2.0](LICENSE). El CSS y JavaScript web tienen su licencia propia en la raíz del proyecto.
