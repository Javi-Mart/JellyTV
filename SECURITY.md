# Seguridad

## Plataforma Jellyfin

El objetivo de compatibilidad de JellyTV Enhanced para CasaOS/Docker es **Jellyfin Server y Web 10.10.6**, con las compilaciones Web reconocidas por el preflight. Se conserva como decisión explícita de compatibilidad. Jellyfin Server 10.10.6 está afectado por **CVE-2025-31499**. Es un riesgo aceptado de la plataforma externa y JellyTV no aplica la corrección del servidor. Mantener esa versión tampoco proporciona los parches de las versiones con soporte vigente. Las pruebas de JellyTV se ejecutan en un laboratorio aislado. [Aviso de Jellyfin](https://github.com/jellyfin/jellyfin/security/advisories/GHSA-2c3c-r7gp-q32m) · [Política de seguridad de Jellyfin](https://github.com/jellyfin/jellyfin/security)

## Instalador Enhanced

El instalador necesita acceso administrativo al Docker local. Comprueba el contenedor, los hashes del Webroot y el estado antes de escribir. Las instalaciones remotas requieren un tag explícito. El bootstrap generado para una versión estable verifica un SHA-256 fijado antes de elevar privilegios y vuelve a verificar los bytes que ejecuta. Un checksum obtenido del mismo origen depende de la confianza en ese origen. [Procedimiento y recuperación](docs/CASAOS_INSTALLER.md)

## Reportar un problema

Si el repositorio de distribución habilita el canal privado de avisos de GitHub, úsalo para comunicar la versión, el componente afectado y una reproducción con datos sintéticos. Elimina credenciales, URL de sesión, información de bibliotecas y rutas privadas de cualquier evidencia adjunta. [Notificación privada de vulnerabilidades en GitHub](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
