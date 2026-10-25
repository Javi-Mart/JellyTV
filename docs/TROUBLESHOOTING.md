# Resolución de problemas

## Logo de título debajo del póster en10.10.6

La revisión de las capturas confirmó que limitar ancho/alto no bastaba: el logo absoluto y el margen negativo del contenido se calculaban por separado. En el candidato1.1 el logo reserva espacio en flujo antes del póster, con variante móvil y `contain`. El test comprueba intersección con póster,título ybotones. La corrección está en código, **su retest visual aún está pendiente**. No añadir z-index para tapar el póster ni ocultar artwork útil; revisar primero versión, contratoDOM y CSS efectivo. El [inspector opcional](ARTWORK_DEBUG.md) ayuda a medirlo sin publicar URLs/IDs.

## Core no aparece

Comprueba que el cliente usa Jellyfin Web. Android TV y Swiftfin no cargan Custom CSS. En un navegador, revisa que no esté activado “Disable server's custom CSS”, que se guardó el contenido completo y que el CSS personal no lo sobrescribe. Haz una recarga completa del sitio. La administración de 12.2 tiene su propio tema; no es un fallo que conserve su layout.

## El hero no aparece

Core no contiene un hero dinámico. Enhanced requiere bootstrap local y entrada `JellyTVEnhanced` en el array plugins original. Ejecuta `node scripts/install.mjs status --root "RUTA_WEBROOT"`; revisa que los dos assets respondan HTTP 200. No añadas el nombre del plugin sin el script correspondiente. Un cliente con frontend empaquetado localmente puede no recibir el webroot modificado.

Home debe estar autenticada y tener películas o series accesibles. Una biblioteca vacía no produce contenido de ejemplo. Si aparece el aviso de fallo, Reintentar vuelve a consultar el servidor. No pegues tokens ni config privados en reportes.

## Imágenes o logos ausentes

El hero usa Backdrop y Logo de Jellyfin, no poster de Apple ni imágenes de internet. Sin Logo se conserva el título textual; sin Backdrop aparece fondo neutral. Confirma la metadata desde el propio Jellyfin. El tema no inicia una descarga masiva de artwork ni modifica tu biblioteca.

## Botones, layout o colores extraños

Retira otros temas/Media Bar y repite con Core solo. Comprueba versión Web y modo Modern/Legacy/TV, no solo versión Server. Reinicia el navegador si mantuvo assets antiguos. Conserva una captura, resolución CSS, navegador, modo, versión JellyTV y pasos de reproducción. No publiques capturas con datos privados.

## Rotación detenida

Es intencional después de interacción, foco, reproducción o pestaña oculta. Vuelve a activarla explícitamente. Con reduced motion no se activa. El carrusel manual sigue disponible.

## Favoritos o Play fallan

Comprueba primero la misma acción en el detalle original de Jellyfin. El permiso, la disponibilidad del medio y el soporte de codecs siguen dependiendo del servidor/cliente. Una serie sin episodios reproducibles devuelve un error y conserva la Home. El estado de favoritos solo cambia después de una respuesta correcta.

## Instalador se niega a sobrescribir

Un hash distinto indica que alguien o una actualización cambió archivos gestionados. Conserva ambos archivos y compara con el manifiesto; no borres el aviso para forzar escritura. Restaura una copia coherente de la misma distribución web o combina los cambios manualmente y reinstala sobre una copia limpia. No restaures archivos de una versión anterior de Jellyfin sobre una nueva.

Si hubo un corte de proceso y queda `.jellytv-recovery.json`, conserva una copia del webroot y ejecuta `node scripts/install.mjs recover --root "RUTA_WEBROOT" --dry-run`, seguido del mismo comando sin `--dry-run`. El journal registra las generaciones anterior y prevista; la recuperación rechaza cualquier tercer contenido para proteger ediciones posteriores. Un journal de una versión anterior sin ambas generaciones requiere revisión manual. Los backups son para la misma instalación, no para mezclar servidores.

## Pruebas no disponibles

Los tests E2E usan un laboratorio en `127.0.0.1:18996`; no aceptan una instancia privada como reemplazo implícito. Si falta un navegador, emulador o plataforma, el estado es UNVERIFIED. El informe de Android diferencia build, tests y errores lint upstream; no uses la existencia de un APK como prueba de navegación D-pad.

## Quick Connect inicia sesión pero aparece un rechazo

El bundle oficial fijado de Web 12.2 rechaza la promesa del diálogo al cerrarlo. Comprueba la [corrección incluida](../web-compat/README.md) y su comando `status`; recarga sin caché después de aplicar. El aplicador rechaza otras compilaciones. Retirar Enhanced no retira ese arreglo: tiene su propio `revert`.

## Una ficha aparece sobre Inicio después de volver rápidamente

Comprueba `node scripts/fix-navigation.mjs status --root "RUTA_WEBROOT"` y recarga sin caché. Web 12.2 original puede completar el controlador de una ficha abandonada; la [corrección incluida](../web-compat/README.md#ficha-que-termina-de-cargar-después-de-back) cancela esa carga. No se soluciona añadiendo z-index al hero ni ocultando la ficha con CSS. El aplicador solo acepta el bundle oficial fijado.
