# Metadata y plugins

23 de octubre de 2026. Base real: Server/Web **10.10.6**, ver [auditoría](REAL_ENVIRONMENT_AUDIT.md). **Todos los plugins son opcionales.** Core presenta datos y acciones nativas; Enhanced consulta únicamente Jellyfin con la sesión activa. No incluye cuentas ni llamadas directas a proveedores.

```text
Proveedor opcional / NFO / imágenes locales / edición manual
  → metadata almacenada en Jellyfin → API Jellyfin
    → UI nativa + Core / componentes Enhanced
```

## Proveedores y consumo

La captura de Plugins acredita nombres y estado Active; no demuestra que cada proveedor esté habilitado en cada biblioteca ni que haya producido un campo concreto. Estas fuentes describen capacidades upstream: la disponibilidad concreta se comprueba por item, permisos, versión y respuesta. `ProviderIds` no identifica la procedencia individual de cada valor.

| Plugin | Qué aporta | Dónde lo consume JellyTV | Campo/API | Mejora visual | Obligatorio | Fallback |
|---|---|---|---|---|---|---|
| AudioDB | Datos e imágenes de álbum/artista | Música nativa/Core; diseño Artist/Album/Now Playing | Items musicales, año, género, overview, imágenes | Portada cuadrada, retrato y créditos legibles | NO | Tags y artwork locales, nombre |
| Fanart | Posters, fondos, logos, clear art, thumbs, banners | Hero/Details; previews propuestas | `ImageTags`, `BackdropImageTags`, `/Items/{id}/Images/{type}` | Composición según rol | NO | Título y composición sin fondo |
| MusicBrainz | Identificación musical, créditos, fechas | Artist/Album/Tracks nativos/Core | `Artists`, `ArtistItems`, `AlbumArtists`, fechas, `ProviderIds` | Jerarquía musical coherente | NO | Tags locales y datos existentes |
| OMDb | Metadata y ratings de vídeo | Hero y ficha nativa | `CommunityRating`, `CriticRating`, año, clasificación, overview | Ratings diferenciados, sin atribuir origen por inferencia | NO | Otros proveedores/datos locales; omitir ausencias |
| Open Subtitles | Descarga de subtítulos en el servidor | Player y selectores nativos | `MediaStreams`, acciones nativas autorizadas | Idioma, flags y track activo claros | NO | Tracks existentes y opción desactivados |
| Studio Images | Imagen de entidad Studio; proveedor usa **Thumb** | Grupo secundario de estudios, propuesta | `Studios` nombre/ID; imagen del item Studio | Identidad discreta, sin llenar la ficha de logos | NO | Nombre del estudio |
| TMDb | Títulos, fechas, sinopsis, géneros, créditos, estudios e imágenes | Hero y vistas nativas/Core | Campos normalizados de Items | Lectura y acciones con jerarquía | NO | Datos locales/de otros proveedores |
| TMDb Box Sets | Colecciones a partir de IDs de TMDb | Collections nativas/Core | `BoxSet`, hijos accesibles, imágenes, UserData | Conjunto cinematográfico, no una carpeta genérica | NO | Colecciones manuales o ninguna colección |

