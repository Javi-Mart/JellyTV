# Decisiones de lint

El informe upstream completo se conserva en `evidence/lint/upstream/`. Un resultado sin errores después de estas decisiones no significa que el código original estuviera libre de avisos.

## Plurales

Los 30 errores `MissingQuantity` solicitan `many` en diez recursos de cada uno de los idiomas checo (`cs`), eslovaco (`sk`) y lituano (`lt`). En esas lenguas `many` corresponde exclusivamente a cantidades con fracción según las [reglas cardinales de Unicode CLDR](https://www.unicode.org/cldr/charts/48/supplemental/language_plural_rules.html). La selección de [Resources.getQuantityString](https://developer.android.com/reference/android/content/res/Resources#getQuantityString(int,%20int,%20java.lang.Object...)) recibe un `int`. El wrapper del cliente también convierte la cantidad con `toInt()`; Compose recibe cantidades enteras de elementos.

Por ello se documenta `tools:ignore="MissingQuantity"` **únicamente en esos 30 elementos**. Se mantienen las categorías enteras `one`, `few` y `other` y sus traducciones existentes. No se inventan traducciones decimales que la API no puede seleccionar. No se desactiva la regla para otros idiomas o para todo el proyecto. Esta decisión debe revisarse si cambia el mecanismo de pluralización o admite cantidades fraccionarias.

El error serbio `ImpliedQuantity` sí es funcional: la forma `one` también representa 21, 31 y otras cantidades, pero decía «una» sin número; las otras formas eran etiquetas genéricas. Se corrigieron las tres formas de segundos para conservar `%1$s` y la unidad correspondiente. No se suprime este diagnóstico.

## Notificaciones de la sesión de medios

`MediaSessionService.updateNotification` publica exclusivamente `MediaStyle(session)`. Las notificaciones asociadas a sesiones de medios están [exentas del permiso de notificaciones en Android 13](https://developer.android.com/develop/ui/compose/notifications/notification-permission#media-sessions). Se documenta la excepción en el método. Lint 31.11.1 conserva además un resumen en el módulo app sin ubicación, aunque el método esté anotado; `android-lint.xml` excluye únicamente el mensaje que identifica esta clase completa. La regla `NotificationPermission` sigue activa para otras clases. Esta excepción debe retirarse si el servicio comienza a publicar notificaciones ajenas a la sesión.

## Compatibilidad de API y dependencias

Se activa core library desugaring en el módulo de sesión, que ya declaraba su dependencia. El control de reproducción utiliza el tipo público `ViewGroup` en lugar de una clase interna de Leanback. Los colores del hero se resuelven mediante `ContextCompat.getColor`, compatible con la API mínima 21.

La compilación y el informe lint posterior deben verificarse antes de declarar aprobado el paquete.
