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

Para los casos cinematográficos, incluye al menos tres títulos recientes con backdrop. El runner mantiene los casos de dev.2 y añade respuestas lentas y fallidas de artwork, error de Favoritos, sincronización de los controles, relleno del SVG, anclaje del CTA y movimiento reducido. El servidor proporciona los datos reales de navegación y se simulan los fallos de red puntuales.

El caso `motion-handoff` toma muestras de frames reales. Comprueba que al entrar la imagen siguiente se conserva la saliente, que el título cambia durante el fundido y que el carrusel pasa por anchos intermedios sin mover el panel. `JELLYTV_MOTION_VIDEO` permite grabar ese caso en un directorio ignorado.

En dev.5, ese caso comprueba también que la opacidad de la luz coincide con la del backdrop entrante. `carousel-copy-handoff` verifica por fotograma la salida y entrada de texto, la geometría del título durante expansión y contracción, la selección y el ID de las acciones antes y después del relevo. Incluye hover, flechas, foco, selección rápida y movimiento reducido. `carousel-touch` prueba un tap en navegador, la ruta de un gesto horizontal mediante eventos de puntero, cambio a paisaje y regreso desde Películas.

La revisión visual compara dev.3 y dev.4 con medios sintéticos, igual viewport y los mismos activos de Jellyfin. Incluye secuencias de Hero y carrusel, gradientes con artwork azul, rojo, oscuro y claro y nueve tamaños de escritorio y móvil. En la secuencia de ocho selecciones a 1920 × 1080, ambas versiones registraron una mediana de p95 de 16,8 ms y una tarea larga. El tiempo total de layout de esa secuencia subió de 11,3 a 21,2 ms al interpolar el ancho. El p95 se mantuvo en la prueba breve con CPU ralentizada 4×. Estos datos corresponden al equipo de laboratorio. Guarda las capturas y mediciones locales fuera del conjunto publicado.

Para dev.5 se repite la comparación desde dev.4 con las mismas imágenes y tamaños, también con artwork multicolor. Verifica las capturas antes, durante y después de cada movimiento. Compara muestras de píxeles con la luz visible y oculta para separar el halo del artwork. En la repetición de ocho selecciones a 1920 × 1080, el p95 mediano fue 16,8 ms en ambas versiones. El tiempo acumulado de layout fue de 21,3 y 18,8 ms respectivamente. El recuento de layout pasó de 118 a 129. La prueba breve con CPU emulada caracteriza este equipo. La GPU física y la memoria durante sesiones prolongadas requieren pruebas separadas.

En dev.6, incluye seis títulos recientes con etiquetas `ImageTags.Logo` en el laboratorio. `carousel-logos-initial` comprueba las URLs reales, los logos ya visibles antes de interactuar, la misma imagen durante expansión y contracción, el salto al final, el regreso desde Películas y la recarga. `carousel-logo-fallbacks` simula red lenta, logo ausente, HTTP 404 y bytes corruptos. También entrega un logo con una etiqueta distinta después de recargar. `carousel-logo-session` retiene una respuesta del usuario anterior mientras se cambia de cuenta.

El carrusel solicita hasta seis logos por montaje a partir de las etiquetas que ya devuelve la consulta de Inicio. Jellyfin proporciona el artwork y su etiqueta versiona la URL que usa la caché HTTP. Las transformaciones de una tarjeta reutilizan el mismo nodo. Los cambios de biblioteca aparecen cuando se renueva la consulta de Inicio o al recargar la página. Las comparaciones visuales usan logos horizontales, verticales, claros y oscuros, además de un título largo sin logo. Guarda estas capturas en el laboratorio.

Con seis títulos que tienen logo, la carga inicial del laboratorio pasó de 4.160 bytes de imagen en dev.5 a 24.960 en dev.6. En seis cambios de selección a 1920 × 1080, la mediana del p95 entre fotogramas fue de 16,8 ms en ambas versiones. El peso depende del artwork y de la caché HTTP de cada instalación.

## Trickplay en Jellyfin Web 10.10.6

En una biblioteca desechable, activa la extracción y ejecuta la tarea nativa de Trickplay. Usa como `fixtures.G.id` un video sintético reproducible suficientemente largo para cubrir varias celdas del sprite. El JSON de credenciales debe incluir el `userId` y `accessToken` de la cuenta local de prueba. El runner verifica el servidor y su versión antes de reproducir y guarda capturas solo si se indica un directorio.

```sh
node tests/integration/trickplay.mjs .lab/credentials.local.json .lab/storageState.local.json \
  .lab/fixtures.local.json .lab/dev3-dist .lab/trickplay-before
node tests/integration/trickplay.mjs .lab/credentials.local.json .lab/storageState.local.json \
  .lab/fixtures.local.json - .lab/trickplay-after
```

Con el mismo video y fuente, Jellyfin original, Core dev.3 y Core con Enhanced dev.3 muestran la miniatura desde la ficha. Reproducir directamente desde Hero o carrusel dev.3 muestra solo la hora y no solicita el sprite. El código anterior enviaba un resumen de Inicio como si fuera el objeto de reproducción completo. Web 10.10.6 selecciona la resolución de `item.Trickplay[mediaSourceId]` y calcula la hoja y posición a partir del intervalo y las dimensiones de la cuadrícula. El adaptador de dev.4 pasa el ID a Jellyfin como su botón nativo. El servidor gestiona la extracción, los JPEG agrupados y su almacenamiento junto al medio o en la ruta de metadata. [Gestor Trickplay de Server 10.10.6](https://github.com/jellyfin/jellyfin/blob/v10.10.6/Jellyfin.Server.Implementations/Trickplay/TrickplayManager.cs)

El test verifica la carga HTTP, la miniatura en el DOM, su aspecto, cambios de celda, límites de la vista, pantalla completa y reserva de tiempo. También separa una fuente sin metadata de una respuesta HTTP 404 de una hoja anunciada por el servidor. El posicionamiento de Web mide la burbuja antes de insertar el primer sprite. En ventanas estrechas el CSS de JellyTV centra y reduce visualmente la burbuja con sprite, manteniendo las coordenadas nativas de la hoja. El runner prueba los controles de reproducción, volumen, silencio, ocultación y salto táctil en Chrome. Activa `JELLYTV_TEST_TRANSCODE=1` para incluir HLS real cuando FFmpeg esté disponible.

## Instalador y bootstrap

Las pruebas opcionales de Docker requieren un daemon local y las imágenes fijadas por digest en los runners. Crean contenedores desechables con nombres y etiquetas propios. El runner Linux comprueba el bootstrap sin montar el socket Docker ni habilitar la red.

```sh
python3 scripts/package-setup.py --development --output .lab/test-package
python3 tests/integration/bootstrap-linux.py
python3 tests/integration/installer-lifecycle.py \
  --bundle .lab/test-package/jellytv-enhanced-1.1.0-dev.6.zip \
  --output .lab/reports/installer-lifecycle.json
```

Para validar una actualización real entre dos candidatos añade `--update-bundle PATH_TO_NEW_ZIP` y pasa el ZIP anterior a `--bundle`. El runner comprueba la simulación, los bytes instalados, el rollback y la desinstalación.

Usa un entorno de prueba y un directorio de salida nuevo. Si falla una operación Docker, revisa el informe y la identidad del contenedor de laboratorio antes de retirarlo. Las pruebas de laboratorio y los resultados de accesibilidad, hardware y aceptación se registran por separado para cada versión.
