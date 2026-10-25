# Changelog

## 1.1.0-dev.0 — en desarrollo, aceptación abierta

- Perfil real Jellyfin Web10.10.6: estructura anidada de ficha, póster bounded en flujo, transformTV reseteado y selects de tracks corregidos.
- Core Home: jerarquía/espaciado más compacto, tiles de bibliotecas, headings, cards y tokens de movimiento compartidos.
- Logo/póster: espacio reservado en flujo en lugar de posiciones independientes. Regresión añadida para intersección contra póster,título yacciones;9colisiones localizadas al reevaluar mediciones anteriores. Retest visual del arreglo pendiente.
- Enhanced: hero contenido, roles de artwork explícitos, metadata localizada y distinción entre progreso y Resume; preview por intención mouse/focoTV, cancelación inmediata antes de apertura, Escape sin reapertura, atributos ARIA temporales y sincronización de favoritos confirmados.
- Instalador10.10.6 guardado por hashes/capacidades y corrección opt-in del probe scrollOptions nativo. No aplica parches de12.2 a otras versiones.
- FixturesA–L, matrices de geometría en cinco motores e inspector de artwork opcional sin URLs/tokens. Las matrices anteriores no certifican los cambios actuales.
- Build/lint y35unidades PASS. E2E,comparación completa,galerías,a11y/performance y nueva release pendientes. AndroidTV sin cambios en esta fase.

## 1.0.0 — 22 de octubre de 2026

- Navegación rápida: cleanup de vistas abandonadas en Web 12.2; seis controles con latencia y el test lifecycle original confirman que una ficha tardía ya no tapa Inicio.
- Core y Enhanced fijados a Jellyfin Web 12.2; fuentes, builds, instalación reversible, capturas y evidencia de la matriz de cinco motores.
- Regresión final sobre los assets versionados, incluidos Core sin Enhanced, responsive, TV Web, reproducción/audio/subtítulos, touch, autenticación, sesiones, accesibilidad y rendimiento.
- Quick Connect: corregida la cancelación esperada del diálogo en su call-site; cero excepciones/rechazos en la autenticación repetida. Aplicador independiente con SHA exacto, backup, reversión y fuentes GPL completas.
- Android TV: corregido el backdrop que tapaba Continue watching. Ocho recorridos D-pad pasan con el mismo APK en salida 1080p y 4K; UI limitada a 1080p por el sistema, documentada sin atribuirle rasterización 4K.
- Build/lint y 24 unidades web; build/lint y 15 unidades Android, paquete reversible y APK debug con fuentes completas. Se conservan advertencias upstream y controles históricos.
- Scripts de regresión secuencial y empaquetado que exigen evidencia vigente, integridad del APK y los manifests. Exclusión de credenciales, sesiones, trazas y logs.
- Plataformas físicas/no ejecutadas marcadas UNVERIFIED; Swiftfin no soportado por las capas entregadas.

## 0.1.0 — historial de desarrollo, sin publicación

### Registro del 21 de octubre de 2026

- Swipe horizontal real corregido con `touch-action: pan-y pinch-zoom`, conservando desplazamiento vertical y zoom.
- Core sin Enhanced: 65 recorridos aprobados; suite adicional con audio dual real, volumen, mute, seek, colección, búsqueda vacía y landscape.
- Sesión comparada con doce controles nativos de logout; se conservan los 401 propios de Web 12.2 sin filtros globales.
- Inicio inválido y Quick Connect comprobados con baseline/Core/Enhanced. La primera ejecución conservaba un rechazo `undefined` del diálogo nativo en los tres modos; se corrigió después con el parche independiente y se repitió la autenticación estricta.
- Android: correcciones de API mínima, desugaring, API pública de Leanback y plurales; excepciones de lint justificadas y acotadas. Build, lint y 15 unidades aprobados.
- Ocho recorridos D-pad a 1080p y salida 4K, identificando el límite UI 1920 del sistema; revisión visual posterior detecta y corrige el backdrop que cubría la primera fila. Pendiente repetir con el APK corregido.
- APK debug, archivo completo de fuentes correspondientes y manifiesto SHA-256 mediante `android-tv/scripts/bundle.py`.

- Investigación fijada a Jellyfin Server/Web 12.2 con matriz de clientes y límites nativos.
- Core CSS modular: tokens, Modern/Legacy, cards, formularios, detalle, login, búsqueda, OSD, responsive y foco TV.
- Enhanced opcional: hero con metadata real, backdrops/logos, Play/Resume, favoritos, información, navegación manual y rotación pausada por interacción.
- Integración al plugin manager web, limpieza al navegar/cambiar sesión, solicitudes limitadas y abortables.
- Instalador con dry-run, integridad, respaldo, update, rollback, uninstall y recover tras interrupciones; protege modificaciones posteriores.
- Targets de al menos 44px en el hero, navegación adaptada a 320px, zoom de navegador 200/400%, colores forzados y contraste aumentado.
- Cancelación real de solicitudes al salir de Home, timeout con reintento y restauración del control enfocado al regresar.
- Preserva la identidad HTTP del cliente autenticado; corrige la pérdida del primer clic con mouse en Firefox TV sin reemplazar navegación por teclado.
- Adaptación Android TV separada y opt-in; resultados de validación independientes.
- Laboratorio real y suites unitarias/E2E. La versión no se declara 1.0.0 hasta cerrar la validación.

### Registro del 19 de octubre de 2026

- Build/lint y 20 unidades aprobados; evidencias responsive, zoom, accesibilidad, lifecycle y TV Web registradas con el hash ejecutado.
- Pruebas adicionales en Chrome, Chromium, Edge, Firefox y WebKit; los fallos y las ejecuciones de builds anteriores permanecen visibles en [FINAL_REPORT.md](FINAL_REPORT.md).
- Firefox: 12/12 PASS con el build actual, tras el ajuste de foco y la comparación de login con tres contextos sin JellyTV.
- Comparaciones de administración, cambio de sesión y 50 ciclos de navegación; no se presenta un PASS parcial como cierre de proyecto.
- Documentación de instalación, recuperación, laboratorio reproducible, compatibilidad y continuación actualizada.
