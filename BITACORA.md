# Bitacora del proyecto

## 2026-06-16 22:15

### Proyecto

* Nombre: califica_articulos_inferenciales
* Cliente o institucion: FACEN / articulo para DADOS
* Ruta local: `/Users/diegobernardomezabogado/Library/CloudStorage/GoogleDrive-dmeza.py@gmail.com/Mi unidad/DECENA_FACEN/califica_articulos_inferenciales`
* Repositorio: `https://github.com/diegomezapy/califica_articulos_inferenciales`
* URL publica: pendiente de publicar/actualizar en GitHub Pages
* Responsable: Codex + usuario
* Version: pipeline de anonimización reproducible

### Objetivo de la intervencion

* Implementar una forma robusta, por lote y auditable de anonimizar los PDFs antes de compartirlos en abierto.

### Diagnostico inicial

* Los `346` PDFs publicos dejaban visible titulo, autores, revista, afiliaciones, DOI, correos y metadatos embebidos.
* Una solucion manual archivo por archivo no era sostenible ni trazable.
* La app publica ya estaba funcional, pero aun servia los PDFs no anonimizados.

### Acciones realizadas

* Se creo `scripts/anonymize_public_pdfs.py`.
* Se definio una estrategia hibrida:
  * multipagina: se reemplaza la primera pagina por una portada sintetica neutra;
  * paginas internas: se redaccionan bandas superiores, esquina superior izquierda y pie para reducir encabezados y logos repetidos;
  * una sola pagina: se aplica redaccion parcial y se deja bandera de revision manual.
* Se limpiaron metadatos embebidos de salida.
* Se generaron nombres publicos neutros `case_0001.pdf` ... `case_0346.pdf`.
* Se genero manifiesto:
  * `public_data/anonymized_pdf_manifest.csv`
  * `public_data/anonymized_pdf_manifest.json`
* Se corrio el pipeline completo sobre los 346 casos.
* Se actualizo `scripts/build_public_catalog.py` para preferir automaticamente `anonymized_pdfs/` cuando existe el manifiesto.
* Se ajusto el catalogo publico para exponer `case_XXXX`, nombre publico del PDF y fuente editorial suprimida en lugar de titulo, revista y nombre original del archivo cuando existe copia anonimizada.
* Se actualizo `.gitignore` para evitar subir por accidente `public_pdfs/` y artefactos temporales de verificacion.
* Se actualizaron `README.md` y `DEPLOY.md` con el flujo de anonimización.

### Archivos modificados

* `scripts/anonymize_public_pdfs.py`
* `scripts/build_public_catalog.py`
* `.gitignore`
* `README.md`
* `DEPLOY.md`
* `BITACORA.md`
* `public_data/anonymized_pdf_manifest.csv`
* `public_data/anonymized_pdf_manifest.json`
* `anonymized_pdfs/*`
* `public_data/auditables_346.json`

### Comandos o scripts ejecutados

* `python3 -m py_compile scripts/anonymize_public_pdfs.py`
* `python3 scripts/anonymize_public_pdfs.py`
* `python3 scripts/build_public_catalog.py`
* pruebas parciales con `--limit` y `--match`

### Resultados verificados

* Pipeline completo procesado: `346` PDFs.
* Estrategias aplicadas:
  * `cover_swap_first_page = 343`
  * `first_page_block_redaction = 2`
  * `first_page_fallback_band = 1`
* Tres casos quedaron como `single_page`.
* La carpeta `anonymized_pdfs/` pesa aproximadamente `228 MB`.
* `public_data/auditables_346.json` ahora apunta preferentemente a rutas `anonymized_pdfs/case_XXXX.pdf`.
* La UI publica ya no muestra titulo ni revista original cuando existe la copia anonimizada.

### Pruebas realizadas

* Render de primeras paginas antes y despues sobre muestras.
* Spot checks en casos de inicio, medio y final del lote.
* Verificacion de metadatos vacios en muestras.
* Relectura del JSON publico para confirmar rutas anonimizadas.

### Errores o incidentes

* Un PDF dio error de colorspace al aplicar redacciones de imagen con MuPDF.
* Algunos PDFs emitieron avisos `skipping bad link / annot item ...` por enlaces o anotaciones defectuosas del original.

### Soluciones aplicadas

