# Revisión activa — 24 de octubre de 2026

**Aceptación reabierta por el servidor real 10.10.6.** Nueva solicitud en el adjunto `d4ec14ca-e4c9-478d-8429-68d81e3a34a0/Pasted text.txt`: rediseño Core/Enhanced/mobile, baseline ElegantFin, roles de artwork, motion y nuevas pruebas. No modificar Android TV en esta fase. La entrega 1.0.0 y sus pruebas de 12.2 son antecedentes, no aceptación de esta revisión.

- Usuario confirmó CasaOS, Server/Web 10.10.6 (`c335a3024`), Brave y Chrome.
- Se accedió a producción solamente en lectura; sesión IAB autenticada por el usuario. CSS Branding coincide exactamente con Core1.0.0.
- Causa de poster gigante confirmada: card absoluta upstream con `!important`, width100%/límites none de JellyTV y estructura pre10.11 distinta. Medición real: poster1036×1554, contenedor230,414×0.
- Ver [REAL_ENVIRONMENT_AUDIT](REAL_ENVIRONMENT_AUDIT.md), [auditoría CSS](research/CSS_AUDIT_VNEXT.md) y [ElegantFin](research/ELEGANTFIN_BASELINE_VNEXT.md).
- Réplica separada `.lab/vnext-10.10.6`, loopback18997. Preparación/arranque/parada en scripts `vnext-*`; `setup.mjs --profile=10.10.6` prepara usuarios/fixtures locales.
- Baseline inicial Stock/ElegantFin/Core1 realizado (9 pantallas,1920/390). Diseño, metadata/plugins, motion y port Android documentados; comparación final13pantallas aún incompleta.
- Implementados Core Home/perfil10.10.6 y Enhanced hero/preview. Fixtures A–L preparados, incluido HEVC10bit3840×2160PQ/BT2020 real. `dist` es **1.1.0-dev.0**, no el ZIP1.0.
- Hash Core anterior `7985d738…`:156 casos geométricos Chrome y36 en cada motor Chromium,Edge,Firefox,WebKit PASS. No son aceptación visual ni validan el build actual.
- Nueva incidencia del usuario: logo gráfico bajo el póster (Godzilla/John Wick). Medición anterior de fixtureA1920: logo termina259,1875px y póster empieza248,390625px. El test anterior omitía intersecciones. Core ahora reserva logo y gap en flujo; guard de logo contra póster,título yacciones añadido.
- Core actual `596e1197c22f5351d1c5c8c5e7ac02f68d3418ff990cc4a9c1f259a96889a93b`. Retest visual **PENDIENTE**, no heredar300PASS anteriores.
- Enhanced: corregida cancelación antes del hover, reapertura por Escape y sincronización de favoritos entre superficies. Runner nativo `scripts/lab/vnext-enhanced.mjs` preparado; **aún no ejecutado**. El webroot local tiene instalado Enhanced; los runners Core usan el nuevo `core-context.mjs` para servir HTML/config originales solo al contexto de prueba. Verificar el aislamiento en el próximo retest.
- `npm run check`: build/lint/35unidades PASS. Inspector opcional `scripts/debug/artwork-inspector.mjs` fuera del bundle; panel sin validar aún.
- **Bloqueo externo:** revisión automática de permisos no pudo autorizar el arranque del navegador por límite de uso. No fue rechazo de seguridad y no se eludió. También se detuvieron los subagentes por cuota; no dejar tareas supuestas en ejecución. Archivos/pruebas locales continuaron.
- Próximas acciones y criterios completos en [ACCEPTANCE_VNEXT](ACCEPTANCE_VNEXT.md). Prioridad: retest logo/póster con el nuevo hash, EnhancedE2E, comparación13pantallas, regresiones funcionales/a11y/performance y release. Producción no modificada por esta revisión.

## Entrega histórica — 22 de octubre de 2026

**Validación de JellyTV 1.0.0 cerrada.** No quedan defectos reproducibles de JellyTV ni tareas de desarrollo abiertas dentro del alcance probado. Las plataformas no ejecutadas se mantienen UNVERIFIED en COMPATIBILITY; no se convierten en PASS por analogía.

## Evidencia final

- `docs/validation/release-check.json`: regresión completa secuencial PASS con 24 unidades web, build/lint, cinco motores Core y Enhanced, audio/touch, lifecycle, geometría/a11y/zoom/TV, autenticación, sesiones, administración, performance y seis pruebas del paquete Android.
- `dist/manifest.json`: Core f9d2e3af…, Core minificado 50919b65…, Enhanced CSS ce329442…, JS 3a256f67…; todos los informes finales corresponden a ese build.
- Los informes finales identifican también Quick Connect e9ea5618… y navegación 5e0ea2d5…. La navegación rápida se reprodujo originalmente sin tema, Core y Enhanced; los seis controles posteriores y el mismo lifecycle pasan sin debilitar el test.
- APK e7d31d38aee854fa1990b6e01dee9f596bab0cc8274c0ec3b11945632e942216: build, lint sin Error/Fatal, 15 unidades, 8/8 recorridos D-pad en cada salida 1080p/4K. El sistema limita ambas UI a 1080p; rasterización UI4K es UNVERIFIED.
- APK y fuentes completas correspondientes en `android-tv/dist`. Fuentes Web con ambos arreglos en `web-compat/jellyfin-web-12.2-compat-source.zip`.

## Entrega reproducible

`python scripts/package-release.py` verifica los informes/hashes actuales, genera `releases/JellyTV-1.0.0.zip`, comprueba CRC y escribe `releases/manifest.json`. El paquete incluye fuentes, builds, documentación, tests, capturas y evidencia pública. Excluye credenciales, sesiones, logs, traces, cachés y dependencias locales. `FINAL_REPORT.md` y `docs/INSTALL.md` contienen alcance e instrucciones definitivas.

No repetir matrices completas sin un cambio o fallo que lo justifique. Si cambia el frontend, APK o los assets, reabrir la validación correspondiente; los aplicadores rechazan versiones y bytes desconocidos. Los informes históricos de fallos se conservan como historial, no como resultados de la entrega final.

## Laboratorio preservado

Servidor loopback `127.0.0.1:18996`, PID31004 al último arranque; comprobar ruta/identidad antes de detenerlo. Emulador detenido después de validar. Los datos y credenciales siguen exclusivamente en `.lab`. No se accedió a producción.

Para repetir, seguir `docs/research/LAB.md` y `scripts/validate-release.ps1`. Las pruebas que modifican reproducción/favoritos se ejecutan en secuencia. Python con Pillow es necesario para el runner nativo. No hay delegación proactiva autorizada ni repositorio Git en la raíz.
