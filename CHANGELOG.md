# Cambios

## 1.1.0-dev.3

- Fichas Web 10.10.6 con fundido continuo en los backdrops compartidos de escritorio y los backdrops inline del modo móvil. Los detalles técnicos y las etiquetas quedan en una jerarquía secundaria.
- Hero con arte más visible, una posición estable para el título y sus acciones, y un cambio coordinado de backdrop y metadata cuando llega la nueva imagen.
- Corazón relleno y confirmación de Favoritos coherentes entre Hero, carrusel y preview. La interfaz espera el resultado de Jellyfin antes de cambiar el estado.
- Tokens de movimiento comunes, transiciones del carrusel sin dos animaciones sobre la misma imagen y ajustes táctiles y de movimiento reducido.
- La navegación Web de dev.2 sigue cubierta por regresiones con varias instancias Home. [Diseño](docs/DESIGN_SYSTEM.md) · [Movimiento](docs/MOTION_SYSTEM.md) · [Pruebas](docs/TESTING.md)

## 1.1.0-dev.2

- Corrige la desaparición del hero y del carrusel al volver de Películas o de una ficha. Enhanced identifica el Inicio visible cuando Jellyfin conserva varias vistas con los mismos IDs.
- La metadata válida se reutiliza al reemplazar Inicio. Las solicitudes pendientes se comparten dentro de la misma sesión y el cambio de usuario invalida sus resultados.
- Añade regresiones de navegación y reconstrucción de Inicio en Jellyfin Web 10.10.6. [Actualizar Enhanced desde dev.1](docs/CASAOS_INSTALLER.md#actualizar-desde-110-dev1)

## 1.1.0-dev.1

- Android TV 0.19.10-jellytv.2 actualiza Guava y Kotlin, fija Gradle 8.14.6 con su SHA-256 y separa los identificadores de aplicación debug y release.
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
