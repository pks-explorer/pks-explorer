import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Ein Textstück mit Position (PDF-Koordinaten: y wächst nach oben). */
export interface PdfItem {
  page: number;
  x: number;
  y: number;
  str: string;
  font: string;
  size: number;
}

export interface PdfLine {
  page: number;
  y: number;
  x: number;
  text: string;
  items: PdfItem[];
}

export async function readPdfItems(file: string): Promise<PdfItem[]> {
  const data = new Uint8Array(await readFile(file));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const out: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const it of content.items) {
      if (!('str' in it)) continue;
      // Aufzählungspunkte kommen als leere Glyphe oder als Zeichen aus dem Private-Use-Bereich einer Symbolschrift
      const str =
        (it.str === '' && it.width > 0) || /^[\uE000-\uF8FF]$/.test(it.str.trim()) ? '•' : it.str;
      if (!str.trim()) continue;
      out.push({
        page: p,
        x: it.transform[4],
        y: it.transform[5],
        str,
        font: it.fontName,
        size: Math.abs(it.transform[0]) || it.height,
      });
    }
  }
  return out;
}

/** Fasst Textstücke mit (fast) gleicher y-Position zu Zeilen zusammen, sortiert von oben nach unten. */
export function groupLines(items: PdfItem[], tolerance = 2): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const it of sorted) {
    const last = lines.at(-1);
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tolerance) last.items.push(it);
    else lines.push({ page: it.page, y: it.y, x: it.x, text: '', items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.x = l.items[0]!.x;
    l.text = l.items
      .map((i) => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return lines;
}

/** Verbindet Zeilen eines Fließtexts und entfernt Silbentrennungen ("Ver-" + "gütungen"). */
export function joinWrapped(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (!out) out = p;
    else if (
      /[a-zäöüß]-$/.test(out) &&
      /^[a-zäöüß]/.test(p) &&
      !/^(und|oder|bzw\.?|sowie)\b/.test(p)
    )
      out = out.slice(0, -1) + p;
    else out += ' ' + p;
  }
  return out.replace(/\s+/g, ' ').trim();
}
