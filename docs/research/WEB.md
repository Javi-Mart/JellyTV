# Jellyfin Web: contrato técnico verificado

Investigación: 2026-10-14. Base de código: **Jellyfin Web 12.2.0**, commit completo [`61b1f890365ad15138e943e694af723c1d47df2a`](https://github.com/jellyfin/jellyfin-web/tree/61b1f890365ad15138e943e694af723c1d47df2a). Se descargó y leyó el código fuente de ese commit. Las conclusiones siguientes son verificación estática, no resultados de pruebas en un servidor real.

## Arquitectura que afecta el tema

- `package.json`: React 18.3.1, MUI 6.5.0, jellyfin-apiclient 1.11.0. No asumir que todo el cliente es DOM legacy.
- [`RootAppRouter.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/RootAppRouter.tsx) usa `createHashRouter`; selecciona rutas modern o legacy según `layoutManager.modern` y añade Dashboard/Wizard. El AppHeader legacy existe también cuando está oculto: no eliminarlo.
- [`constants/layoutMode.ts`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/constants/layoutMode.ts): `desktop-legacy`, `mobile-legacy`, `tv` usan legacy. `modern`, `desktop`, `mobile` corresponden al cliente nuevo. `auto` resuelve según plataforma.
- [`layoutManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/layoutManager.js) asigna `html.layout-desktop`, `.layout-mobile` o `.layout-tv`. **No existe una clase `.layout-modern`**. No se debe deducir modern/legacy únicamente de `.layout-desktop`.
- Modern sigue reutilizando detalle, login, búsqueda, cards y home sections legacy. El header y numerosas pantallas de biblioteca, menús y formularios son MUI.
- El nombre nativo `appletv` es un esquema claro (fondo `#d5e9f2`), no el resultado cinematográfico oscuro solicitado.

## Carga oficial de CSS y límite de administración

[`CustomCss.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/CustomCss.tsx) inserta primero `BrandingOptions.CustomCss`, salvo `disableCustomCss`; después inserta el CSS personal. Modern y Legacy AppLayout montan este componente.

[`apps/dashboard/AppLayout.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/apps/dashboard/AppLayout.tsx) **no monta CustomCss**: monta `ThemeCss dashboard`. Añade `body.dashboardDocument` durante su vida. No prometer que pegar Custom CSS cambia la administración de 12.2. Si el despliegue usa una hoja global mediante `<link>`, los selectores globales pueden alcanzarla; conviene excluir `body.dashboardDocument` de cambios espaciales y conservar controles del administrador.

[`ThemeCss.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/ThemeCss.tsx) carga `themes/{id}/theme.css`. [`themeManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/scripts/themeManager.js) escribe `html[data-theme]` y dispara `Events.trigger(document, 'THEME_CHANGE', [id])`.

## Bootstrap Enhanced sin inspeccionar webpack

Existe un contrato de extensión real en [`components/pluginManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/pluginManager.js#L60): `loadPlugin(pluginSpec)` comprueba si el string existe en `window`, espera su valor, exige una función, la invoca y espera una clase, e instancia esa clase con dependencias.

Forma mínima de registro, ilustrativa:

```js
window.CinematicEnhanced = async () => class CinematicEnhanced {
  constructor(deps) {
    this.id = 'cinematic-enhanced';
    this.name = 'Cinematic Enhanced';
    this.type = 'cinematic-enhancement';
    // Guardar deps y registrar listeners; la app aún no está montada.
  }
};
```

El instalador debe cargar el script antes del bundle principal y agregar el string `CinematicEnhanced` al array `plugins` del `config.json` existente, **preservando todos sus plugins y las demás opciones**. No puede sustituir el array por uno que contenga solo Enhanced: los reproductores nativos también se cargan por esa lista. No es una URL remota de importación; la rama alternativa hace import dinámico relativo a `src/plugins` y no sirve como cargador arbitrario de URLs.

Dependencias exactas inyectadas:

```text
events, loading, appSettings, playbackManager, globalize,
appHost, appRouter, inputManager, toast, confirm, dashboard,
ServerConnections
```

[`scripts/settings/webSettings.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/scripts/settings/webSettings.js#L117) lee `config.json` con `cache: 'no-store'` y devuelve `config.plugins`, o la lista compilada si falla. [`index.jsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/index.jsx#L111) inicializa appHost/API, traducciones y fuentes; espera `loadPlugins()`; registra notificaciones; después llama `renderApp()`. Por tanto el constructor del plugin corre **antes** del render inicial.

`loadPlugins()` usa Promise.all, y captura errores para que la aplicación siga. `pluginManager` registra la instancia y traducciones; **no invoca un método genérico `start`, `init`, `dispose` o `destroy`**. El plugin debe iniciar su gestión desde constructor y proporcionar su propia limpieza. El guard idempotente debe actuar antes de instalar listeners porque la detección de ID duplicado se hace después de construir la instancia. No usar `type: 'skin'` para un añadido doméstico: puede interferir con consumidores de skins.

## API, usuario, reproducción y navegación

[`ServerConnections.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/lib/jellyfin-apiclient/ServerConnections.js) ofrece:

```js
const client = deps.ServerConnections.currentApiClient();
const userId = client?.getCurrentUserId();
const user = await client.getCurrentUser();
const serverId = client.serverId();
```

Puede faltar el cliente o usuario; no consultar biblioteca antes de autenticación. `getCurrentApiClientAsync()` rechaza si no hay cliente. `window.ApiClient` existe como compatibilidad, pero las dependencias inyectadas ofrecen un acceso explícito y no necesitan buscar credenciales en storage.

El ejemplo oficial [`plugins/backdropScreensaver/plugin.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/plugins/backdropScreensaver/plugin.js#L12) llama `client.getItems(userId, query)` con `IncludeItemTypes`, `Recursive`, `Fields`, `Limit`, `ImageTypes`, `EnableImageTypes`, `ImageTypeLimit`, y consume `result.Items`. Una consulta inicial de hero puede limitar a Movie/Series y pedir Overview/Genres/Taglines según necesidad. La aplicación debe aplicar favoritos y permisos mediante este cliente autenticado; no emplear un API key administrativo.

El ejemplo [`components/slideshow/slideshow.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/slideshow/slideshow.js#L70) usa **getScaledImageUrl**:

```js
client.getScaledImageUrl(item.Id, {
  type: 'Backdrop', index: 0, tag: item.BackdropImageTags[0],
  maxWidth: 1920, quality: 90
});
client.getScaledImageUrl(item.Id, {
  type: 'Logo', tag: item.ImageTags.Logo, maxWidth: 640
});
```

Comprobar la presencia de cada tag. Para episodios puede haber imagen propia o heredada de serie; resolver ID/tag coherentemente, y usar título de texto si falta logo. No fabricar logos ni rankings de plataformas a partir de datos inexistentes.

[`playbackmanager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/playback/playbackmanager.js#L2115) expone:

```js
await deps.playbackManager.play({
  items: [item],
  startPositionTicks: item.UserData?.PlaybackPositionTicks || 0
});
// Alternativa sin DTO completo:
await deps.playbackManager.play({ ids: [item.Id], serverId });
```

`items` o `ids` son minúsculas; `serverId` es obligatorio cuando no se pasa `items`. Normaliza fullscreen a true salvo false explícito. El gestor traduce Series a episodios y conserva reproductor seleccionado, introducciones y fuentes. El botón modern oficial [`PlayOrResumeButton.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/apps/modern/features/details/components/buttons/PlayOrResumeButton.tsx) usa este contrato. No lanzar directamente un `<video>` ni construir URLs de streaming.

[`appRouter.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/router/appRouter.js#L125): `appRouter.showItem(item)` calcula ruta por Type/Id/ServerId; `show(path, options)` es async, normaliza `#`/`!`, y espera viewshow; `back()` y `ready()` están disponibles. `showItem` no devuelve una promesa útil: manejar fallos de datos antes de llamarlo. Usar objeto DTO con ServerId; su rama string hace fetch y tiene una firma de compatibilidad más compleja.

## Dos sistemas distintos de eventos

[`utils/events.ts`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/utils/events.ts) es un bus interno, no EventTarget:

```js
deps.events.on(object, 'event', callback);
deps.events.off(object, 'event', callback);
// callback recibe ({type}, ...argumentos), `this` es object.
```

Eventos confirmados:

| Objeto | Nombre | Argumentos después de `_event` | Uso |
| --- | --- | --- | --- |
| ServerConnections | localusersignedin | user DTO | Invalidar caché por identidad; cargar al entrar en home. |
| ServerConnections | localusersignedout | `{ serverId }` | Desmontar hero y borrar datos de usuario inmediatamente. |
| ServerConnections | apiclientcreated | apiClient | Se creó cliente, no implica autenticación. |
| playbackManager | playbackstart | player, state | Pausar rotación y tareas visuales. |
| playbackManager | playbackstop | playbackStopInfo | Revalidar home si está activo. |
| document (bus interno) | THEME_CHANGE | themeId | Adaptación de tema. |
| document (bus interno) | HEADER_RENDERED | sin contrato adicional requerido | Home nativo espera la cabecera. |

Login/logout: [`connectionManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/lib/jellyfin-apiclient/connectionManager.js#L203). Playback: `playbackmanager.js` líneas 3394–3395 y 3465–3466. No escribir tokens en logs, datos HTML ni almacenamiento propio.

En cambio `viewshow`, `viewhide`, `pageshow` son **CustomEvent DOM**. Registrar mediante `document.addEventListener`, no con `deps.events.on`.

## Home y ciclo de vida del hero

[`apps/modern/routes/home.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/apps/modern/routes/home.tsx#L165) produce:

```text
#indexPage.page.homePage.libraryPage.allLibraryPage.withTabs
  #homeTab.tabContent.pageTabContent[data-index="0"]
    .sections
  #favoritesTab.tabContent.pageTabContent[data-index="1"]
    .sections
```

Home modern usa `apps/legacy/controllers/hometab.js`. Este llama `components/homesections/homesections.js` para renderizar las filas y respeta preferencias por usuario. `loadSections` sustituye `sections.innerHTML`, y `destroySections` lo vacía. **Montar el hero como hermano inmediatamente anterior a `.sections` dentro de `#homeTab`, nunca dentro de `.sections`**. Esto preserva las filas Continuar viendo/Siguiente/Últimos/agregadas y la configuración del usuario. No fijar la sección Continuar viendo a `.section0`: el usuario puede reordenarlas.

[`Page.tsx`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/Page.tsx#L54) emite al montar, con bubbles true: `viewbeforeshow`, `pagebeforeshow`, `viewshow`, `pageshow`. **No emite viewhide en su cleanup.** El viewManager legacy sí emite `viewbeforehide`, `viewhide` y `viewshow` durante cambio/restauración: [`viewManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/viewManager/viewManager.js#L37).

Diseño de lifecycle recomendado a partir de estos hechos:

1. Constructor instala manejadores estables, callback de hashchange y un sync inicial posterior al render. El primer viewshow es el camino normal.
2. Montar solo en `#/home` (también entrada hashbang normalizada), con usuario autenticado y `#homeTab` visible. Comprobar tab/favorites y visibilidad.
3. `viewshow` de cualquier otra página y hashchange desmontan/pausan; `viewhide` legacy refuerza esto. No depender exclusivamente de viewhide.
4. Una comprobación de conexión de nodo o MutationObserver acotado puede cubrir desmontaje React. Desconectarlo en cleanup, sin observador global permanente de cada mutación.
5. Token de generación/sesión invalida resultados async antiguos al navegar/cambiar usuario. Caché solo memoria, indexada por serverId + userId, con TTL y límite de items.
6. Limpiar listeners, timers, observers y DOM idempotentemente. Al volver de reproducción, montar/refrescar sin duplicar y preservar foco funcional.
7. Suspender autoplay con pestaña oculta, focus dentro del hero, hover, diálogo abierto, reproducción, reduced-motion y modo TV (opt-in si se habilita).

Son recomendaciones de implementación; su cumplimiento se valida con pruebas, no queda probado por esta investigación.

## Selectores comprobados para Core

| Superficie | Selectores que existen en este commit | Fuente |
| --- | --- | --- |
| Header legacy | `.skinHeader`, `.headerTop`, `.headerLeft`, `.headerRight`, `.headerTabs`, `.headerButton`, `.headerSearchButton`, `.headerUserButton`, `.headerBackButton`, `.headerHomeButton`, `.mainDrawer` | `components/AppHeader.tsx`, `scripts/libraryMenu.js:37–54` |
| Header modern | `.MuiAppBar-root`, `.MuiToolbar-root`; Toolbar tiene `.padded-left.padded-right` | `components/OffsetAppBar.tsx`, `components/toolbar/AppToolbar.tsx`, `apps/modern/components/AppToolbar/index.tsx` |
| Filas home | `.homeSectionsContainer`, `.verticalSection`, `.sectionTitle.sectionTitle-cards`, `[is="emby-scroller"]`, `.itemsContainer.scrollSlider.focuscontainer-x` | `components/homesections/homesections.js`, `sections/resume.ts` |
| Cards | `.card`, `.cardBox`, `.cardScalable`, `.cardImageContainer`, `.cardContent`, `.cardOverlayContainer`, `.cardText`, `.cardText-secondary`, `.cardIndicators`, `.cardFooter`, `.cardFooterLogo` | `components/cardbuilder/cardBuilder.js`, `utils/builder.ts`, `card.scss` |
| Ficha | `#itemDetailPage.itemDetailPage`, `.itemBackdrop`, `.detailLogo`, `.detailPageWrapperContainer`, `.detailPagePrimaryContainer`, `.detailImageContainer`, `.detailPagePrimaryContent`, `.detailSection`, `.detailPageSecondaryContainer`, `.detailRibbon` | `apps/legacy/controllers/itemDetails/index.html`; modern `legacyRoutes/user.ts` apunta a la misma vista |
| Acciones ficha | `.btnPlayOrResume`, `.btnPlayTrailer`, `.btnMoreCommands`, `.btnDownload` | `apps/modern/features/details/components/buttons/*.tsx`; modern mezcla botones MUI con vista legacy |
| Búsqueda | `#searchPage`, `.searchFields`, `.searchFieldsInner`, `#searchTextInput.searchfields-txtSearch` | `apps/legacy/routes/search.tsx`, `features/search/components/SearchFields.tsx`; modern async route reutiliza search |
| Login | `#loginPage.standalonePage.backdropPage` | `apps/legacy/controllers/session/login/index.html`, modern `legacyRoutes/public.ts` |
| Diálogos legacy | `.dialogContainer`, `.dialog`, `.dialog.opened`, `.dialogBackdrop`, `.dialogBackdropOpened`, `.dialog-fixedSize` | `components/dialogHelper/dialogHelper.js:249–253,407–489` |
| Diálogos/menús MUI | `.MuiDialog-paper`, `.MuiMenu-paper`, `.MuiPopover-paper`, `.MuiDrawer-paper`, `.MuiButton-root`, `.MuiIconButton-root`, `.MuiInputBase-root` | Componentes públicos MUI usados en modern/dashboard; evitar clases hash Emotion `css-*` |
| Reproductor | `#videoOsdPage`, `.videoOsdBottom`, `.osdControls`, `.osdPositionSlider`, `.osdTitle`, `.osdTextContainer`, `.btnPause`, `.upNextContainer` | `apps/legacy/controllers/playback/video/index.html` |
| Reproductor modern | `.skinHeader.osdHeader`, `.videoOsd-appBar` además del OSD legacy | `apps/modern/routes/video/index.tsx` |
| Administración | `body.dashboardDocument`, `.dashboard-appBar`, `#dashboardPage` | `apps/dashboard/AppLayout.tsx`, `routes/index.tsx` |

Los selectores `.hide`, atributos `hidden`, disabled, `.hide-mobile`, `.hide-desktop`, `.hide-tv` tienen función, no solo estética. No neutralizarlos globalmente ni hacer que aparezcan acciones sin permiso. No esconder labels/errores con opacidades mínimas. Preservar `.material-icons` (no aplicar fuente de texto a todos los elementos). No alterar `video`, canvas, controles de volumen, z-index general o navegación por un selector universal.

## Variables, espaciado y foco

[`themes/index.ts`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/themes/index.ts) configura `cssVarPrefix: 'jf'` y `colorSchemeSelector: '[data-theme="%s"]'`. Ejemplos reales usados también por Sass legacy:

```text
--jf-palette-background-default
--jf-palette-background-paper
--jf-palette-text-primary
--jf-palette-text-secondary
--jf-palette-primary-main
--jf-palette-primary-contrastText
--jf-palette-secondary-main
--jf-palette-divider
--jf-palette-action-hover
--jf-palette-action-focus
--jf-palette-AppBar-defaultBg
--jf-palette-AppBar-transparentBg
--jf-palette-AppBar-gradient
--jf-palette-background-defaultImage
--jf-card-borderRadius
```

Las últimas cuatro variables adicionales se exponen en [`themes/_base/_theme.scss`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/themes/_base/_theme.scss#L57). Override recomendado mediante `:root[data-theme]`/selector suficientemente específico, verificando que el colorScheme generado por MUI no gane por cascada. Usar variables propias `--...` para ajustes del tema y mapear a Jellyfin; no asumir que modificar únicamente Sass legacy estiliza MUI.

[`apps/modern/AppOverrides.scss`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/apps/modern/AppOverrides.scss) declara breakpoints MUI **600, 900, 1200 y 1536 px**. Modern AppLayout usa md (900) para navegación/drawer; Toolbar envuelve hasta lg (1200). OffsetAppBar mide su altura con ResizeObserver y reserva spacer: no compensar con márgenes negativos generales. Default dense 48 px, normal 64 px, pero el contenido puede envolver y cambiarlo.

[`focusManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/components/focusManager.js) detecta INPUT/TEXTAREA/SELECT/BUTTON/A sin tabindex -1 y `.focusable`; usa contenedores `.focuscontainer-x`/`.focuscontainer-y` para desplazamiento. Mantener botones HTML reales, foco visible, separación espacial y no secuestrar flechas globalmente.

[`inputManager.js`](https://github.com/jellyfin/jellyfin-web/blob/61b1f890365ad15138e943e694af723c1d47df2a/src/scripts/inputManager.js#L27) ofrece `on(scope, fn)`/`off(scope, fn)` para CustomEvent `command`; recibe `e.detail.command` (`up`, `down`, `left`, `right`, `select`, `back`). Si no se cancela, Jellyfin ejecuta navegación espacial y back normales. Mejor aprovechar esa navegación para botones del hero antes de registrar un sistema propio.

## Límites de esta evidencia

- Verificación estática en el commit indicado; hace falta prueba en instalación real para declarar compatibilidad de comportamiento, reproducción, sesión y navegación.
- No prueba que Custom CSS se inyecte en clientes nativos. La matriz de clientes se documenta separadamente.
- No garantiza compatibilidad con versiones 10.x/11.x: se requiere adaptar/verificar sus selectores y pluginManager.
- La falta de una instalación disponible no convierte una demostración local o mock de API en validación real.
- La integración Enhanced exige modificar archivos servidos del frontend y config; después de una actualización debe revalidarse/restaurarse. Debe entregarse instalación reversible y comprobación de integridad, sin prometer un contrato de plugin estable entre versiones.
