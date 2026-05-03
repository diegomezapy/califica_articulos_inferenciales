# Bitacora del proyecto

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
