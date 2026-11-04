# JellyTV para Android TV

Adaptación de fuentes para Jellyfin Android TV **0.19.10**, fijada al commit `984181a3d6ab14e9a6d2dcc850c582e1c138bd95`. Incluye interfaz de Inicio y ajustes para el foco del mando. [Upstream](https://github.com/jellyfin/jellyfin-androidtv/tree/984181a3d6ab14e9a6d2dcc850c582e1c138bd95)

Requiere un checkout limpio del commit indicado, Python 3.10 o posterior, JDK 21 y Android SDK con plataforma y Build Tools 36. Configura las rutas del JDK y SDK para tu entorno.

```sh
git clone https://github.com/jellyfin/jellyfin-androidtv.git jellyfin-androidtv
git -C jellyfin-androidtv checkout 984181a3d6ab14e9a6d2dcc850c582e1c138bd95
python3 android-tv/scripts/theme.py apply jellyfin-androidtv
python3 android-tv/scripts/theme.py check jellyfin-androidtv
```

Para compilar con PowerShell usa `./android-tv/scripts/build.ps1 -Source jellyfin-androidtv -JdkHome YOUR_JDK -SdkHome YOUR_ANDROID_SDK`. Usa `theme.py revert` con el mismo checkout para restaurarlo. El manifiesto fija los hashes del árbol y el payload. [Manifiesto](manifest.json) · [Parche](patches/jellytv-v0.19.10.patch) · [GPL-2.0](LICENSE)

El plugin Kotlin fijado por upstream está afectado por CVE-2026-53914. El runner desactiva la caché de compilación Gradle. Usa un checkout limpio y un directorio Gradle privado con `-WorkDirectory YOUR_BUILD_DIRECTORY`. La actualización del plugin requiere validar una nueva base upstream. [Aviso de seguridad](https://github.com/advisories/GHSA-r937-wjx7-w2jp)

El APK histórico incluía Guava 33.3.1-android, afectada por CVE-2026-102554. Su distribución queda pendiente de actualizar y verificar las dependencias, compilar y validar un APK nuevo. [Aviso de Guava](https://github.com/advisories/GHSA-xxph-c9ww-hj94)
