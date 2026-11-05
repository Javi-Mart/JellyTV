# Compatibilidad

| Componente | Versión objetivo | Condición |
|---|---|---|
| Core y Enhanced 1.1 | Jellyfin Web 10.10.6 | Candidato dev.3. Ficha Legacy de escritorio y móvil. Navegación y estados Enhanced cubiertos en Chrome y WebKit |
| Instalador CasaOS/Docker | Jellyfin Server 10.10.6 y compilación Web reconocida | Compatibilidad conservada con un riesgo externo aceptado. Validación en laboratorio aislado |
| Instalador Web local | Perfiles 10.10.6 y 12.2 | 12.2 es el perfil histórico de 1.0 |
| Android TV | Jellyfin Android TV 0.19.10 | Adaptación separada al commit fijado |

El Webroot modificado se aplica a clientes que sirven ese frontend. Las aplicaciones con frontend integrado deben evaluarse por separado. La detección de Nvidia indica que hay configuración de dispositivos o runtime en Docker. La transcodificación física queda fuera de esa comprobación.

El refinamiento de la ficha usa las dos capas que expone Web 10.10.6. Los perfiles históricos conservan su composición de detalle. La validación responsive y TV Web se ejecuta en navegador de laboratorio. La adaptación nativa Android TV y los dispositivos físicos requieren una validación separada.

CVE-2025-31499 afecta Jellyfin Server hasta 10.10.6. El instalador de JellyTV comprueba la compatibilidad del frontend. La corrección del servidor corresponde a Jellyfin y mantener 10.10.6 conserva el riesgo. [Política de JellyTV](../SECURITY.md) · [Aviso de severidad alta](https://github.com/jellyfin/jellyfin/security/advisories/GHSA-2c3c-r7gp-q32m)

Los parches de Web tienen su propia comprobación de integridad. [Compatibilidad Web](../web-compat/README.md)
