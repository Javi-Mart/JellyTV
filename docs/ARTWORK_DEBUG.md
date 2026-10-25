# Inspector de artwork (solo desarrollo)

`scripts/debug/artwork-inspector.mjs` no forma parte de Core ni del bundle Enhanced. No realiza peticiones ni lee cookies, almacenamiento o estado interno de Jellyfin. Examina únicamente el DOM y estilos calculados.

En una prueba Playwright local ya autenticada:

```js
import { inspectArtwork } from './scripts/debug/artwork-inspector.mjs';
const report = await page.evaluate(inspectArtwork);
```

Para abrir el panel opcional en esa misma página de laboratorio:

```js
import { readFile } from 'node:fs/promises';
const source = await readFile('scripts/debug/artwork-inspector.mjs', 'utf8');
await page.addScriptTag({ type: 'module', content: source + '\nshowArtworkInspector();' });
```

El informe identifica rol de imagen, componente, selector conocido, dimensiones, contenedor, proporción, visibilidad y ajuste. No incluye URL, ID de contenido, título, token ni rutas de archivos. `Unknown` significa que el DOM no permite atribuir el rol con certeza; no se adivina a partir de la proporción. El botón Close inspector elimina el panel; no queda un observer ni un temporizador. La recarga elimina el módulo y el panel de la página.

La herramienta complementa, pero no sustituye, la inspección visual. El runner `vnext-layout.mjs` comprueba por separado intersecciones del logo con póster, título y acciones, además de límites y proporciones. Los informes anteriores al cambio del 24 de octubre no contenían esas comprobaciones y no acreditan ausencia de solapamiento.

Estado: implementación disponible y lint PASS; panel aún sin validación en navegador.
