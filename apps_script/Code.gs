/**
 * califica_articulos_inferenciales — backend Apps Script
 *
 * Flujo doble ciego:
 * 1. La app muestra un PDF auditable (de los 346) sin revelar la calificación IA.
 * 2. El humano califica A, B, C y un veredicto integral (D).
 * 3. Tras submit, se muestra el contraste con la IA y se calcula el acuerdo.
 *
 * Setup obligatorio antes del primer uso:
 *   1) Editar las constantes FOLDER_ID, SHEET_ID y CSV_FILE_ID abajo.
 *   2) Ejecutar setup_inicial() una sola vez para crear el Sheet y poblar
 *      la hoja "auditables" con los 346 registros del CSV.
 */

// ───────────────────── CONFIG ─────────────────────────────────────────────
const FOLDER_ID  = '16qV-NvEplMmXI0ZELAr6TW0C05fMw-Jq';   // carpeta Drive con los PDFs auditables
const SHEET_ID   = '1TU66HYq5_3jiIJ9kLTL-DLrC7Jrhdr3amSACxVnWwPU';
const CSV_URL    = 'https://raw.githubusercontent.com/diegomezapy/califica_articulos_inferenciales/main/data/articulos_auditables_346.csv';

const HOJA_AUDITABLES     = 'auditables';
const HOJA_CALIFICACIONES = 'calificaciones';

// ───────────────────── ENTRYPOINT WEB ─────────────────────────────────────
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'index';
  const tpl = HtmlService.createTemplateFromFile(page === 'stats' ? 'DashboardStats' : 'Index');
  return tpl.evaluate()
    .setTitle('Califica artículos inferenciales')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ───────────────────── SETUP INICIAL ──────────────────────────────────────
/**
 * Crea un Google Sheet nuevo con dos hojas: "auditables" (346 registros
 * descargados desde el CSV publicado en el repo de GitHub) y "calificaciones"
 * (vacía, append-only). Imprime el SHEET_ID en el log para pegar en la
 * constante de arriba.
 */
function setup_inicial() {
  const ss = SpreadsheetApp.create('califica_articulos_inferenciales — calificaciones');
  Logger.log('SHEET creado: ' + ss.getId() + ' (pega este ID en SHEET_ID)');

  // Hoja auditables — descarga directa del CSV en GitHub (raw)
  const resp = UrlFetchApp.fetch(CSV_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('No se pudo descargar el CSV: HTTP ' + resp.getResponseCode());
  }
  const data  = Utilities.parseCsv(resp.getContentText('UTF-8'));
  const hojaA = ss.getSheets()[0].setName(HOJA_AUDITABLES);
  hojaA.getRange(1, 1, data.length, data[0].length).setValues(data);
  hojaA.setFrozenRows(1);

  // Hoja calificaciones (append-only, una fila por evaluación humana)
  const hojaC = ss.insertSheet(HOJA_CALIFICACIONES);
  hojaC.getRange(1, 1, 1, 12).setValues([[
    'timestamp', 'pdf_id', 'pdf_nombre',
    'A_humano', 'B_humano', 'C_humano', 'D_humano',
    'notas',
    'A_ia', 'B_ia', 'C_ia', 'veredicto_ia'
  ]]);
  hojaC.setFrozenRows(1);

  Logger.log('Auditables cargados: ' + (data.length - 1) + ' filas');
  Logger.log('Pegá el SHEET_ID arriba en Code.gs y volvé a publicar la web app.');
  return ss.getId();
}

// ───────────────────── API SERVER → CLIENTE ──────────────────────────────
/**
 * Devuelve el siguiente PDF pendiente de calificar (no presente en
 * la hoja calificaciones). Devuelve también totales para el contador.
 */
function getSiguientePDF() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const ya = new Set(_leerHoja(ss, HOJA_CALIFICACIONES).map(r => String(r.pdf_id)));

  const pendientes = auditables.filter(r => !ya.has(String(r.pdf_id)));
  const total = auditables.length;
  const calificados = total - pendientes.length;

  if (pendientes.length === 0) {
    return { fin: true, total: total, calificados: calificados };
  }
  const r = pendientes[0]; // próximo en orden
  const drive_url = _buscarPDFEnDrive(r.pdf_nombre);
  return {
    fin: false,
    total: total,
    calificados: calificados,
    pdf_id: r.pdf_id,
    pdf_nombre: r.pdf_nombre,
    revista: r.revista,
    pais: r.pais,
    macroarea: r.macroarea,
    anio: r.anio,
    titulo: r.titulo,
    drive_preview_url: drive_url
    // NOTA: NO se devuelven A_ia, B_ia, C_ia, veredicto_ia → doble ciego
  };
}

/**
 * Recibe la calificación humana y persiste. Después devuelve el contraste
 * con la calificación IA para mostrar al usuario.
 */
function submitCalificacion(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const reg = auditables.find(r => String(r.pdf_id) === String(payload.pdf_id));
  if (!reg) throw new Error('pdf_id no encontrado: ' + payload.pdf_id);

  const hojaC = ss.getSheetByName(HOJA_CALIFICACIONES);
  hojaC.appendRow([
    new Date(),
    payload.pdf_id,
    reg.pdf_nombre,
    payload.A,
    payload.B,
    payload.C,
    payload.D,
    payload.notas || '',
    reg.A_ia, reg.B_ia, reg.C_ia, reg.veredicto_ia
  ]);

  // Contraste con IA
  return {
    A_humano: payload.A, A_ia: reg.A_ia, A_match: String(payload.A) === String(reg.A_ia),
    B_humano: payload.B, B_ia: reg.B_ia, B_match: String(payload.B) === String(reg.B_ia),
    C_humano: payload.C, C_ia: reg.C_ia, C_match: String(payload.C) === String(reg.C_ia),
    D_humano: payload.D, D_ia: reg.veredicto_ia, D_match: payload.D === reg.veredicto_ia,
    motivo_ia: reg.motivo_ia,
    confianza_ia: reg.confianza_ia
  };
}

