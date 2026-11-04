# Instalador CasaOS y Docker

Se mantiene el perfil de Jellyfin Server 10.10.6, afectado por CVE-2025-31499. El preflight verifica compatibilidad, y las pruebas del instalador se hacen en un laboratorio aislado. [Compatibilidad](COMPATIBILITY.md) · [Riesgo de la plataforma](../SECURITY.md)

Requiere un host Linux con Python 3.9 o posterior y acceso al daemon Docker local. Ejecuta el instalador como un administrador de confianza. El acceso al daemon Docker concede privilegios sobre el host. [Seguridad de Docker Engine](https://docs.docker.com/engine/security/)

La selección automática requiere un único contenedor Jellyfin en ejecución. Para varias instancias usa `--container YOUR_JELLYFIN_CONTAINER`. El preflight comprueba la versión del servidor, los bytes del bundle Web, los montajes y la salud por loopback. Para un puerto o prefijo personalizados, indica la URL local con `--url`. En instalaciones no estándar puedes indicar `--webroot YOUR_WEBROOT`.

## Operaciones

Primero registra la CLI con el [bootstrap](BOOTSTRAP_INSTALLER.md). Sustituye `X.Y.Z` por una versión publicada y aceptada, y `OWNER/REPOSITORY` por el repositorio de distribución confirmado. Ejecuta `--dry-run` antes de una mutación y revisa el plan.

```sh
sudo jellytv status
sudo jellytv install --repo OWNER/REPOSITORY --version X.Y.Z --dry-run
sudo jellytv update --repo OWNER/REPOSITORY --version X.Y.Z --dry-run
sudo jellytv rollback
sudo jellytv uninstall
```

`install` y `update` descargan el ZIP del tag indicado, verifican el digest informado por GitHub y comprueban los hashes y el manifiesto internos. El archivo opcional `--token-file` debe ser privado, regular, sin enlaces y propiedad del usuario que ejecuta la CLI. Un digest del mismo origen protege contra corrupción y depende de la confianza en ese origen. [Assets de releases de GitHub](https://docs.github.com/en/rest/releases/assets)

Para un ZIP local de desarrollo usa `--bundle /ruta/al/archivo.zip --allow-development --dry-run`. Desinstalar restaura los archivos Web originales y conserva la herramienta de administración.

## Estado y recuperación

Se gestionan dos recursos Enhanced, `config.json`, `index.html` y un marcador. El estado y el journal se guardan en `/var/lib/jellytv`. El directorio debe pertenecer al usuario que ejecuta la herramienta, con modo 700, y sus padres deben tener propietarios de confianza y permisos que impidan escritura compartida.

Para escribir en Web, el instalador exige archivos y directorios administrados por root o por el usuario efectivo dentro del contenedor. Rechaza enlaces y permisos de escritura para grupo u otros en esas rutas.

`status` indica si la configuración coincide, si los archivos conservan sus bytes y si quedó una operación interrumpida. `rollback` recupera primero una operación interrumpida. Si hay ediciones ajenas, conserva el journal para revisión. Tras una actualización correcta, `rollback` puede volver a la generación anterior. Conserva las copias hasta haber verificado los archivos y la salud del servidor.

Si CasaOS recrea el contenedor, comprueba el estado y compatibilidad de la nueva generación. Usa `install --reinstall --repo OWNER/REPOSITORY --version X.Y.Z --dry-run` para revisar una nueva instalación. La identidad de un contenedor anterior limita la restauración de sus backups a esa generación. Los reemplazos son individuales y las pruebas de recuperación cubren fallos de proceso en el laboratorio.
