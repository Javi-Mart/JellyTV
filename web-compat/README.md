# Correcciones del frontend — contratos separados

## Web10.10.6: prueba de soporte scrollOptions

El bundle nativo intenta detectar soporte de `scrollTo(options)` con un getter `behavior` que retorna `null`. Los motores actuales rechazan ese valor como ScrollBehavior. La corrección devuelve `"auto"` y mantiene el flag de detección; no oculta excepciones ni instala filtros globales.

`scroll-options-10.10.6.json` fija commit `c335a3024e436fb347078d4f657ba647647676e6`, archivo `main.jellyfin.bundle.js`, hash original `cf2b876d62cbc567da0ff2e5d3e22ac799729f13ce1208d6f1f9345ae6f8c1ec` y corregido `25b50389160c4d80c4062b5fcaa2bc94823ee645072268c8fe025fe22863e1fc`. Hay parche y fuente de la función en este directorio. Las unidades prueban dry-run,idempotencia,protección de cambios ajenos y reversión exacta. La matriz de geometría10.10.6 lo usa por intercepción del navegador, sin modificar ese bundle del servidor ni producción.

```text
node scripts/fix-scroll-options.mjs status --root "RUTA_WEBROOT"
node scripts/fix-scroll-options.mjs apply --root "RUTA_WEBROOT" --dry-run
node scripts/fix-scroll-options.mjs apply --root "RUTA_WEBROOT"
node scripts/fix-scroll-options.mjs revert --root "RUTA_WEBROOT"
```

Su distribución nueva y validación completa siguen pendientes de la aceptación1.1. El ZIP de fuentes12.2 citado abajo es histórico y no se presenta como fuentes correspondientes de una release10.10.6.

## Web12.2 — entrega histórica1.0

Se entregan dos arreglos acotados al frontend oficial analizado, commit `61b1f890365ad15138e943e694af723c1d47df2a`. Son independientes de Core/Enhanced y no cambian usuarios, bibliotecas ni autenticación. El aplicador común solo acepta los SHA-256 revisados; conserva originales, rechaza ediciones ajenas/symlinks y permite dry-run, status y reversión.

## Quick Connect

`baseAlert` rechaza con `undefined` cuando el flujo autorizado cierra su diálogo. El login funciona, pero deja una promesa sin manejar. El arreglo captura exclusivamente esa cancelación en el call-site; errores distintos se propagan. No instala filtros globales de rejections.

- [Parche de fuentes](quick-connect.patch), [manifiesto del bundle](quick-connect.json).
- [Fallo original](../docs/validation/authentication-before-quick-connect-fix.json), [autenticación estricta posterior](../docs/validation/authentication.json).

```text
node scripts/fix-quick-connect.mjs apply --root "RUTA_WEBROOT" --dry-run
node scripts/fix-quick-connect.mjs apply --root "RUTA_WEBROOT"
node scripts/fix-quick-connect.mjs status --root "RUTA_WEBROOT"
node scripts/fix-quick-connect.mjs revert --root "RUTA_WEBROOT"
```

## Ficha que termina de cargar después de Back

El efecto de `ViewManagerPage` iniciaba una importación asíncrona sin cleanup. Si se regresaba a Inicio antes de resolverla, el controlador abandonado insertaba la ficha sobre la pantalla actual. La reproducción con 300ms de latencia falla en los seis controles sin tema/Core/Enhanced. El arreglo activa `viewOptions.cancel` al desmontar el efecto; `ViewManager` ya comprueba ese flag antes de cargar la vista.

El mismo test lifecycle que detectó el problema pasa sin debilitarse, y los seis controles posteriores solo muestran Inicio. No se limita la velocidad del usuario, no se bloquea Back y no se ocultan páginas mediante CSS para disimular una navegación incorrecta.

- [Parche de fuentes](navigation.patch), [manifiesto del bundle](navigation.json).
- [Control anterior](../docs/validation/navigation-race-before-fix.json), [control posterior](../docs/validation/navigation-race.json), [lifecycle anterior](../docs/validation/enhanced-lifecycle-before-final-navigation-retest.json).

```text
node scripts/fix-navigation.mjs apply --root "RUTA_WEBROOT" --dry-run
node scripts/fix-navigation.mjs apply --root "RUTA_WEBROOT"
node scripts/fix-navigation.mjs status --root "RUTA_WEBROOT"
node scripts/fix-navigation.mjs revert --root "RUTA_WEBROOT"
```

## Restauración, actualización y fuentes

Recarga sin caché después de aplicar/revertir. Cada arreglo usa su propio respaldo `.jellytv-quick-connect.original` o `.jellytv-navigation.original`, validado por hash y conservado tras revertir. Temporales desconocidos o respaldos editados detienen la operación. La escritura se realiza mediante temporal y reemplazo atómico; solo estados conocidos son idempotentes.

Desinstalar Enhanced no revierte estos archivos. Retira cada corrección con su comando antes de actualizar Jellyfin Web. No restaures backups de 12.2 sobre otra versión. Core permanece CSS puro y no puede corregir estos defectos del cliente anfitrión por sí solo.

El código derivado mantiene [GPL-2.0](LICENSE); aplicadores y pruebas propias mantienen la licencia del proyecto. Se incluyen las [fuentes completas correspondientes con ambos cambios](jellyfin-web-12.2-compat-source.zip) y su [manifiesto](source-manifest.json). El archivo contiene las instrucciones upstream y dependencias fijadas. Una compilación completa puede producir nombres/hashes distintos: los aplicadores binarios preservan el resto del frontend oficial byte por byte.

Para regenerar el archivo de fuentes desde el checkout original fijado, usa `python scripts/package-web-compat.py RUTA_FUENTES_WEB`; el script exige contextos de parche exactos y no modifica ese árbol.
