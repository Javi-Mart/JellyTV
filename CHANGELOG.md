# Cambios

## 1.1.0-dev.1

- Android TV 0.19.10-jellytv.2 actualiza Guava y Kotlin, limita las dependencias de compilación afectadas y separa los identificadores de aplicación debug y release.
- La CLI de CasaOS/Docker exige el repositorio de distribución y la versión explícitos para descargar. Los candidatos locales siguen usando `--bundle`.
- El bootstrap comprueba que las descargas incompletas, los fallos HTTP y los tiempos agotados se detienen antes de ejecutar código con privilegios.
- Jellyfin Server y Web 10.10.6 siguen siendo el objetivo. La firma Android de distribución y la aceptación de una versión estable siguen pendientes. [Seguridad](SECURITY.md) · [Compatibilidad](docs/COMPATIBILITY.md)

## 1.1.0-dev.0

- Perfil Web 10.10.6 para fichas, composición de portada y navegación.
- Hero y carrusel expandido con metadata y acciones de la biblioteca activa.
- Instalador CasaOS/Docker con comprobaciones de versión, diario, copias de archivos Web y restauración.
- El bootstrap verifica la descarga antes de solicitar privilegios y vuelve a verificar los bytes antes de ejecutarlos. La CLI remota exige una versión explícita.
- La copia pública se construye a partir del código, la documentación y las pruebas reproducibles. Los artefactos de compilación se generan por separado.

La aceptación de esta versión sigue abierta. [Compatibilidad](docs/COMPATIBILITY.md)

## 1.0.0

- Perfil Web 12.2 y adaptación separada para Jellyfin Android TV 0.19.10.
- Parches de compatibilidad para el cierre de Quick Connect y la navegación durante cargas lentas.
