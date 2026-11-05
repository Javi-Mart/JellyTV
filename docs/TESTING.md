# Pruebas

Los tests de Node y Python usan directorios temporales bajo `.lab/`. Los tests de transporte sustituyen Docker o HTTP por respuestas sintéticas.

```sh
npm ci --ignore-scripts
npm run check
python3 scripts/validate-installer.py
python3 scripts/validate-bootstrap.py
```

Para las pruebas de parches que necesitan bytes oficiales, prepara las cuatro fixtures verificadas. `npm run test:compat` ejecuta las pruebas Web que usan esas fixtures. La prueba Python del bundle revisado se omite si falta su fixture. [Preparar fixtures](../tests/fixtures/README.md)

## Navegación Enhanced en Jellyfin Web 10.10.6

Prepara una instancia desechable en `127.0.0.1` con Enhanced registrado y una biblioteca sintética de películas. El runner usa un JSON local con `baseURL`, `serverId`, dos cuentas de prueba `limited` y `admin` con `username` y `password`, y un archivo Playwright de estado de sesión para los casos autenticados. Conserva ambos archivos en `.lab/`. La prueba comprueba la identidad y versión del servidor, usa el bundle de `dist/` y aplica al navegador de laboratorio la corrección de compatibilidad ScrollOptions ya fijada por hash.

```sh
npm install --no-save --package-lock=false @playwright/test@1.64.1
npx playwright install chromium webkit
node tests/integration/enhanced-home.mjs .lab/credentials.local.json .lab/storageState.local.json
JELLYTV_BROWSER=webkit node tests/integration/enhanced-home.mjs .lab/credentials.local.json .lab/storageState.local.json
```

## Instalador y bootstrap

Las pruebas opcionales de Docker requieren un daemon local y las imágenes fijadas por digest en los runners. Crean contenedores desechables con nombres y etiquetas propios. El runner Linux comprueba el bootstrap sin montar el socket Docker ni habilitar la red.

```sh
python3 scripts/package-setup.py --development --output .lab/test-package
python3 tests/integration/bootstrap-linux.py
python3 tests/integration/installer-lifecycle.py \
  --bundle .lab/test-package/jellytv-enhanced-1.1.0-dev.2.zip \
  --output .lab/reports/installer-lifecycle.json
```

Usa un entorno de prueba y un directorio de salida nuevo. Si falla una operación Docker, revisa el informe y la identidad del contenedor de laboratorio antes de retirarlo. Las pruebas de laboratorio y los resultados de accesibilidad, hardware y aceptación se registran por separado para cada versión.
