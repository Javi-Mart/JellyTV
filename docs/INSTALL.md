# Instalación Web

Para Core, copia `dist/jellytv-core.css` al campo CSS personalizado de Jellyfin. Guarda antes el CSS anterior para poder recuperarlo.

Para CasaOS/Docker, usa el instalador del host. [Procedimiento Docker](CASAOS_INSTALLER.md)

Para un Webroot local administrado por ti, ejecuta los comandos siguientes con un usuario que tenga acceso a ese directorio. Sustituye `YOUR_WEBROOT` por la ruta absoluta. Prepara una copia original y detén otras tareas que escriban en el mismo Webroot.

```sh
node scripts/install.mjs install --root "YOUR_WEBROOT" --web-version 10.10.6 --dry-run
node scripts/install.mjs install --root "YOUR_WEBROOT" --web-version 10.10.6
node scripts/install.mjs status --root "YOUR_WEBROOT"
```

Para actualizar, prepara un `dist` de la versión que quieras instalar y ejecuta `update` con el mismo perfil. `rollback` restaura la versión anterior o la instalación original. `uninstall` restaura los archivos iniciales. Si se interrumpe una operación, usa `recover --dry-run` y revisa el resultado antes de ejecutar `recover`. Conserva los archivos de estado y sus copias mientras exista una instalación administrada.
