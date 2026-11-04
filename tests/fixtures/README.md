# Fixtures de compatibilidad

Extrae los archivos de la distribución oficial de Jellyfin Web y copia cada uno al nombre de fixture de la tabla. Los manifiestos fijan el nombre exacto y SHA-256 de los bytes que aceptan los aplicadores.

| Fixture local | Manifiesto |
|---|---|
| `main-web-10.10.6.bundle.fixture` | [scroll-options-10.10.6.json](../../web-compat/scroll-options-10.10.6.json) |
| `login-web-10.10.6.chunk.fixture` | [quick-connect-10.10.6.json](../../web-compat/quick-connect-10.10.6.json) |
| `main-web-12.2.bundle.fixture` | [navigation.json](../../web-compat/navigation.json) |
| `login-web-12.2.chunk.fixture` | [quick-connect.json](../../web-compat/quick-connect.json) |

Ejecuta `npm run test:compat` después de preparar las cuatro fixtures. Git ignora los archivos compilados de upstream. Los fixtures sintéticos que viven dentro de las pruebas usan datos de ejemplo. [Licencia de Jellyfin Web](../../web-compat/LICENSE)