Fuentes primarias: [proveedores Jellyfin 10.10.6](https://github.com/jellyfin/jellyfin/tree/v10.10.6/MediaBrowser.Providers/Plugins), [Fanart MovieProvider](https://github.com/jellyfin/jellyfin-plugin-fanart/blob/master/Jellyfin.Plugin.Fanart/Providers/MovieProvider.cs), [Studio Images 10.10.6](https://github.com/jellyfin/jellyfin/blob/v10.10.6/MediaBrowser.Providers/Plugins/StudioImages/StudiosImageProvider.cs), [TMDb Box Sets](https://github.com/jellyfin/jellyfin-plugin-tmdbboxsets), [Open Subtitles](https://jellyfin.org/docs/general/server/plugins/open-subtitles/).

## Contrato de datos

El [BaseItemDto 10.10.6](https://github.com/jellyfin/jellyfin/blob/v10.10.6/MediaBrowser.Model/Dto/BaseItemDto.cs) es referencia de esquema, no garantía de que todas las consultas devuelvan todos los campos.

| Grupo | Campos candidatos | Regla de presentación |
|---|---|---|
| Identidad | `Id, Type, Name, OriginalTitle` | Título accesible siempre; original secundario cuando difiere |
| Fechas/estado | `ProductionYear, PremiereDate, EndDate, Status` | Año o rango conocido; no inventar temporadas/estado |
| Lectura | `Overview, Taglines, Genres, ProductionLocations` | Resumen limitado; detalles restantes accesibles en ficha |
| Ratings | `OfficialRating, CommunityRating, CriticRating` | Clasificación independiente de puntuaciones; escalas explícitas |
| Duración | `RunTimeTicks` | Convertir sólo valor positivo y finito |
| Créditos | `People, Studios` | Nombre/rol antes que imagen; cargas acotadas |
| Estado personal | `UserData.IsFavorite, Played, PlayedPercentage, PlaybackPositionTicks` | Ausente no equivale a cero; progreso limitado a 0–100; visto y reanudación distintos |
| Técnico | `MediaSources, MediaStreams` | Fuente seleccionada; no deducir HDR sólo de resolución/bit depth |
| Enlaces | `ProviderIds` | Enlaces necesarios, sin consultar proveedores desde el navegador |

El track activo procede del reproductor, no de `IsDefault`. `IsForced` e `IsHearingImpaired` se presentan cuando existen; SDH y CC no se equiparan automáticamente. Mantener títulos nativos, idioma y selección accesible además del color. [MediaStream](https://github.com/jellyfin/jellyfin/blob/v10.10.6/MediaBrowser.Model/Entities/MediaStream.cs).

Para series, el siguiente episodio procede de NextUp o episodios accesibles. Para colecciones, una página parcial de miembros no permite anunciar un total/rango/progreso global. Orden de estreno no equivale a cronología narrativa. Una colección manual recibe el mismo tratamiento que una generada por plugin.

## Artwork: roles explícitos

| Tipo | Función | Límites | Fallback |
|---|---|---|---|
| Backdrop | Fondo panorámico hero/detail | Alto máximo, gradientes direccionales, recorte deliberado | Backdrop padre identificado por API; variante sin fondo |
| Primary | Poster/portada/retrato según item | Poster desktop 220–320px; álbum cuadrado; proporción propia | Caja del rol o composición sin poster |
| Logo | Título gráfico transparente | `contain`, máximos de ancho/alto | Título tipográfico |
| Thumb | Imagen apaisada/tarjeta secundaria | Caja panorámica sólo cuando corresponde | Superficie neutral/imagen en su rol |
| Art | Ilustración secundaria, posiblemente transparente | `contain`, caja acotada | Omitir decoración, conservar información |
| Banner | Franja estrecha secundaria | Proporción propia, altura pequeña | Nombre sin hueco reservado |

Fanart normaliza clear art como Art y clear logo como Logo. No existe una necesidad de inventar `ClearLogo`. Studio Images Thumb pertenece a la entidad Studio, no a `Movie.ImageTags.Logo`.

El fallback cambia la composición: **Primary no se convierte automáticamente en fondo**. `PrimaryImageAspectRatio` no representa la proporción de Logo/Backdrop. Reservar espacio antes de cargar; una imagen fallida vuelve al fallback una vez, sin polling. No pedir inventarios de imágenes de toda la biblioteca. El debug opcional puede consultar `/Items/{id}/Images` para un item, sin exportar rutas físicas.

## Estado de implementación

En 1.0.0, Enhanced pide `Overview,Genres,Taglines,PrimaryImageAspectRatio` e imágenes Backdrop/Logo/Primary; presenta nombre/año/clasificación/rating/dos géneros/overview, logo y backdrop. Primary, Taglines y PrimaryImageAspectRatio no se aprovechaban en su composición. Su helper trata cualquier tipo distinto de Logo como backdrop: debe sustituirse por un resolvedor explícito antes de añadir otros roles. Música, estudios, reparto, colecciones y subtítulos se presentan mediante la UI nativa y Core.

La ficha real inspeccionada contiene ratings, título original, tagline, overview, géneros, estudios, reparto y muchas pistas. Esa observación DOM no se etiqueta como extracción de respuestas API privadas. La implementación nueva y fixtures A–L deben registrar qué campos se usan y qué fallbacks pasan. Hasta entonces las mejoras descritas son especificación, **no PASS**.
