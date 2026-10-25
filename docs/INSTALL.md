# Instalación, actualización y rollback

**Candidato activo1.1.0-dev.0:** los archivos de `dist` ya no corresponden al ZIP1.0. El perfil10.10.6 y la corrección de logos están en desarrollo, pendientes de retest visual. No presentar esos archivos como una release aceptada. El instalador admite contratos10.10.6 y12.2; su seguridad/reversión tienen pruebas unitarias, pero la integración Enhanced10.10.6 aún necesita E2E. Ver [estado](ACCEPTANCE_VNEXT.md). Las instrucciones históricas siguientes describen la entrega1.0.

JellyTV 1.0.0 está fijado a las combinaciones probadas. Consulta [compatibilidad](COMPATIBILITY.md) y [resultados](../FINAL_REPORT.md) antes de instalar. El objetivo verificado en código es Jellyfin Web 12.2. No se requiere reinstalar Jellyfin para retirar el tema.

## Core: solo Custom CSS

1. Guarda en un archivo el contenido actual de **Dashboard → Branding → Custom CSS**. También revisa si tienes CSS personal en **Settings → Display**: se aplica después y puede entrar en conflicto.
2. Abre `dist/jellytv-core.css` y copia todo su contenido al campo Custom CSS. Sustituye otros temas completos; no combines varios.
3. Guarda y recarga la página. Si sigue apareciendo la versión anterior, usa recarga completa o borra la caché del sitio en ese cliente.
4. Repite la comprobación desde cada cliente web. No es necesario repetir la instalación del CSS global en cada dispositivo.

También puede pegarse como CSS personal cuando se desea limitar su aplicación a un usuario. Core no necesita plugin, CDN, fuente externa, API key ni cambiar archivos del servidor. La administración de Web 12.2 usa su propio tema y mantiene su layout convencional.

Para personalizar, añade tus overrides **después** del tema. Por ejemplo:

```css
:root {
  --color-accent: #cce5ff;
  --color-focus: #ffffff;
  --blur-small: 0px;
  --radius-medium: 0.75rem;
  --card-size: 13rem;
  --transition-normal: 180ms;
  --hero-height: clamp(30rem, 65vh, 48rem);
}
```

Un cambio de accent no debe reducir contraste de texto/foco. Los tokens documentados se encuentran en `theme/tokens.css`. El CSS no crea contenido ni incorpora el hero por sí solo.

## Enhanced: hero opcional

Requiere Node 22+ **en la máquina que prepara la instalación**, un webroot de Jellyfin Web 12.2 y permisos sobre esa copia. Node no es una dependencia del runtime en los clientes. El módulo utiliza APIs internas del plugin manager fijadas a esta versión; no es un plugin oficial del servidor.

Primero instala Core. Luego prepara una copia del webroot que puedas restaurar; en Docker es preferible un directorio propio o una imagen derivada versionada. No modifiques el contenedor efímero y esperes que sobreviva a una actualización. La ruta depende del sistema de instalación: confirma cuál sirve tu instancia.

Los comandos siguientes usan `RUTA_WEBROOT` como marcador que debes sustituir por la ruta real. Incluye comillas si contiene espacios. No son una orden para actualizar Jellyfin ni su base de datos.

```text
node scripts/install.mjs install --root "RUTA_WEBROOT" --web-version 12.2 --dry-run
node scripts/install.mjs install --root "RUTA_WEBROOT" --web-version 12.2
node scripts/install.mjs status --root "RUTA_WEBROOT"
```

El instalador:

- Conserva todos los plugins y otras opciones existentes en `config.json`.
- Añade un script local `defer` antes de los bundles de aplicación y la hoja del hero.
- Copia únicamente sus assets a `jellytv/` dentro del webroot.
- Guarda los originales y hashes en `.jellytv-install.json` y usa un journal de recuperación durante la operación.
- Rechaza archivos modificados, enlaces simbólicos en los destinos y versiones no declaradas como 12.2.

No se incluyen tokens en scripts/config de instalación. El navegador usa la sesión activa de Jellyfin. No abras ni publiques los archivos de configuración de tu servidor para solicitar soporte; el backup puede contener opciones privadas ya presentes.

Recarga completamente el cliente. El carrusel se muestra solo en Home autenticada cuando existen películas/series accesibles. Sin candidatos mantiene las filas de Jellyfin. Los títulos, imágenes, favoritos y progreso provienen de tu servidor.

La rotación es manual al inicio. El control de la esquina permite activarla; foco, touch, hover, ocultar la página y reproducción la detienen. Con reduced motion permanece deshabilitada. Play/Continuar utiliza el reproductor de Jellyfin; Más información abre su ficha.

### Clientes con web local

Modificar el webroot del servidor no añade Enhanced a un cliente que trae su propio frontend empaquetado. Core puede seguir aplicándose mediante Branding. No modifiques archivos de aplicaciones móviles ni paquetes firmados para intentar que aparezca el hero. Android TV y Swiftfin no soportan este método.

### File Transformation

La arquitectura admite transportar el bootstrap mediante File Transformation, pero esta distribución entrega el método de copia de webroot y su instalador. No incluye un plugin C# de File Transformation ni declara probada esa instalación. No instales Media Bar/Enhanced/Jellyfeatured junto con JellyTV Enhanced: dos módulos pueden competir por Home.

## Quick Connect en Web 12.2

