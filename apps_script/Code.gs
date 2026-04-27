/**
 * califica_articulos_inferenciales — backend Apps Script
 *
 * Flujo doble ciego, multi-revisor:
 * 1. La app pide al revisor que se identifique con un nombre (persistido en localStorage).
 * 2. Muestra un PDF auditable sin revelar la calificación IA.
 * 3. El humano califica A, B, C y un veredicto integral (D), incluyendo "No evaluable".
 * 4. Tras submit, se muestra el contraste con la IA y se guarda con el nombre del revisor.
 * 5. El mismo PDF puede ser calificado por múltiples revisores; el dashboard
 *    contrasta IA vs humanos (todos), y entre humanos (kappa pairwise).
 */

// ───────────────────── CONFIG ─────────────────────────────────────────────
const FOLDER_ID  = '16qV-NvEplMmXI0ZELAr6TW0C05fMw-Jq';
const SHEET_ID   = '1TU66HYq5_3jiIJ9kLTL-DLrC7Jrhdr3amSACxVnWwPU';
const CSV_URL    = 'https://raw.githubusercontent.com/diegomezapy/califica_articulos_inferenciales/main/data/articulos_auditables_346.csv';

const HOJA_AUDITABLES     = 'auditables';
const HOJA_CALIFICACIONES = 'calificaciones';
const HOJA_COMPARACION    = 'comparacion';

// Columnas de la hoja calificaciones (orden fijo)
const COLS_CAL = ['timestamp', 'pdf_id', 'pdf_nombre',
                  'A_humano', 'B_humano', 'C_humano', 'D_humano',
                  'notas', 'A_ia', 'B_ia', 'C_ia', 'veredicto_ia',
                  'revisor'];

// Categorías válidas para D (incluye "No evaluable" para casos donde el humano
// determina que el PDF no debió haber sido auditado)
const CATEGORIAS_D = [
  'FF clasica',
  'FF con reconocimiento',
  'Debilidad importante',
  'Sin falla relevante',
  'No evaluable'
];

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

// ───────────────────── SETUP / MIGRACIÓN ─────────────────────────────────
function setup_inicial() {
  const ss = SpreadsheetApp.create('califica_articulos_inferenciales — calificaciones');
  Logger.log('SHEET creado: ' + ss.getId() + ' (pega este ID en SHEET_ID)');

  const resp = UrlFetchApp.fetch(CSV_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('No se pudo descargar el CSV: HTTP ' + resp.getResponseCode());
  }
  const data  = Utilities.parseCsv(resp.getContentText('UTF-8'));
  const hojaA = ss.getSheets()[0].setName(HOJA_AUDITABLES);
  hojaA.getRange(1, 1, data.length, data[0].length).setValues(data);
  hojaA.setFrozenRows(1);

  const hojaC = ss.insertSheet(HOJA_CALIFICACIONES);
  hojaC.getRange(1, 1, 1, COLS_CAL.length).setValues([COLS_CAL]);
  hojaC.setFrozenRows(1);

  ss.insertSheet(HOJA_COMPARACION);
  actualizar_hoja_comparacion();

  Logger.log('Auditables cargados: ' + (data.length - 1) + ' filas');
  Logger.log('Pegá el SHEET_ID arriba en Code.gs y volvé a publicar la web app.');
  return ss.getId();
}

/**
 * Migración: si la hoja calificaciones existente NO tiene la columna "revisor",
 * la agrega al final y rellena las filas existentes con "(anonimo)".
 * Idempotente: si ya está, no hace nada.
 */
function migrar_agregar_columna_revisor() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (head.indexOf('revisor') !== -1) {
    Logger.log('Ya existe columna revisor. Sin cambios.');
    return;
  }
  const newCol = head.length + 1;
  sh.getRange(1, newCol).setValue('revisor');
  const nFilas = sh.getLastRow() - 1;
  if (nFilas > 0) {
    const fill = Array(nFilas).fill(['(anonimo)']);
    sh.getRange(2, newCol, nFilas, 1).setValues(fill);
  }
  Logger.log('Columna revisor agregada. Filas migradas: ' + nFilas);
}

