# JellyTV

**Revisión activa: 1.1.0-dev.0 para el entorno real Jellyfin Web 10.10.6. No es una nueva entrega aceptada.** `dist/` contiene el candidato de desarrollo; el ZIP 1.0.0 y los resultados de Web 12.2 son históricos. Estado y próximos pasos en [CHECKPOINT](docs/CHECKPOINT.md) y [aceptación vNext](docs/ACCEPTANCE_VNEXT.md).

El candidato incorpora el perfil estructural 10.10.6, Home más compacta, límites por rol de artwork, separación de logo/póster y Enhanced con hero contenido y vista previa contextual. Build, lint y unidades pasan; la corrección más reciente del logo aún necesita retest visual. No usar los PASS de un hash anterior como validación de los archivos actuales.

## Entrega histórica 1.0.0

Una interfaz cinematográfica independiente para **Jellyfin Web 12.2**: artwork amplio, superficies oscuras, tipografía del sistema y foco visible. El contenido y las acciones provienen de la sesión real de Jellyfin.

**JellyTV 1.0.0 para Jellyfin Web 12.2 y adaptación separada Android TV 0.19.10.** Consulta el [informe de validación](FINAL_REPORT.md) y la [matriz de compatibilidad](docs/COMPATIBILITY.md).

Build, lint y 24 unidades web pasan. La matriz Chrome cubre 78 recorridos Enhanced y 65 Core; Android TV tiene 15 unidades y ocho recorridos D-pad aprobados en cada configuración de salida 1080p/4K. Los resultados de los cinco motores y los límites físicos están en el informe. Quick Connect sin rechazos y Back durante la carga requieren las [correcciones de compatibilidad incluidas](docs/INSTALL.md#quick-connect-en-web-122).

[Captura histórica de Enhanced 1.0.0](docs/screenshots/enhanced-laptop-home.png). No representa la revisión actual.

La captura utiliza medios originales generados para el laboratorio. El tema instalado muestra los posters, backdrops, logos y metadatos de tu servidor; no incluye contenido de Apple ni una biblioteca de demostración.

## Entrega

El paquete local `releases/JellyTV-1.0.0.zip` incluye fuentes, builds, tests, capturas, informes públicos, APK debug y sus fuentes completas. `releases/manifest.json` contiene SHA-256 por archivo. Para empezar, sigue [INSTALL](docs/INSTALL.md); para el APK, [Android TV](android-tv/README.md).

## Core y Enhanced

| | Core | Enhanced |
|---|---|---|
| Instalación | Pegar Custom CSS | Core + instalar dos assets locales en el frontend |
| Colores, tarjetas, header, fichas, búsqueda, diálogos | Sí | Hereda Core |
| Responsive y foco | Desktop, tablet, móvil y Web TV | Hero adaptado a cada modo |
| Hero con metadata, logos y backdrop | No | Hasta seis títulos accesibles al usuario |
| Play, Continuar, información y favoritos | Acciones nativas | Acciones del hero delegadas a Jellyfin |
| Carrusel | Filas nativas | Manual, swipe y rotación opcional con pausa |
| Dependencias runtime externas | Ninguna | Ninguna; sesión y API de Jellyfin |

Las filas y bibliotecas conservan las preferencias del usuario. Para situar **Continuar viendo** inmediatamente después del hero, elige esa sección primero en **Ajustes → Inicio**. JellyTV no fija nombres ni orden de bibliotecas.

## Instalación rápida

1. Guarda el contenido actual de **Dashboard → Branding → Custom CSS**.
2. Copia el contenido completo de [`dist/jellytv-core.css`](dist/jellytv-core.css) en ese campo y guarda. No combines temas completos.
3. Recarga el cliente. Core ya está instalado.

Enhanced es opcional y requiere acceso al directorio de **Jellyfin Web 12.2**, más Node 22+ en la máquina de instalación. Confirma qué frontend sirve tu instancia y guarda una copia antes de modificarlo:

```text
node scripts/install.mjs install --root "RUTA_WEBROOT" --web-version 12.2 --dry-run
node scripts/install.mjs install --root "RUTA_WEBROOT" --web-version 12.2
node scripts/install.mjs status --root "RUTA_WEBROOT"
```

Sustituye `RUTA_WEBROOT` por una ruta real. El script conserva los plugins existentes y registra originales y hashes; no modifica bibliotecas, usuarios ni bases de datos. No es un plugin oficial de Jellyfin Server. En Docker usa una copia persistente o imagen derivada. Las instrucciones completas están en [INSTALL.md](docs/INSTALL.md).

## Actualizar, volver atrás y retirar

Core: conserva tu CSS anterior; reemplázalo por el nuevo archivo. Para revertir o retirar, restaura la copia guardada.

Enhanced, utilizando scripts y `dist` de la versión deseada:

```text
node scripts/install.mjs update --root "RUTA_WEBROOT" --web-version 12.2
node scripts/install.mjs rollback --root "RUTA_WEBROOT"
node scripts/install.mjs uninstall --root "RUTA_WEBROOT"
```

Son operaciones alternativas. Rollback conserva una generación anterior. Los comandos admiten `--dry-run` y rechazan archivos modificados fuera del instalador. No necesitas reinstalar Jellyfin. Ante una interrupción, consulta la [recuperación del instalador](docs/INSTALL.md#recuperar-una-operación-interrumpida).

## Personalización

Añade overrides después del CSS de Core:

```css
:root {
  --color-accent: #d8eaff;
  --color-focus: #ffffff;
  --radius-medium: 0.875rem;
  --blur-small: 0px;
  --card-size: 13rem;
  --transition-normal: 200ms;
  --hero-height: clamp(30rem, 65vh, 48rem);
}
```

Consulta los tokens en [`theme/tokens.css`](theme/tokens.css). La rotación del hero empieza detenida; actívala mediante su control. Foco, hover, touch, reproducción y ocultar la página la detienen. Con movimiento reducido permanece deshabilitada.

## Web, móvil y TV

- Web Desktop, tablet y móvil comparten Core. El modo TV de Jellyfin utiliza reglas propias de tamaño, márgenes y foco; no se activa por ancho de pantalla.
- Android Mobile e iOS pueden recibir Core en su interfaz web. Sus reproductores nativos y los clientes con frontend empaquetado requieren comprobación independiente; responsive en Chrome no certifica esas aplicaciones.
- Android TV, Google TV y Fire TV usan una interfaz nativa. La [adaptación Android TV](android-tv/README.md) incluye su propio parche, build y pruebas; **no carga CSS**.
- Swiftfin iOS/tvOS no soporta Core ni Enhanced. No se distribuye una modificación Swiftfin.
- Dashboard y administración mantienen su interfaz convencional para conservar funcionalidad.

## Desarrollo y pruebas

```text
npm ci
npm run check
```

Genera `dist/` y comprueba build, ESLint, Stylelint y pruebas unitarias. El manifiesto contiene tamaños y SHA-256; el bundle no incorpora dependencias runtime externas. Las pruebas Playwright necesitan el [laboratorio local](docs/research/LAB.md), con un servidor real y medios propios aislados de producción.

```text
npm run test:e2e
```

Este comando no instala el tema ni prepara el servidor. Para probar Enhanced configura `JELLYTV_ENHANCED=1` según las instrucciones del laboratorio. Las credenciales, sesiones y trazas quedan en directorios ignorados, fuera de la distribución.

## Documentación y límites

- [Investigación y fuentes](docs/RESEARCH.md), [arquitectura](docs/ARCHITECTURE.md) y [compatibilidad](docs/COMPATIBILITY.md).
- [Plan y resultados de pruebas](docs/TESTING.md), [informe de estado](FINAL_REPORT.md) y [cambios](CHANGELOG.md).
- [Instalación y rollback](docs/INSTALL.md) y [resolución de problemas](docs/TROUBLESHOOTING.md).

Enhanced depende de contratos internos de Web 12.2 y requiere regresión al cambiar de frontend. No incluye trailers automáticos, un plugin File Transformation ni recomendaciones inventadas. No certifica Safari, dispositivos móviles nativos ni televisores mediante capturas de Chrome. Las limitaciones de Android TV se registran por separado.

Código web propio bajo [MIT](LICENSE). La adaptación Android TV y el parche/fixture derivados de Jellyfin Web conservan [GPL-2.0](web-compat/LICENSE); no están cubiertos por MIT. Se incluyen las fuentes correspondientes. JellyTV no está afiliado a Apple ni al equipo de Jellyfin.
