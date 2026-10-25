# Port visual Android TV posterior

Esta fase estabiliza Web Core, Enhanced y Mobile Web sobre el entorno real10.10.6. La adaptación nativa y el APK1.0.0 se mantienen como entrega histórica independiente; las pruebas web nuevas no los certifican.

Después de aceptar el diseño web:

1. Sincronizar paleta, tipografía, espaciado, radios, jerarquía y tiempos con tokens Kotlin/XML/Compose.
2. Trasladar roles de artwork: fondo panorámico, logo contenido, Primary/Thumb/Art en cajas propias; conservar la corrección de clipping de ImageView.
3. Ajustar continuidad hero→Continue Watching y densidad de filas, preservando safe areas.
4. Conservar foco inmediato, contexto demorado cancelable y navegación rápida de D-pad.
5. Trasladar feedback de favoritos, errores/loading, Play/Resume y restauración del foco.
6. Repetir Gradle, lint, unidades, capturas, navegación completa y playback real con APK de hash nuevo.

No prometer UI rasterizada4K por una salida/framebuffer4K: registrar de nuevo el límite del framework. No introducir CSS en el cliente nativo ni publicar un APK actualizado sólo por cambiar la documentación web.