* Se agrego `safe_apply_redactions()` con fallback a `PDF_REDACT_IMAGE_NONE` cuando la redaccion de pixeles falla por colorspace.
* Se eligio una portada sintetica para multipagina por ser mas estable que intentar limpiar en sitio cada portada editorial heterogenea.

### Pendientes

* Si la publicacion sera totalmente abierta, evaluar tambien ocultar en la UI publica campos como `titulo`, `revista` y `pdf_nombre`, porque hoy la anonimización fuerte esta aplicada al PDF, no a todos los metadatos del catalogo.
* Publicar en GitHub Pages una vez decidido el nivel deseado de anonimato del catalogo.

### Riesgos

* Los casos de una sola pagina siguen siendo los mas delicados y deben revisarse manualmente.
* Algunas paginas internas pueden perder una pequena franja superior o inferior de contenido por seguridad.
* La UI publica todavia expone metadatos textuales de los casos, aunque el PDF servido ya sea anonimizado.

### Recomendaciones

* Antes del push publico final, revisar manualmente los `3` casos `single_page` del manifiesto.
* Si se requiere anonimización total del sitio, preparar una segunda pasada que enmascare tambien los metadatos del catalogo y de la lista lateral.

## 2026-06-16 21:20

### Proyecto

* Nombre: califica_articulos_inferenciales
* Cliente o institucion: FACEN / articulo para DADOS
* Ruta local: `/Users/diegobernardomezabogado/Library/CloudStorage/GoogleDrive-dmeza.py@gmail.com/Mi unidad/DECENA_FACEN/califica_articulos_inferenciales`
* Repositorio: `https://github.com/diegomezapy/califica_articulos_inferenciales`
* URL publica: pendiente de publicar/actualizar en GitHub Pages
* Responsable: Codex + usuario
* Version: verificador publico estatico inicial

### Objetivo de la intervencion

* Dejar operativa una app web publica de verificacion que muestre los 346 PDFs auditados, con catalogo navegable, trazabilidad por caso y base lista para compartir con terceros.

### Diagnostico inicial

* El repositorio tenia una app privada basada en Google Apps Script y un `index.html` insuficiente para verificacion publica.
* Los metadatos auditables ya existian en `../04_INVESTIGACION_REPO/tabla_validacion_humano_vs_ia_auditables_346.csv`.
* Los PDFs auditables estaban disponibles localmente en dos carpetas fuente y faltaba empaquetarlos en una superficie publica verificable.

### Acciones realizadas

* Se genero el catalogo publico con `scripts/build_public_catalog.py`.
* Se copiaron los 346 PDFs a `public_pdfs/`.
* Se genero `public_data/auditables_346.json`.
* Se reemplazo `index.html` por una app publica utilizable con filtros, resumen y visor PDF.
* Se agrego `app.js` para carga del catalogo, filtros globales, detalle por caso y visor.
* Se ajusto la UI segun criterios del repositorio maestro consultado:
  * boton visible adicional para limpiar filtros;
  * mejor legibilidad movil;
  * control de tamano del visor PDF;
  * tabla resumen desplazable en pantallas angostas.
* Se actualizaron `README.md` y `DEPLOY.md` con el flujo del verificador publico estatico.
* Se consulto la carpeta maestra:
  * `/Users/diegobernardomezabogado/Library/CloudStorage/GoogleDrive-dmeza.py@gmail.com/Mi unidad/MANUAL_MAESTRO_FORMATOS_FUNCIONES_APPWEB`

### Archivos modificados

* `index.html`
* `app.js`
* `scripts/build_public_catalog.py`
* `README.md`
* `DEPLOY.md`
* `BITACORA.md`
* `public_data/auditables_346.json`
* `public_pdfs/*`

### Comandos o scripts ejecutados

* `python3 scripts/build_public_catalog.py`
* `node --check app.js`
* `python3 -m http.server 8016`
* `curl -I http://localhost:8016/`
* `npx playwright install chromium`
* `npx playwright screenshot --device='Desktop Chrome' http://localhost:8016/ playwright_home.png`
* `npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:8016/ playwright_mobile.png`

### Resultados verificados

* Resultado del generador: `records=346 pdfs=346 missing=0`.
* `public_data/auditables_346.json` responde correctamente y contiene 346 registros.
* Un PDF de prueba en `public_pdfs/00033_Praxis_Educativa_2025.pdf` respondio `HTTP 200`.
* La captura desktop muestra catalogo, KPIs y panel de detalle cargados.
* La captura angosta tipo movil muestra encabezado, KPIs y acciones sin desborde visual en la primera vista.

