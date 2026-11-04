# Arquitectura

`theme/` contiene los perfiles CSS de Core. `enhanced/` contiene el adaptador de sesión, la composición del hero, el carrusel y los estilos de Enhanced. `npm run build` genera CSS, JavaScript y hashes en `dist/`.

Enhanced usa el cliente API activo de Jellyfin para el contenido y las imágenes. Mantiene sus datos en memoria durante la sesión. Las acciones de favoritos y reproducción se ejecutan mediante los servicios de Jellyfin.

`installer/` gestiona la instalación desde el host con Docker. El journal registra el estado previo y posterior de cada operación. El instalador verifica la identidad del contenedor, la salud local y los bytes que va a restaurar. El bootstrap usa la misma transacción. [Instalador Docker](CASAOS_INSTALLER.md)

`scripts/install.mjs` ofrece una ruta separada para un Webroot local. Cada instalador conserva su propio estado. Usa el mismo método para desinstalar que utilizaste al instalar.

Los parches de `web-compat/` se aplican por separado con hashes fijados. `android-tv/` contiene una adaptación independiente para la aplicación nativa. [Compatibilidad Web](../web-compat/README.md) · [Android TV](../android-tv/README.md)