// ───────────────────── API SERVER → CLIENTE ──────────────────────────────
/**
 * Devuelve la lista completa de los 346 PDFs con metadatos cortos y
 * estado por revisor: si yo (revisor) ya lo califiqué y cuántos otros
 * lo evaluaron. NO incluye URL de Drive (se carga on-demand al elegir
 * un PDF) para mantener la lista liviana.
 */
function getListaPDFs(revisor) {
  if (!revisor || !String(revisor).trim()) {
    throw new Error('Falta nombre de revisor.');
  }
  revisor = String(revisor).trim();

  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Lectura rápida de auditables: solo columnas necesarias
  const shA = ss.getSheetByName(HOJA_AUDITABLES);
  if (!shA) throw new Error('Hoja auditables no encontrada en el Sheet.');
  const lastRowA = shA.getLastRow();
  const lastColA = shA.getLastColumn();
  if (lastRowA < 2) {
    return { revisor: revisor, total: 0, calificados_por_mi: 0, items: [] };
  }
  const headA = shA.getRange(1, 1, 1, lastColA).getValues()[0];
  const idxA = {
    pdf_id:    headA.indexOf('pdf_id'),
    pdf_nombre: headA.indexOf('pdf_nombre'),
    revista:   headA.indexOf('revista'),
    pais:      headA.indexOf('pais'),
    macroarea: headA.indexOf('macroarea'),
    anio:      headA.indexOf('anio'),
    titulo:    headA.indexOf('titulo')
  };
  const valoresA = shA.getRange(2, 1, lastRowA - 1, lastColA).getValues();

  // Lectura de calificaciones (solo pdf_id y revisor)
  const yoCal = new Set();
  const evalsPorPdf = {};
  const shC = ss.getSheetByName(HOJA_CALIFICACIONES);
  if (shC && shC.getLastRow() > 1) {
    const headC = shC.getRange(1, 1, 1, shC.getLastColumn()).getValues()[0];
    const idxPdf = headC.indexOf('pdf_id');
    const idxRev = headC.indexOf('revisor');
    const valoresC = shC.getRange(2, 1, shC.getLastRow() - 1, shC.getLastColumn()).getValues();
    for (var i = 0; i < valoresC.length; i++) {
      const row = valoresC[i];
      const pid = String(row[idxPdf]);
      const rev = idxRev >= 0 ? String(row[idxRev] || '(anonimo)').trim() : '(anonimo)';
      if (rev === revisor) yoCal.add(pid);
      if (!evalsPorPdf[pid]) evalsPorPdf[pid] = new Set();
      evalsPorPdf[pid].add(rev);
    }
  }

  const items = valoresA.map(row => {
    const pid = String(row[idxA.pdf_id]);
    const todos = evalsPorPdf[pid] ? Array.from(evalsPorPdf[pid]) : [];
    const otros = todos.filter(rv => rv !== revisor);
    return {
      pdf_id:    row[idxA.pdf_id],
      pdf_nombre: String(row[idxA.pdf_nombre] || ''),
      revista:   String(row[idxA.revista] || ''),
      pais:      String(row[idxA.pais] || ''),
      macroarea: String(row[idxA.macroarea] || ''),
      anio:      String(row[idxA.anio] || ''),
      titulo:    String(row[idxA.titulo] || ''),
      yo_califique: yoCal.has(pid),
      eval_otros_count: otros.length
    };
  });

  return {
    revisor: revisor,
    total: items.length,
    calificados_por_mi: items.filter(x => x.yo_califique).length,
    items: items
  };
}

/**
 * Devuelve los datos de un PDF específico por pdf_id (o el primero
 * pendiente si no se pasa pdf_id), con la URL preview de Drive.
 * No expone la calificación IA → doble ciego.
 */