/**
 * Estadísticas para el dashboard: acuerdo simple, kappa, matriz de confusión.
 */
function getEstadisticas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const n = cal.length;
  if (n === 0) return { n: 0 };

  const acuerdo = (key_h, key_i) => cal.filter(r => String(r[key_h]) === String(r[key_i])).length / n;
  const acuerdoA = acuerdo('A_humano', 'A_ia');
  const acuerdoB = acuerdo('B_humano', 'B_ia');
  const acuerdoC = acuerdo('C_humano', 'C_ia');
  const acuerdoD = acuerdo('D_humano', 'veredicto_ia');

  // Cohen's kappa para D (variable categórica de 4 valores)
  const labels = ['FF clasica', 'FF con reconocimiento', 'Debilidad importante', 'Sin falla relevante'];
  const M = labels.map(() => labels.map(() => 0));
  cal.forEach(r => {
    const i = labels.indexOf(r.D_humano);
    const j = labels.indexOf(r.veredicto_ia);
    if (i >= 0 && j >= 0) M[i][j] += 1;
  });
  const totalM = M.flat().reduce((s, x) => s + x, 0);
  let pO = 0; for (let k = 0; k < labels.length; k++) pO += M[k][k];
  pO = totalM ? pO / totalM : 0;
  let pE = 0;
  for (let k = 0; k < labels.length; k++) {
    const fila = M[k].reduce((s, x) => s + x, 0) / totalM;
    const col  = M.map(r => r[k]).reduce((s, x) => s + x, 0) / totalM;
    pE += fila * col;
  }
  const kappa = pE === 1 ? null : (pO - pE) / (1 - pE);

  return {
    n: n,
    acuerdoA: acuerdoA,
    acuerdoB: acuerdoB,
    acuerdoC: acuerdoC,
    acuerdoD: acuerdoD,
    kappa: kappa,
    matriz: M,
    labels: labels
  };
}

// ───────────────────── HELPERS ────────────────────────────────────────────
function _leerHoja(ss, nombre) {
  const sh = ss.getSheetByName(nombre);
  const v  = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const head = v[0];
  return v.slice(1).map(row => Object.fromEntries(head.map((h, i) => [h, row[i]])));
}

function _buscarPDFEnDrive(pdfNombre) {
  // Cache de búsquedas para evitar pegarle a Drive repetidas veces
  const cache = CacheService.getScriptCache();
  const k = 'pdf:' + pdfNombre;
  const c = cache.get(k);
  if (c) return c;

  // 1) Intento directo: archivo dentro de FOLDER_ID
  const folder = DriveApp.getFolderById(FOLDER_ID);
  let files = folder.getFilesByName(pdfNombre);
  if (files.hasNext()) {
    const id = files.next().getId();
    const url = 'https://drive.google.com/file/d/' + id + '/preview';
    cache.put(k, url, 21600);
    return url;
  }

  // 2) Búsqueda recursiva en subcarpetas
  const idRecursivo = _buscarRecursivo(folder, pdfNombre);
  if (idRecursivo) {
    const url = 'https://drive.google.com/file/d/' + idRecursivo + '/preview';
    cache.put(k, url, 21600);
    return url;
  }

  // 3) Búsqueda global por nombre (todo el Drive del usuario, incluye shared drives)
  // Última red de seguridad: si el archivo está fuera del FOLDER_ID por alguna razón.
  const it = DriveApp.getFilesByName(pdfNombre);
  if (it.hasNext()) {
    const id = it.next().getId();
    const url = 'https://drive.google.com/file/d/' + id + '/preview';
    cache.put(k, url, 21600);
    return url;
  }

  return '';
}

function _buscarRecursivo(folder, pdfNombre) {
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const f = sub.getFilesByName(pdfNombre);
    if (f.hasNext()) return f.next().getId();
    const id = _buscarRecursivo(sub, pdfNombre);
    if (id) return id;
  }
  return '';
}

/**
 * Función diagnóstica: imprime en el log qué hay en la carpeta y dónde.
 * Ejecutar manualmente desde el editor si los PDFs no se encuentran.
 */
function diagnostico_carpeta() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('Carpeta: ' + folder.getName() + ' (' + folder.getId() + ')');

  let nFiles = 0;
  const itF = folder.getFiles();
  while (itF.hasNext() && nFiles < 5) {
    const f = itF.next();
    Logger.log('  archivo: ' + f.getName());
    nFiles++;
  }
  if (itF.hasNext()) Logger.log('  (más archivos no listados)');
  Logger.log('Total archivos directos: ' + (nFiles >= 5 ? '≥5' : nFiles));

  let nSubs = 0;
  const itS = folder.getFolders();
  while (itS.hasNext()) {
    const s = itS.next();
    nSubs++;
    let cnt = 0;
    const itFS = s.getFiles();
    while (itFS.hasNext()) { itFS.next(); cnt++; }
    Logger.log('  subcarpeta: ' + s.getName() + ' (' + cnt + ' archivos)');
  }
  Logger.log('Total subcarpetas: ' + nSubs);

  // Probar la búsqueda con un PDF de ejemplo
  const muestra = '00033_Praxis_Educativa_2025.pdf';
  Logger.log('---');
  Logger.log('Probando búsqueda de: ' + muestra);
  const url = _buscarPDFEnDrive(muestra);
  Logger.log('Resultado: ' + (url ? 'ENCONTRADO ' + url : 'NO ENCONTRADO'));
}
