import ExcelJS from 'exceljs';

export async function readWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Zellwert als einfacher Wert (RichText, Formelergebnisse und Hyperlinks aufgelöst). */
export function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
  if ('text' in v) return String(v.text);
  return null;
}

/** Alle Zellwerte einer Zeile (0-basiert). */
export function rowValues(
  ws: ExcelJS.Worksheet,
  r: number,
  cols = ws.columnCount,
): (string | number | null)[] {
  const row = ws.getRow(r);
  return Array.from({ length: cols }, (_, c) => cellValue(row.getCell(c + 1).value));
}

/** Zahl oder null; BKA-Platzhalter wie "-", "." oder Text werden zu null. */
export function toNumber(v: string | number | null): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    let s = v.trim();
    // deutsches Format "1.234,5" → "1234.5"
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }
  return null;
}

export const round = (v: number | null, digits: number) =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim();