function getPDF(pdf_id, revisor) {
  if (!revisor || !String(revisor).trim()) {
    throw new Error('Falta nombre de revisor.');
  }
  revisor = String(revisor).trim();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const calificaciones = _leerHoja(ss, HOJA_CALIFICACIONES);

  const yoCal = new Set(
    calificaciones.filter(r => String(r.revisor) === revisor)
                  .map(r => String(r.pdf_id))
  );
  const evalsPorPdf = {};
  calificaciones.forEach(r => {
    const k = String(r.pdf_id);
    if (!evalsPorPdf[k]) evalsPorPdf[k] = [];
    evalsPorPdf[k].push(String(r.revisor));
  });

  let target;
  if (pdf_id != null && String(pdf_id) !== '') {
    target = auditables.find(r => String(r.pdf_id) === String(pdf_id));
    if (!target) throw new Error('pdf_id no encontrado: ' + pdf_id);
  } else {
    target = auditables.find(r => !yoCal.has(String(r.pdf_id)));
    if (!target) {
      return {
        fin: true,
        total: auditables.length,
        calificados: yoCal.size,
        revisor: revisor
      };
    }
  }

  const drive_url = _buscarPDFEnDrive(target.pdf_nombre);
  const otros = (evalsPorPdf[String(target.pdf_id)] || []).filter(rv => rv !== revisor);

  return {
    fin: false,
    total: auditables.length,
    calificados: yoCal.size,
    revisor: revisor,
    pdf_id: target.pdf_id,
    pdf_nombre: target.pdf_nombre,
    revista: target.revista,
    pais: target.pais,
    macroarea: target.macroarea,
    anio: target.anio,
    titulo: target.titulo,
    drive_preview_url: drive_url,
    yo_califique: yoCal.has(String(target.pdf_id)),
    eval_otros_count: otros.length,
    eval_otros_revisores: otros
  };
}

/** Alias retrocompatible: devuelve el primer PDF pendiente del revisor. */
function getSiguientePDF(revisor) {
  return getPDF(null, revisor);
}

/**
 * Recibe la calificación humana, la persiste con el revisor indicado,
 * y devuelve el contraste con la calificación IA.
 */
function submitCalificacion(payload) {
  if (!payload.revisor || !String(payload.revisor).trim()) {
    throw new Error('Falta revisor.');
  }
  if (CATEGORIAS_D.indexOf(payload.D) === -1) {
    throw new Error('Veredicto D inválido: ' + payload.D);
  }

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
    reg.A_ia, reg.B_ia, reg.C_ia, reg.veredicto_ia,
    String(payload.revisor).trim()
  ]);

  return {
    A_humano: payload.A, A_ia: reg.A_ia, A_match: String(payload.A) === String(reg.A_ia),
    B_humano: payload.B, B_ia: reg.B_ia, B_match: String(payload.B) === String(reg.B_ia),
    C_humano: payload.C, C_ia: reg.C_ia, C_match: String(payload.C) === String(reg.C_ia),
    D_humano: payload.D, D_ia: reg.veredicto_ia, D_match: payload.D === reg.veredicto_ia,
    motivo_ia: reg.motivo_ia,
    confianza_ia: reg.confianza_ia
  };
}

/** Devuelve la URL del Sheet para el botón "Ir al libro". */
function getURLSheet() {
  return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
}

/**
 * Estadísticas: acuerdo IA vs cada revisor, kappa vs IA, kappa entre
 * humanos (pairwise) cuando hay PDFs con ≥2 revisores.
 */
