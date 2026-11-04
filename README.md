# JellyTV

JellyTV es un tema para Jellyfin Web. **Core** personaliza Inicio, bibliotecas, fichas y navegación mediante CSS. **Enhanced** agrega un hero y un carrusel de contenido de la biblioteca, con controles para ratón, teclado, pantalla táctil y foco de TV.

El código actual corresponde a **1.1.0-dev.0**, un candidato dirigido a **Jellyfin Server y Web 10.10.6**. Ese perfil está reservado para laboratorios aislados por una vulnerabilidad de severidad alta en Jellyfin Server. La adaptación para Android TV tiene su propia versión y sus propias instrucciones. [Compatibilidad](docs/COMPATIBILITY.md) · [Aviso de Jellyfin](https://github.com/jellyfin/jellyfin/security/advisories/GHSA-2c3c-r7gp-q32m) · [Android TV](android-tv/README.md)

## Instalar

1. Guarda tu CSS actual de Jellyfin. Aplica `dist/jellytv-core.css` en **Panel de control → Marca → CSS personalizado**, guarda y recarga el cliente.
2. Para Enhanced en CasaOS o Docker, revisa los requisitos y el procedimiento de instalación inicial. Después puedes consultar estado, actualizar a una versión explícita, volver a la versión anterior o desinstalar desde `jellytv`. [Instalador CasaOS](docs/CASAOS_INSTALLER.md) · [Primera instalación](docs/BOOTSTRAP_INSTALLER.md)
3. Para un Webroot local sin Docker, utiliza la CLI Node con el perfil de versión correspondiente. [Instalación manual](docs/INSTALL.md)

Enhanced utiliza la sesión activa de Jellyfin para leer contenido y enviar las acciones que el usuario solicita. En Docker, el instalador necesita acceso al daemon local y guarda una copia de los archivos Web que administra para poder restaurarlos. [Arquitectura](docs/ARCHITECTURE.md)

## Desarrollo

Usa Node.js 22.13 o posterior dentro de la rama 22, o Node.js 24 o posterior, además de npm y Python 3.9 o posterior. Ejecuta `npm ci --ignore-scripts` y `npm run check` para compilar, comprobar estilos y ejecutar las pruebas unitarias. Los cambios del instalador deben cubrir preflight, restauración y errores de integridad. [Pruebas](docs/TESTING.md) · [Cambios](CHANGELOG.md)

El tema Web y el instalador se distribuyen con licencia MIT. Los parches derivados de Jellyfin tienen sus propios avisos y licencias. [MIT](LICENSE) · [Licencias y procedencia](docs/THIRD_PARTY.md)
