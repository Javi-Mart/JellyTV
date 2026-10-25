# Aceptación de la revisión 1.1

Estado al 24 de octubre de 2026: **ABIERTA**. La solicitud de revisión de JellyTV 1.0.0 y las capturas posteriores de logos solapados son el alcance activo. La entrega anterior de Web 12.2/Android no certifica esta revisión.

| Criterio | Evidencia actual | Estado |
|---|---|---|
| Entorno real antes de CSS | Server/Web10.10.6, commit, DOM Legacy, CSS efectivo y causa de poster gigante documentados | Ejecutado; import ElegantFin exacto del usuario no disponible |
| Metadata API de producción | Metadata visible en DOM real; API autenticada y fixtures contrastados en réplica | Muestra API autenticada del servidor real pendiente; no confundir DOM con API |
| Stock/ElegantFin/Core1/nuevo | Baseline de9 pantallas en1920/390; nuevo candidato ya cambió | Completar13 pantallas, móvil real y revisión de información/densidad/legibilidad |
| Core autónomo | Home compacta, MyMedia, geometría 10.10.6, artwork limitado, tokens | Implementado; aceptación visual comparada pendiente |
| Fixtures A–L | Películas completas/incompletas, título largo, géneros, HEVC10bit4KHDR real, colección/serie/episodio/música | Preparados en lab; ampliar arte de ratios extremos y música cuadrada |
| Tamaños y motores | Hash7985d738: Chrome156 y otros4motores36 cada uno pasan las comprobaciones que contenían | Históricos, incompletos para solapamiento; nuevo hash exige retest |
| Logo/póster separados | Capturas del usuario + medición anterior1920: intersección vertical10,796875px | Código y guard de regresión añadidos; nueva captura pendiente |
| Enhanced | Hero contenido, fallback por roles, preview300ms/TV650ms, acciones propias, cleanup | Implementado; E2E10.10.6 pendiente |
| Build/lint/unit | `npm run check`,35 pruebas | PASS; no sustituye navegador |
| Regresión funcional | Hay suites históricas12.2 | Adaptar/ejecutar login,Home,libraries,collections,details,search,favorites,settings,dialogs,playback,subtitles,audio,resume,Back,QuickConnect10.10.6 |
| Accesibilidad | Reglas reduced motion/foco/targets; ARIA de preview | Verificación teclado,touch,zoom,lector,contraste y focus traps pendiente |
| Performance | Límites/cancelación/caché y ausencia de polling en código | Medición CLS/frames/requests/listeners actual pendiente; no atribuir60FPS |
| Cero errores y rutas rotas | Sin pageerrors en geometría histórica con parche exacto scrollOptions | Comprobar build actual y rejections/console con controles nativos; no suprimir errores |
| Debug artwork | Inspector opt-in fuera de bundles | Implementado, lintPASS; panel en navegador pendiente |
| Documentación/galerías/release | Documentación de auditoría/diseño/plugins/motion/port y estado disponible | Cerrar docs con resultados reales, regenerar galerías y empaquetar después de aceptación |
| Android TV | Plan de port separado | No modificado, según alcance |

## Bloqueo de ejecución actual

La revisión automática no pudo procesar la ejecución elevada del runner de navegador por cuota. El mensaje indicó expresamente que no era una determinación de inseguridad. Se continuó con archivos, build, lint y unidades; no se ejecutó el mismo navegador por una vía alternativa para eludir el control. Restablecer esa capacidad es necesario para el retest y las capturas. No marcar la versión como final mientras falten los criterios anteriores.

## Orden de reanudación

1. Comprobar identidad y versión del laboratorio loopback18997. Mantener producción solo lectura.
2. `node scripts/lab/vnext-layout.mjs --compat --matrix`; inspeccionar logos/pósters y también títulos/acciones. El nuevo guard debe fallar con la geometría anterior y pasar con el candidato. Añadir zoom y logos altos/anchos si detectan un caso nuevo.
3. Repetir otros motores para el nuevo hash y renovar capturas correspondientes.
4. Enhanced está instalado únicamente en el webroot local10.10.6 con un build anterior. `vnext-enhanced.mjs` sirve assets actuales por rutas interceptadas conservando el registro nativo del plugin. Ejecutar `node scripts/lab/vnext-enhanced.mjs`, corregir fallos y ampliar acciones, cleanup, fallbacks, motores y performance. No confundir pruebas preparadas con ejecutadas.
5. Completar comparison lab para los cuatro modos Core. `core-context.mjs` sirve el HTML/config originales del manifiesto únicamente a cada contexto de prueba, para aislar el Enhanced instalado localmente. Verificar ese aislamiento al ejecutar; no apilar temas ni comparar contra un Home con hero accidental.
6. Cerrar regresiones funcionales/visuales y documentación, entonces preparar release nueva. No ejecutar el empaquetador1.0 como si fuera1.1.