function getEstadisticas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const n = cal.length;
  if (n === 0) return { n: 0 };

  const revisores = Array.from(new Set(cal.map(r => String(r.revisor || '(anonimo)')))).sort();
  const labelsD = CATEGORIAS_D.slice();

  // Por revisor: acuerdo simple por dimensión, kappa vs IA en D, matriz
  const porRevisor = revisores.map(rv => {
    const filas = cal.filter(r => String(r.revisor) === rv);
    const acu = (kh, ki) => filas.filter(r => String(r[kh]) === String(r[ki])).length / filas.length;
    return {
      revisor: rv,
      n: filas.length,
      acuerdoA: acu('A_humano', 'A_ia'),
      acuerdoB: acu('B_humano', 'B_ia'),
      acuerdoC: acu('C_humano', 'C_ia'),
      acuerdoD: acu('D_humano', 'veredicto_ia'),
      kappaD: _kappa(filas.map(r => [r.D_humano, r.veredicto_ia]), labelsD),
      matriz: _matrizConfusion(filas, 'D_humano', 'veredicto_ia', labelsD)
    };
  });

  // Kappa entre humanos: pares de revisores que hayan calificado el mismo PDF
  const kappasHumanos = [];
  for (let i = 0; i < revisores.length; i++) {
    for (let j = i + 1; j < revisores.length; j++) {
      const a = revisores[i], b = revisores[j];
      const filasA = cal.filter(r => String(r.revisor) === a);
      const filasB = cal.filter(r => String(r.revisor) === b);
      const mapA = {}; filasA.forEach(r => { mapA[r.pdf_id] = r.D_humano; });
      const mapB = {}; filasB.forEach(r => { mapB[r.pdf_id] = r.D_humano; });
      const pares = [];
      Object.keys(mapA).forEach(pid => { if (mapB[pid]) pares.push([mapA[pid], mapB[pid]]); });
      if (pares.length >= 2) {
        kappasHumanos.push({
          revisorA: a, revisorB: b,
          n: pares.length,
          kappa: _kappa(pares, labelsD),
          matriz: _matrizPares(pares, labelsD)
        });
      }
    }
  }

  return {
    n: n,
    revisores: revisores,
    porRevisor: porRevisor,
    kappasHumanos: kappasHumanos,
    labelsD: labelsD
  };
}

/**
 * Construye/actualiza la hoja "comparacion" con una fila por PDF y una
 * columna por revisor + IA. Útil para revisar visualmente desde el Sheet.
 */
function actualizar_hoja_comparacion() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);

  const revisores = Array.from(new Set(cal.map(r => String(r.revisor || '(anonimo)')))).sort();
  const head = ['pdf_id', 'pdf_nombre', 'titulo', 'IA_veredicto']
                 .concat(revisores.map(r => 'humano: ' + r))
                 .concat(['n_humanos', 'acuerdo_total']);

  // Indexar calificaciones por (pdf_id, revisor)
  const idx = {};
  cal.forEach(r => {
    const k = String(r.pdf_id);
    if (!idx[k]) idx[k] = {};
    idx[k][String(r.revisor)] = r.D_humano;
  });

  const filas = auditables.map(a => {
    const k = String(a.pdf_id);
    const cells = [a.pdf_id, a.pdf_nombre, a.titulo, a.veredicto_ia];
    let nHumanos = 0;
    const valoresHumanos = [];
    revisores.forEach(rv => {
      const v = (idx[k] || {})[rv] || '';
      cells.push(v);
      if (v) { nHumanos++; valoresHumanos.push(v); }
    });
    const todosIguales = (nHumanos > 0) &&
                         valoresHumanos.every(v => v === a.veredicto_ia);
    cells.push(nHumanos);
    cells.push(todosIguales ? 'TODOS_OK' : (nHumanos === 0 ? '' : 'REVISAR'));
    return cells;
  });

  let sh = ss.getSheetByName(HOJA_COMPARACION);
  if (!sh) sh = ss.insertSheet(HOJA_COMPARACION);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (filas.length) sh.getRange(2, 1, filas.length, head.length).setValues(filas);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  Logger.log('Hoja comparacion actualizada. Filas: ' + filas.length + '. Revisores: ' + revisores.join(', '));
}