El cliente oficial analizado deja una promesa sin manejar al cerrar automáticamente el diálogo de Quick Connect. Se incluye una corrección independiente para ese bundle exacto. Para reproducir el resultado de autenticación sin rechazos de esta entrega, aplícala además de Core o Enhanced:

```text
node scripts/fix-quick-connect.mjs apply --root "RUTA_WEBROOT" --dry-run
node scripts/fix-quick-connect.mjs apply --root "RUTA_WEBROOT"
node scripts/fix-quick-connect.mjs status --root "RUTA_WEBROOT"
```

Recarga completamente el cliente; borra su caché si aún recibe el archivo anterior. El aplicador verifica SHA-256 y conserva una copia del bundle original. Rechaza otras compilaciones y cambios locales. No modifica la autenticación ni almacena credenciales. El [parche y su alcance](../web-compat/README.md) permiten revisar y compilar el cambio desde fuentes.

Para restaurar el comportamiento original:

```text
node scripts/fix-quick-connect.mjs revert --root "RUTA_WEBROOT" --dry-run
node scripts/fix-quick-connect.mjs revert --root "RUTA_WEBROOT"
```

Retira esta corrección antes de actualizar el frontend. No copies su respaldo sobre otra versión. **Desinstalar Enhanced no revierte este cambio:** usa el comando anterior si quieres retirar también la corrección. Core sigue siendo CSS puro; por sí solo no puede reparar una promesa del cliente anfitrión.

### Regreso rápido antes de cargar una ficha

Web 12.2 puede terminar de cargar una ficha abandonada y dibujarla sobre Inicio si se pulsa Back antes de terminar la importación del controlador. La segunda corrección marca esa navegación como cancelada al desmontarla y aprovecha la comprobación existente del cliente. Está validada con latencia de red y sin cambiar el test que encontró el fallo.

```text
node scripts/fix-navigation.mjs apply --root "RUTA_WEBROOT" --dry-run
node scripts/fix-navigation.mjs apply --root "RUTA_WEBROOT"
node scripts/fix-navigation.mjs status --root "RUTA_WEBROOT"
```

Recarga sin caché. Para revertir, usa `node scripts/fix-navigation.mjs revert --root "RUTA_WEBROOT"`; admite `--dry-run`. Su backup independiente es `.jellytv-navigation.original`. Retira ambas correcciones antes de actualizar Jellyfin Web. Ninguna se elimina al desinstalar Enhanced. Las dos exigen los bundles oficiales exactos y rechazan ediciones ajenas.

## Actualización

Antes de actualizar Core, conserva el CSS actual y sus overrides. Sustitúyelo por el nuevo archivo y vuelve a añadir overrides. Comprueba la matriz de la nueva versión.

Para Enhanced, utiliza los scripts y `dist` de la nueva versión, conservando el manifiesto que existe en el webroot:

```text
node scripts/install.mjs update --root "RUTA_WEBROOT" --web-version 12.2 --dry-run
node scripts/install.mjs update --root "RUTA_WEBROOT" --web-version 12.2
```

La actualización conserva una generación anterior para rollback. Si Jellyfin cambió sus propios `index.html` o `config.json`, el instalador se negará a sobrescribirlos: retira JellyTV antes de actualizar la distribución web y vuelve a evaluar compatibilidad sobre la copia nueva. Nunca copies un backup de 12.2 encima de otra versión de Jellyfin.

## Rollback

Core: vuelve a pegar el CSS que guardaste antes de actualizar. Enhanced:

```text
node scripts/install.mjs rollback --root "RUTA_WEBROOT" --dry-run
node scripts/install.mjs rollback --root "RUTA_WEBROOT"
```

Después de una actualización vuelve a la instalación JellyTV anterior. Si no existe una generación anterior, restaura los archivos originales. Recarga/caché del navegador después de revertir.

## Desinstalación

Core: elimina el bloque JellyTV del CSS global/personal o restaura tu copia previa. Enhanced:

```text
node scripts/install.mjs uninstall --root "RUTA_WEBROOT" --dry-run
node scripts/install.mjs uninstall --root "RUTA_WEBROOT"
```

Se restaura el contenido original de index/config y se retiran únicamente los dos assets propios. Una carpeta `jellytv/` con archivos ajenos no se borra recursivamente. Si el hash difiere, revisa el archivo cambiado: el instalador no tiene `--force` que destruya cambios posteriores.

## Recuperar una operación interrumpida

Si se cerró el proceso antes de finalizar, `status` informa `recoveryPending`. Conserva una copia del webroot y ejecuta:

```text
node scripts/install.mjs recover --root "RUTA_WEBROOT" --dry-run
node scripts/install.mjs recover --root "RUTA_WEBROOT"
```

Recuperar restaura exactamente el estado anterior a esa operación. Comprueba cada archivo contra las dos generaciones registradas y se niega a sobrescribir cambios posteriores. Solo elimina temporales cuyo contenido coincide con el journal. Si detecta un archivo desconocido o un journal antiguo, conserva toda la evidencia y se detiene para revisión manual. No borres el journal para forzar una instalación.

## Build desde fuentes

```text
npm ci
npm run build
npm run lint
npm test
```

`dist/manifest.json` incluye tamaños y SHA-256; el instalador verifica los assets contra ese manifiesto. Los tests de integración requieren preparar el laboratorio descrito en [TESTING.md](TESTING.md). Un build exitoso por sí solo no certifica una plataforma.

La variante nativa tiene instrucciones distintas en [android-tv/README.md](../android-tv/README.md).
