# Compatibilidad

| Componente | Versión objetivo | Condición |
|---|---|---|
| Core y Enhanced 1.1 | Jellyfin Web 10.10.6 | Candidato de desarrollo |
| Instalador CasaOS/Docker | Jellyfin Server 10.10.6 y compilación Web reconocida | Laboratorio aislado. Distribución bloqueada hasta validar una versión con soporte de seguridad |
| Instalador Web local | Perfiles 10.10.6 y 12.2 | 12.2 es el perfil histórico de 1.0 |
| Android TV | Jellyfin Android TV 0.19.10 | Adaptación separada al commit fijado |

El Webroot modificado se aplica a clientes que sirven ese frontend. Las aplicaciones con frontend integrado deben evaluarse por separado. La detección de Nvidia indica que hay configuración de dispositivos o runtime en Docker. La transcodificación física queda fuera de esa comprobación.

CVE-2025-31499 afecta Jellyfin Server hasta 10.10.6. El instalador de JellyTV comprueba la compatibilidad del frontend. La corrección del servidor corresponde a Jellyfin. [Aviso de severidad alta](https://github.com/jellyfin/jellyfin/security/advisories/GHSA-2c3c-r7gp-q32m) · [Política de soporte de seguridad](https://github.com/jellyfin/jellyfin/security)

Los parches de Web tienen su propia comprobación de integridad. [Compatibilidad Web](../web-compat/README.md)