### Pruebas realizadas

* Validacion sintactica de JavaScript con `node --check`.
* Prueba HTTP local del sitio estatico.
* Prueba HTTP local del JSON publico.
* Prueba HTTP local de un PDF real.
* Capturas Playwright en escritorio y vista angosta.

### Errores o incidentes

* El entorno no tenia navegadores de Playwright descargados; se resolvio con `npx playwright install chromium`.
* La captura con dispositivo movil predefinido intento usar WebKit no instalado; se resolvio usando Chromium con viewport angosto.

### Soluciones aplicadas

* Se uso una arquitectura completamente estatica para la verificacion publica.
* Se concentro la logica de filtros en una sola cadena de datos para que lista, detalle y resumen partan del mismo catalogo.
* Se agrego un boton visible de reseteo global fuera del panel lateral para mejorar usabilidad.

### Pendientes

* Publicar o actualizar GitHub Pages del repositorio con `index.html`, `app.js`, `public_data/` y `public_pdfs/`.
* Evaluar anonimizar los 346 PDFs antes del push final si la publicacion sera abierta.
* Revisar si conviene agregar una portada explicita del paquete de replicacion dentro del sitio.

### Riesgos

* Subir los PDFs tal como estan puede exponer metadatos o nombres que luego se prefiera anonimizar.
* El repo crecera de forma importante al incorporar `public_pdfs/`.
* Si se actualiza la tabla fuente, el sitio debe regenerarse para no quedar desalineado.

### Recomendaciones

* No publicar el branch final sin antes decidir si los PDFs deben pasar por una capa de anonimizado o limpieza de metadatos.
* Mantener `scripts/build_public_catalog.py` como paso obligatorio previo a cada despliegue.
* Cuando se publique en Pages, verificar manualmente varios PDFs al azar desde la URL publica, no solo localmente.

## 2026-05-03 - Cierre NotebookLM y comparaciones

### Estado de cobertura

- Universo auditable: 346 PDFs (`data/articulos_auditables_346.csv`).
- NotebookLM consolidado: 346 evaluaciones (`data/evaluaciones_notebooklm_muestreo.csv`).
- Cobertura NotebookLM contra base auditable: 346/346.
- Duplicados por nombre de archivo normalizado: 0.
- Faltantes contra base auditable: 0.
- Extras fuera de base auditable: 0.

### Distribucion final NotebookLM

| D | n |
|---|---:|
| Falla fuerte con reconocimiento | 159 |
| Falla fuerte clasica | 88 |
| Sin falla relevante | 68 |
| Debilidad importante | 22 |
| No evaluable | 9 |

### Archivos NotebookLM generados o actualizados

- `data/evaluaciones_notebooklm_muestreo.csv`: consolidado final NotebookLM, 346 filas.
- `data/notebooklm_pendientes_17_manifest.csv`: manifiesto de los 17 PDFs que faltaban antes del cierre.
- `notebooklm_pendientes_17_pdfs/`: copia original de los 17 PDFs pendientes.
- `notebooklm_pendientes_17_pdfs_ASCII/`: copia con nombres ASCII para carga mas estable en NotebookLM.
- `notebooklm_pendientes_17_pdfs_ASCII.zip`: ZIP con los 17 PDFs pendientes.

### Comparacion NotebookLM contra otros modelos

Se cruzo NotebookLM contra Codex/GPT, Gemini 2.5 Flash y Claude Haiku usando `pdf_id` derivado de `articulos_auditables_346.csv`.

Archivos generados:

- `data/comparacion_notebooklm_codex_gemini_claude.csv`
- `data/resumen_comparacion_notebooklm.csv`
- `data/discrepancias_notebooklm_codex_gemini_claude.csv`

Resumen final sobre 346 registros cruzados:

| Comparacion | n | D igual | D igual % | ABCD igual | ABCD igual % |
|---|---:|---:|---:|---:|---:|
| NotebookLM vs Codex/GPT | 346 | 167 | 48.3 | 124 | 35.8 |
| NotebookLM vs Gemini | 346 | 153 | 44.2 | 143 | 41.3 |
| NotebookLM vs Claude | 346 | 123 | 35.5 | 110 | 31.8 |

