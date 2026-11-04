# Pruebas

Los tests de Node y Python usan directorios temporales bajo `.lab/`. Los tests de transporte sustituyen Docker o HTTP por respuestas sintéticas.

```sh
npm ci --ignore-scripts
npm run check
python3 scripts/validate-installer.py
python3 scripts/validate-bootstrap.py
```

Para las pruebas de parches que necesitan bytes oficiales, prepara las cuatro fixtures verificadas. `npm run test:compat` ejecuta las pruebas Web que usan esas fixtures. La prueba Python del bundle revisado se omite si falta su fixture. [Preparar fixtures](../tests/fixtures/README.md)

Las pruebas opcionales de Docker requieren un daemon local y las imágenes fijadas por digest en los runners. Crean contenedores desechables con nombres y etiquetas propios. El runner Linux comprueba el bootstrap sin montar el socket Docker ni habilitar la red.

```sh
python3 scripts/package-setup.py --development --output .lab/test-package
python3 tests/integration/bootstrap-linux.py
python3 tests/integration/installer-lifecycle.py \
  --bundle .lab/test-package/jellytv-enhanced-1.1.0-dev.1.zip \
  --output .lab/reports/installer-lifecycle.json
```

Usa un entorno de prueba y un directorio de salida nuevo. Si falla una operación Docker, revisa el informe y la identidad del contenedor de laboratorio antes de retirarlo. Las pruebas de laboratorio y los resultados de accesibilidad, hardware y aceptación se registran por separado para cada versión.
