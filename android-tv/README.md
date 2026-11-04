# JellyTV para Android TV

La adaptación **0.19.10-jellytv.2** de JellyTV **1.1.0-dev.1** parte de Jellyfin Android TV **0.19.10**, fijado al commit `984181a3d6ab14e9a6d2dcc850c582e1c138bd95`. Incluye el Inicio JellyTV con hero, carrusel y foco para mando. El objetivo de servidor es Jellyfin 10.10.6. [Upstream](https://github.com/jellyfin/jellyfin-androidtv/tree/984181a3d6ab14e9a6d2dcc850c582e1c138bd95) · [Riesgo de la plataforma](../SECURITY.md)

Requiere un checkout limpio del commit indicado, una versión de Python con soporte de seguridad, JDK 21 y Android SDK con plataforma y Build Tools 36. Configura las rutas del JDK y SDK para tu entorno.

```sh
git clone https://github.com/jellyfin/jellyfin-androidtv.git jellyfin-androidtv
git -C jellyfin-androidtv checkout 984181a3d6ab14e9a6d2dcc850c582e1c138bd95
python3 android-tv/scripts/theme.py apply jellyfin-androidtv
python3 android-tv/scripts/theme.py check jellyfin-androidtv
```

Para compilar con PowerShell usa `./android-tv/scripts/build.ps1 -Source jellyfin-androidtv -JdkHome YOUR_JDK -SdkHome YOUR_ANDROID_SDK`. Usa `theme.py revert` con el mismo checkout para restaurarlo. El manifiesto fija los hashes del árbol y el payload. [Manifiesto](manifest.json) · [Parche](patches/jellytv-v0.19.10.patch) · [GPL-2.0](LICENSE)

## Dependencias y compilación

El parche fija Kotlin Gradle Plugin y la biblioteca estándar en **2.4.21**, Guava en **33.7.2-android** para el APK y **33.7.2-jre** en las dependencias resueltas del buildscript, y D8/R8 en **9.1.29** para Kotlin 2.4. El wrapper fija Gradle **8.14.6** y el SHA-256 de su distribución oficial. Usa un checkout limpio y un directorio Gradle privado con `-WorkDirectory YOUR_BUILD_DIRECTORY`. El runner desactiva la caché de compilación de Gradle. [Aviso de Kotlin](https://github.com/advisories/GHSA-r937-wjx7-w2jp) · [Aviso de Guava](https://github.com/google/guava/security/advisories/GHSA-xxph-c9ww-hj94) · [Correcciones de Gradle](https://docs.gradle.org/8.14.6/release-notes.html) · [Compatibilidad D8/R8](https://developer.android.com/build/kotlin-support)

El APK debug usa `org.jellyfin.androidtv.jellytv.debug`. Instálalo en un dispositivo de pruebas con `adb install PATH_TO_DEBUG_APK` y selecciona **Preferencias → Personalización → Tema de la aplicación → JellyTV**. El identificador de distribución es `org.jellyfin.androidtv.jellytv`. Ambos pueden coexistir con la aplicación oficial.

## Firma de distribución

La firma de distribución está pendiente. Conserva el keystore y `gradle.properties` en un directorio Gradle privado fuera del checkout. Configura `keystore.file`, `keystore.password`, `signing.key.alias` y `signing.key.password` en ese archivo. Desde el upstream ya verificado y parcheado, configura `JAVA_HOME`, `ANDROID_HOME` y `GRADLE_USER_HOME` y ejecuta `./gradlew --no-daemon --no-build-cache -Pjellyfin.version=0.19.10-jellytv.2 assembleRelease`. Usa `gradlew.bat` en Windows.

Verifica la firma y el certificado con `apksigner verify --verbose --print-certs PATH_TO_RELEASE_APK`, el identificador con `aapt dump badging PATH_TO_RELEASE_APK` y calcula SHA-256. Repite las pruebas de instalación y reproducción con ese APK. Conserva las fuentes correspondientes al build y su licencia junto con el artefacto de distribución.
