# JellyTV

JellyTV es un tema para Jellyfin Web. **Core** personaliza Inicio, bibliotecas, fichas y navegación mediante CSS. **Enhanced** agrega un hero y un carrusel de contenido de la biblioteca, con controles para ratón, teclado, pantalla táctil y foco de TV.

El código Web corresponde a **1.1.0-dev.3**, un candidato dirigido a **Jellyfin Server y Web 10.10.6**. Core integra el backdrop de las fichas con el contenido. Enhanced sincroniza imagen y texto al cambiar de título y confirma Favoritos con un corazón relleno. [Cambios](CHANGELOG.md) · [Compatibilidad](docs/COMPATIBILITY.md) · [Seguridad](SECURITY.md) · [Android TV](android-tv/README.md)

## Instalar

1. Guarda tu CSS actual de Jellyfin. Aplica `dist/jellytv-core.css` en **Panel de control → Marca → CSS personalizado**, guarda y recarga el cliente.
2. Para Enhanced en CasaOS o Docker, revisa la instalación inicial o la actualización desde dev.2. La ficha cinematográfica usa el CSS de Core de esta versión. [Actualizar desde dev.2](docs/CASAOS_INSTALLER.md#actualizar-desde-110-dev2) · [Primera instalación](docs/BOOTSTRAP_INSTALLER.md)
3. Para un Webroot local sin Docker, utiliza la CLI Node con el perfil de versión correspondiente. [Instalación manual](docs/INSTALL.md)

Enhanced utiliza la sesión activa de Jellyfin para leer contenido y enviar las acciones que el usuario solicita. En Docker, el instalador necesita acceso al daemon local y guarda una copia de los archivos Web que administra para poder restaurarlos. [Arquitectura](docs/ARCHITECTURE.md)

## Desarrollo

Usa una versión LTS actualizada de Node.js 22 o 24 y una versión de Python con soporte de seguridad. Ejecuta `npm ci --ignore-scripts` y `npm run check` para compilar, comprobar estilos y ejecutar las pruebas unitarias. Los cambios del instalador deben cubrir preflight, restauración y errores de integridad. [Pruebas](docs/TESTING.md) · [Cambios](CHANGELOG.md) · [Versiones de Node.js](https://nodejs.org/en/about/previous-releases) · [Soporte de Python](https://devguide.python.org/versions/)

El tema Web y el instalador se distribuyen con licencia MIT. Los parches derivados de Jellyfin tienen sus propios avisos y licencias. [MIT](LICENSE) · [Licencias y procedencia](docs/THIRD_PARTY.md)
