# Primera instalación de Enhanced

El archivo `jellytv-setup-VERSION.pyz` reúne el instalador de Docker y el ZIP Enhanced de la misma versión. Verifica los recursos incluidos, hace el preflight, registra `/usr/local/bin/jellytv` e instala Enhanced. Core se configura en Jellyfin por separado. El perfil actual se prueba en un laboratorio aislado. [Compatibilidad](COMPATIBILITY.md)

## Prueba local de un candidato

Descarga o copia el archivo y su checksum al host de prueba. Ejecuta los siguientes comandos desde el directorio de descarga después de sustituir `VERSION` por la versión exacta.

```sh
sha256sum --check jellytv-setup-VERSION.pyz.sha256 &&
  sudo python3 -I jellytv-setup-VERSION.pyz --allow-development --dry-run
```

Si el preflight es correcto, retirar `--dry-run` habilita la instalación. La simulación puede crear el directorio y el bloqueo de estado. El ZIP Enhanced por separado permite hacer la prueba con una CLI instalada y `--bundle`.

## Distribución

`python3 scripts/package-setup.py --development --output YOUR_OUTPUT_DIRECTORY` empaqueta un candidato local en un directorio nuevo. El modo estable requiere versión sin sufijo y un manifiesto aceptado.

El modo estable genera un comando fijado al tag y SHA-256. Descarga por HTTPS con límite de tiempo y tamaño, comprueba el hash antes de solicitar privilegios y vuelve a verificar la copia que ejecuta bajo `sudo`. Publica juntos el `.pyz`, el ZIP Enhanced y sus archivos `.sha256` cuando el release haya pasado aceptación. El checksum comprueba integridad frente a un valor esperado. La autenticidad del valor depende de cómo se obtenga.

Una copia desconocida de `jellytv` detiene el registro. Si la instalación falla y Enhanced recupera sus originales, se elimina solamente la CLI recién creada por esa ejecución. Si queda una recuperación pendiente, se conserva la CLI para `status` y `rollback`. [Instalador Docker](CASAOS_INSTALLER.md)