Consenso de D entre NotebookLM, Codex/GPT, Gemini y Claude:

| Estado | n |
|---|---:|
| Unanimidad | 62 |
| 3 de 4 | 119 |
| 2 de 4 | 154 |
| Sin consenso | 11 |

Notas:

- Se normalizaron nombres con acentos/Unicode para cruzar NotebookLM contra `articulos_auditables_346.csv`.
- El cruce final quedo regenerado con 346/346 y 0 registros sin mapear.
- `data/discrepancias_notebooklm_codex_gemini_claude.csv` contiene 165 casos de desacuerdo fuerte o empate 2 de 4.

### Comparacion contra validacion local previa

Se cruzo NotebookLM y los modelos contra una tabla local previa de validacion:

- Fuente humana: `04_INVESTIGACION_REPO/tabla_validacion_humano_vs_ia_auditables_346.csv`
- Filas con D computable: 150.
- Filas con A/B/C/D computable: 149.
- Revisores registrados en esa tabla: `Codex` = 120 y `Claude/Codex` = 30.
- Importante: estas 150 filas no corresponden a los revisores humanos activos de la app online.

Archivos generados:

- `data/comparacion_notebooklm_y_modelos_vs_humano.csv`
- `data/resumen_modelos_vs_humano.csv`
- `data/discrepancias_notebooklm_vs_humano.csv`

Resumen:

| Modelo | n D | D igual | D igual % | n ABCD | ABCD igual | ABCD igual % |
|---|---:|---:|---:|---:|---:|---:|
| NotebookLM | 150 | 76 | 50.7 | 149 | 50 | 33.6 |
| Codex/GPT | 150 | 144 | 96.0 | 149 | 143 | 96.0 |
| Gemini | 150 | 65 | 43.3 | 149 | 57 | 38.3 |
| Claude | 150 | 53 | 35.3 | 149 | 45 | 30.2 |

NotebookLM vs esta validacion local previa por dimension:

| Dimension | Acuerdo % |
|---|---:|
| A | 80.5 |
| B | 59.1 |
| C | 61.7 |
| D | 50.7 |

Notas metodologicas:

- Los 150 registros de esta comparacion deben interpretarse como validacion local previa/asistida, no como calificaciones humanas actuales de Diego/Julio.
- La alta coincidencia Codex/GPT vs esta tabla local se explica porque esa tabla esta alineada con validacion previa Codex/Claude-Codex, no con una validacion humana independiente completa.
- Esta seccion queda conservada solo como antecedente. La comparacion humana correcta es la de la seccion siguiente, exportada desde la app online.

### Comparacion correcta contra humanos activos online

Se publico el endpoint admin `export_calificaciones` en Apps Script v30 y se exportaron las filas crudas del libro online. Luego se deduplico por ultimo registro de cada par `revisor + pdf_id`.

Cobertura humana activa al 2026-05-03:

| Revisor humano | Filas crudas | PDFs unicos usados |
|---|---:|---:|
| DIEGO MEZA | 97 | 90 |
| JulioVelotto | 10 | 10 |
| Total humanos activos | 107 | 100 |

Archivos generados:

- `data/calificaciones_online_raw.csv`
- `data/calificaciones_humanas_activas_ultimas.csv`
- `data/comparacion_modelos_vs_humanos_activos.csv`
- `data/resumen_modelos_vs_humanos_activos.csv`
- `data/comparacion_notebooklm_vs_humanos_activos.csv`
- `data/resumen_notebooklm_vs_humanos_activos.csv`
- `data/discrepancias_notebooklm_vs_humanos_activos.csv`
- `data/matriz_D_modelos_vs_humanos_activos.csv`

Resumen agregado contra humanos activos, n = 100:

| Modelo | A igual % | B igual % | C igual % | D igual % | ABCD igual % |
|---|---:|---:|---:|---:|---:|
| NotebookLM | 84.0 | 64.0 | 79.0 | 57.0 | 42.0 |
| Codex/GPT | 73.0 | 70.0 | 52.0 | 45.0 | 25.0 |
| Gemini | 81.0 | 72.0 | 70.0 | 42.0 | 38.0 |
| Claude | 74.0 | 66.0 | 65.0 | 29.0 | 27.0 |

Resumen NotebookLM por revisor humano:

