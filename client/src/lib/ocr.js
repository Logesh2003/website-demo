// Browser-side document helpers: PDF page rendering (pdf.js), text-layer extraction for
// digital PDFs, and offline OCR (Tesseract, Tamil + English) for scans and photos.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

let workerPromise = null;
let progressCb = null;
export function onOcrProgress(cb) { progressCb = cb; }

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker(['tam', 'eng'], 1, { logger: (m) => progressCb?.(m) }));
  }
  return workerPromise;
}

let engPromise = null;
async function getEnglishWorker() {
  if (!engPromise) engPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng', 1, { logger: (m) => progressCb?.(m) }));
  return engPromise;
}

// In Tamil mode Tesseract often reads the Latin letters of an EPIC (e.g. "TNS") as digits.
// A quick English-only pass recovers them; we swap them back in by serial number.
const SERIAL_GARBLED = /^\s*(\d{1,4})[\s.)]+[0-9A-Z]{8,12}\s*$/i;
async function restoreEpics(strip, text) {
  const lines = text.split(/\r?\n/);
  if (!lines.some((l) => SERIAL_GARBLED.test(l) && !/[A-Z]{3}\d{7}/i.test(l))) return text;
  const worker = await getEnglishWorker();
  const { data } = await worker.recognize(strip);
  const bySerial = new Map();
  for (const line of data.text.split(/\r?\n/)) {
    const m = /^\s*(\d{1,4})[\s.)]+([A-Z]{3})\s?(\d{7})\b/.exec(line);
    if (m) bySerial.set(m[1], m[2] + m[3]);
  }
  return lines.map((l) => {
    const m = SERIAL_GARBLED.exec(l);
    return m && bySerial.has(m[1]) ? `${m[1]} ${bySerial.get(m[1])}` : l;
  }).join('\n');
}

export async function ocrCanvas(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return data.text;
}

/**
 * Finds the vertical box borders of the roll grid (long dark vertical lines) so each
 * column of voter boxes can be cut out exactly. Returns columns+1 x-positions, or null.
 */
export function findColumnEdges(canvas, columns = 3) {
  const { width: w, height: h } = canvas;
  const y0 = Math.round(h * 0.15);
  const y1 = Math.round(h * 0.85);
  const data = canvas.getContext('2d').getImageData(0, y0, w, y1 - y0).data;
  const dark = new Float32Array(w);
  let rows = 0;
  for (let y = 0; y < y1 - y0; y += 2) {
    rows++;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i] + data[i + 1] + data[i + 2] < 330) dark[x]++;
    }
  }
  const lines = [];
  for (let x = 0; x < w; x++) {
    if (dark[x] / rows < 0.55) continue;
    const last = lines[lines.length - 1];
    if (last && x - last.end <= 3) last.end = x; else lines.push({ start: x, end: x });
  }
  const xs = lines.map((l) => (l.start + l.end) / 2);
  if (xs.length < columns + 1) return null;
  const left = xs[0];
  const right = xs[xs.length - 1];
  if (right - left < w * 0.5) return null;
  const edges = [left];
  for (let c = 1; c < columns; c++) {
    const target = left + ((right - left) * c) / columns;
    edges.push(xs.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), xs[1]));
  }
  edges.push(right);
  return edges.every((x, i) => i === 0 || x - edges[i - 1] > w * 0.15) ? edges : null;
}

/** Rolls print 3 voter boxes per row. Reading each column strip separately keeps boxes intact. */
export async function ocrRollPage(canvas, columns = 3) {
  const top = Math.round(canvas.height * 0.03);
  const bottom = Math.round(canvas.height * 0.97);
  const edges = findColumnEdges(canvas, columns) || Array.from({ length: columns + 1 }, (_, i) => Math.round((canvas.width * i) / columns));
  const parts = [];
  for (let c = 0; c < columns; c++) {
    const x = Math.round(edges[c]) + 3;
    const w = Math.round(edges[c + 1]) - x - 2;
    const strip = document.createElement('canvas');
    // Enlarge small text and boost contrast: Tesseract separates Tamil glyphs and word gaps better.
    const k = w < 900 ? 1.6 : 1;
    strip.width = Math.round(w * k);
    strip.height = Math.round((bottom - top) * k);
    const sctx = strip.getContext('2d');
    sctx.filter = 'grayscale(1) contrast(1.35)';
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(canvas, x, top, w, bottom - top, 0, 0, strip.width, strip.height);
    parts.push(await restoreEpics(strip, await ocrCanvas(strip)));
  }
  // The header (constituency, part no.) spans the full width: read it once.
  const head = document.createElement('canvas');
  head.width = canvas.width;
  head.height = Math.round(canvas.height * 0.1);
  head.getContext('2d').drawImage(canvas, 0, 0, canvas.width, head.height, 0, 0, canvas.width, head.height);
  return [await ocrCanvas(head), ...parts].join('\n');
}

/** Turns a pdf.js text layer into column-ordered lines (digital PDFs need no OCR). */
function textLayerToText(items, pageWidth, columns = 3) {
  const cols = Array.from({ length: columns }, () => []);
  const header = [];
  // Column starts = where the "Name" labels sit; fall back to equal thirds.
  const starts = [];
  for (const it of items) {
    if (!/^\s*(Name|பெயர்)\s*[:;]/i.test(it.str || '')) continue;
    const x = it.transform[4];
    if (!starts.some((s) => Math.abs(s - x) < 12)) starts.push(x);
  }
  starts.sort((a, b) => a - b);
  const bounds = starts.length === columns ? starts.slice(1).map((s) => s - 4) : Array.from({ length: columns - 1 }, (_, i) => (pageWidth * (i + 1)) / columns);
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    const col = bounds.filter((b) => x >= b).length;
    (it.width > pageWidth * 0.5 ? header : cols[col]).push({ x, y, s: it.str });
  }
  const toLines = (arr) => {
    arr.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const t of arr) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - t.y) < 3) last.s += ' ' + t.s; else lines.push({ y: t.y, s: t.s });
    }
    return lines.map((l) => l.s.trim()).join('\n');
  };
  return [toLines(header), ...cols.map(toLines)].join('\n');
}

/** Yields {page, total, canvas, text} for each PDF page. text is set when the PDF has a real text layer. */
export async function* pdfPages(file, scale = 2) {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const tc = await page.getTextContent();
    const raw = textLayerToText(tc.items, page.getViewport({ scale: 1 }).width);
    yield { page: i, total: doc.numPages, canvas, text: raw.replace(/\s+/g, '').length > 200 ? raw : null };
  }
}

export async function imageToCanvas(file, maxSide = 2400) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

/** JPEG data URL, long side capped, for sending to the server (Claude vision). */
export function canvasToDataUrl(canvas, maxSide = 1800) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  if (k === 1) return canvas.toDataURL('image/jpeg', 0.85);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
