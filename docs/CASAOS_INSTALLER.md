# Instalador CasaOS y Docker

Se mantiene el perfil de Jellyfin Server 10.10.6, afectado por CVE-2025-31499. El preflight verifica compatibilidad, y las pruebas del instalador se hacen en un laboratorio aislado. [Compatibilidad](COMPATIBILITY.md) · [Riesgo de la plataforma](../SECURITY.md)

Requiere un host Linux con una versión de Python que reciba parches de seguridad y acceso al daemon Docker local. Ejecuta el instalador como un administrador de confianza. El acceso al daemon Docker concede privilegios sobre el host. [Seguridad de Docker Engine](https://docs.docker.com/engine/security/) · [Soporte de Python](https://devguide.python.org/versions/)

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

## Actualizar desde 1.1.0-dev.1

Con la CLI de dev.1 ya instalada, usa el ZIP de Enhanced dev.2 y su checksum en la misma carpeta del host. Revisa primero que `status` indique dev.1, integridad correcta y ninguna recuperación pendiente.

```sh
sudo jellytv status
sha256sum --check jellytv-enhanced-1.1.0-dev.2.zip.sha256 &&
  sudo jellytv update --bundle ./jellytv-enhanced-1.1.0-dev.2.zip --allow-development --dry-run
```

Después de revisar la simulación, repite `update` sin `--dry-run` y comprueba que `sudo jellytv status` indique dev.2 con integridad correcta. Abre Inicio y prueba la navegación. `sudo jellytv rollback` restaura dev.1 cuando esa es la generación anterior. El PYZ de dev.2 sirve para la primera instalación.

## Actualizar desde 1.1.0-dev.2

Coloca el ZIP de Enhanced dev.3 y su checksum en la misma carpeta del host. Comprueba que dev.2 figure instalado, con integridad correcta y sin recuperación pendiente.

```sh
sudo jellytv status
sha256sum --check jellytv-enhanced-1.1.0-dev.3.zip.sha256 &&
  sudo jellytv update --bundle ./jellytv-enhanced-1.1.0-dev.3.zip --allow-development --dry-run
```

Tras revisar la simulación, repite `update` sin `--dry-run`. Comprueba la versión y la integridad con `sudo jellytv status`. `sudo jellytv rollback` recupera dev.2 si era la generación anterior. Usa el PYZ para una instalación inicial.

Para aplicar el fundido de la ficha, guarda por separado tu CSS de marca actual y aplica `dist/jellytv-core.css` de dev.3. El rollback de Enhanced restaura sus archivos Web. Si también actualizaste Core, restaura su CSS anterior en el panel de Jellyfin.

## Actualizar desde 1.1.0-dev.3

Para probar en un entorno aislado, copia el ZIP de Enhanced dev.4 y su checksum en la misma carpeta. La CLI ya instalada con dev.3 admite el nuevo ZIP. Revisa en `status` la versión, la integridad y el estado de recuperación.

```sh
sudo jellytv status
sha256sum --check jellytv-enhanced-1.1.0-dev.4.zip.sha256 &&
  sudo jellytv update --bundle ./jellytv-enhanced-1.1.0-dev.4.zip --allow-development --dry-run
```

Tras revisar la simulación, repite el comando de actualización sin `--dry-run` y ejecuta `sudo jellytv status`. Comprueba Inicio y el timeline de un título con sprites generados. Si dev.3 era la generación anterior, `sudo jellytv rollback` restaura sus archivos. El PYZ de dev.4 se reserva para una primera instalación. La corrección de reproducción y el ajuste estrecho del tooltip se incluyen en Enhanced.

## Actualizar desde 1.1.0-dev.4

Copia el ZIP de Enhanced dev.5 y su checksum en el mismo directorio del host de pruebas. Comprueba que `status` indique dev.4 con integridad correcta y sin recuperación pendiente.

```sh
sudo jellytv status
sha256sum --check jellytv-enhanced-1.1.0-dev.5.zip.sha256 &&
  sudo jellytv update --bundle ./jellytv-enhanced-1.1.0-dev.5.zip --allow-development --dry-run
```

Tras revisar la simulación, repite `update` sin `--dry-run` y vuelve a comprobar `status`. Revisa el Hero, el carrusel y la reproducción desde Inicio con un título que disponga de Trickplay. `sudo jellytv rollback` recupera dev.4 si era la generación anterior. El ZIP contiene las dos mejoras de Enhanced. El PYZ se reserva para una primera instalación.

## Actualizar desde 1.1.0-dev.5

Coloca el ZIP de Enhanced dev.6 y su checksum en la misma carpeta del host de pruebas. Comprueba que `status` indique dev.5 con integridad correcta y sin recuperación pendiente.

```sh
sudo jellytv status
sha256sum --check jellytv-enhanced-1.1.0-dev.6.zip.sha256 &&
  sudo jellytv update --bundle ./jellytv-enhanced-1.1.0-dev.6.zip --allow-development --dry-run
```

Tras revisar la simulación, repite `update` sin `--dry-run` y vuelve a comprobar `status`. Recarga Inicio y revisa los logos de las tarjetas compactas antes de seleccionar una. `sudo jellytv rollback` recupera dev.5 si era la generación anterior. El PYZ se usa para una primera instalación.

## Estado y recuperación

Se gestionan dos recursos Enhanced, `config.json`, `index.html` y un marcador. El estado y el journal se guardan en `/var/lib/jellytv`. El directorio debe pertenecer al usuario que ejecuta la herramienta, con modo 700, y sus padres deben tener propietarios de confianza y permisos que impidan escritura compartida.

Para escribir en Web, el instalador exige archivos y directorios administrados por root o por el usuario efectivo dentro del contenedor. Rechaza enlaces y permisos de escritura para grupo u otros en esas rutas.

`status` indica si la configuración coincide, si los archivos conservan sus bytes y si quedó una operación interrumpida. `rollback` recupera primero una operación interrumpida. Si hay ediciones ajenas, conserva el journal para revisión. Tras una actualización correcta, `rollback` puede volver a la generación anterior. Conserva las copias hasta haber verificado los archivos y la salud del servidor.

Si CasaOS recrea el contenedor, comprueba el estado y compatibilidad de la nueva generación. Usa `install --reinstall --repo OWNER/REPOSITORY --version X.Y.Z --dry-run` para revisar una nueva instalación. La identidad de un contenedor anterior limita la restauración de sus backups a esa generación. Los reemplazos son individuales y las pruebas de recuperación cubren fallos de proceso en el laboratorio.