| Revisor humano | n | A igual % | B igual % | C igual % | D igual % | ABCD igual % |
|---|---:|---:|---:|---:|---:|---:|
| DIEGO MEZA | 90 | 85.6 | 63.3 | 80.0 | 60.0 | 44.4 |
| JulioVelotto | 10 | 70.0 | 70.0 | 70.0 | 30.0 | 20.0 |
| Todos | 100 | 84.0 | 64.0 | 79.0 | 57.0 | 42.0 |

Notas tecnicas:

- NotebookLM mapeo 346/346 despues de normalizar Unicode en nombres de archivo; antes aparecian 16 falsos faltantes por acentos compuestos/descompuestos.
- Esta es la comparacion que debe usarse para hablar de humanos activos. La tabla local de 150 no debe mezclarse con DIEGO MEZA ni JulioVelotto.

### Pendientes recomendados

- Actualizar la app web si se desea incluir NotebookLM como cuarto revisor IA en el dashboard.
- Revisar prioritariamente `data/discrepancias_notebooklm_vs_humanos_activos.csv` y `data/discrepancias_notebooklm_codex_gemini_claude.csv`.

## 2026-05-03 - App web actualizada con NotebookLM

- Se genero `data/evaluaciones_notebooklm.csv` con las 346 evaluaciones NotebookLM normalizadas al formato importable de la app: `pdf_id,A,B,C,D,notas,revisor`.
- Se agrego `notebooklm` como revisor tipo modelo en Apps Script.
- Se actualizo el importador admin:
  - `fn=importar_notebooklm`
  - `fn=importar_modelos_346` ahora refresca Codex/GPT, Gemini, Claude y NotebookLM.
- Se actualizo el dashboard para comparar 4 modelos: Codex/GPT, Gemini 2.5 Flash, Claude Haiku y NotebookLM.
- Se publico Apps Script v31 (`v31 notebooklm model import`) sobre el despliegue web activo.
- Se importo NotebookLM al libro online con resultado: 346 importadas, 0 saltadas.
- GitHub quedo actualizado en `main`, commit `6f490d5`.

Diagnostico online despues de importar NotebookLM:

| Revisor | filas | PDFs |
|---|---:|---:|
| codex_gpt | 346 | 346 |
| claude_haiku | 346 | 346 |
| notebooklm | 346 | 346 |
| gemini_flash | 345 | 345 |
| DIEGO MEZA | 113 | pendiente deduplicar |
| gemini_v2 | 12 | 12 |
| claude | 12 | 12 |
| JulioVelotto | 10 | 10 |

Tasas NotebookLM importadas:

| Indicador | n | tasa |
|---|---:|---:|
| A = 1 | 270 | 78.0% |
| B = 1 | 224 | 64.7% |
| C = 1 | 292 | 84.4% |
| A y C | 247 | 71.4% |
| A sin B y C | 88 | 25.4% |
| A, B y C | 159 | 46.0% |

## 2026-05-03 - Imputacion proporcional DIEGO MEZA con NotebookLM

Se asumio explicitamente el costo del sesgo y se completo el faltante de DIEGO MEZA usando un escenario imputado proporcional a la coincidencia observada Diego vs NotebookLM.

Implementacion:

- Archivo generado: `data/imputacion_diego_meza_notebooklm_proporcional.csv`.
- Filas imputadas: 241.
- Revisor usado en el libro online: `DIEGO MEZA`.
- Marca de auditoria en `notas`: `IMPUTADO_NOTEBOOKLM_PROPORCIONAL`.
- No se borraron evaluaciones reales de DIEGO MEZA.
- Apps Script publicado como v32 (`v32 diego notebooklm imputation`).
- Endpoint ejecutado: `fn=importar_imputacion_diego_notebooklm`.
- Resultado online: 241 importadas, 0 saltadas.

Estado final verificado en el libro online:

| Tipo DIEGO MEZA | PDFs unicos |
|---|---:|
| Evaluaciones reales observadas | 105 |
| Evaluaciones imputadas | 241 |
| Total DIEGO MEZA | 346 |

Proporcion final Diego vs NotebookLM despues de imputar:

| Criterio | coincidencias | porcentaje |
|---|---:|---:|
| A | 293 / 346 | 84.7% |
| B | 211 / 346 | 61.0% |
| C | 257 / 346 | 74.3% |
| D | 191 / 346 | 55.2% |
| ABCD exacto | 135 / 346 | 39.0% |