// ───────────────────── HELPERS ────────────────────────────────────────────
function _leerHoja(ss, nombre) {
  const sh = ss.getSheetByName(nombre);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const head = v[0];
  return v.slice(1).map(row => Object.fromEntries(head.map((h, i) => [h, row[i]])));
}

function _matrizConfusion(filas, keyA, keyB, labels) {
  const M = labels.map(() => labels.map(() => 0));
  filas.forEach(r => {
    const i = labels.indexOf(r[keyA]);
    const j = labels.indexOf(r[keyB]);
    if (i >= 0 && j >= 0) M[i][j] += 1;
  });
  return M;
}

function _matrizPares(pares, labels) {
  const M = labels.map(() => labels.map(() => 0));
  pares.forEach(([a, b]) => {
    const i = labels.indexOf(a);
    const j = labels.indexOf(b);
    if (i >= 0 && j >= 0) M[i][j] += 1;
  });
  return M;
}

/** Cohen's kappa entre dos vectores de etiquetas (pares [a, b]). */
function _kappa(pares, labels) {
  const M = _matrizPares(pares, labels);
  const total = M.flat().reduce((s, x) => s + x, 0);
  if (!total) return null;
  let pO = 0; for (let k = 0; k < labels.length; k++) pO += M[k][k];
  pO /= total;
  let pE = 0;
  for (let k = 0; k < labels.length; k++) {
    const fila = M[k].reduce((s, x) => s + x, 0) / total;
    const col  = M.map(r => r[k]).reduce((s, x) => s + x, 0) / total;
    pE += fila * col;
  }
  return pE === 1 ? null : (pO - pE) / (1 - pE);
}

function _buscarPDFEnDrive(pdfNombre) {
  const cache = CacheService.getScriptCache();
  const k = 'pdf:' + pdfNombre;
  const c = cache.get(k);
  if (c) return c;

  const folder = DriveApp.getFolderById(FOLDER_ID);
  let files = folder.getFilesByName(pdfNombre);
  if (files.hasNext()) {
    const id = files.next().getId();
    const url = 'https://drive.google.com/file/d/' + id + '/preview';
    cache.put(k, url, 21600);
    return url;
  }
  const idRecursivo = _buscarRecursivo(folder, pdfNombre);
  if (idRecursivo) {
    const url = 'https://drive.google.com/file/d/' + idRecursivo + '/preview';
    cache.put(k, url, 21600);
    return url;
  }
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
 * Diagnostico de getListaPDFs: ejecutalo desde el editor para ver
 * cuanto tarda y si hay algun error.
 */
function diagnostico_lista() {
  const t0 = Date.now();
  try {
    const r = getListaPDFs('test');
    const ms = Date.now() - t0;
    Logger.log('OK en ' + ms + 'ms');
    Logger.log('total: ' + r.total + ', calificados_por_mi: ' + r.calificados_por_mi);
    Logger.log('primer item: ' + JSON.stringify(r.items[0]));
    Logger.log('ultimo item: ' + JSON.stringify(r.items[r.items.length - 1]));
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    Logger.log(e.stack);
  }
}

function diagnostico_carpeta() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('Carpeta: ' + folder.getName() + ' (' + folder.getId() + ')');
  let nFiles = 0;
  const itF = folder.getFiles();
  while (itF.hasNext() && nFiles < 5) { itF.next(); nFiles++; }
  if (itF.hasNext()) Logger.log('Total archivos directos: >5 (truncado)');
  else Logger.log('Total archivos directos: ' + nFiles);
  let nSubs = 0;
  const itS = folder.getFolders();
  while (itS.hasNext()) { itS.next(); nSubs++; }
  Logger.log('Total subcarpetas: ' + nSubs);
  const m = '00033_Praxis_Educativa_2025.pdf';
  Logger.log('Buscar muestra ' + m + ' → ' + (_buscarPDFEnDrive(m) || 'NO ENCONTRADO'));
}
