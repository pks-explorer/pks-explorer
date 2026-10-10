/** Hilfsskript: Blätter und erste Zeilen einer XLSX-Datei ausgeben.  npx tsx src/inspect.ts <datei> [zeilen] */
import ExcelJS from 'exceljs';

const [file, rows = '15'] = process.argv.slice(2);
if (!file) throw new Error('Datei angeben');
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
for (const ws of wb.worksheets) {
  console.log(`=== Blatt "${ws.name}" (${ws.rowCount} Zeilen x ${ws.columnCount} Spalten)`);
  for (let r = 1; r <= Math.min(ws.rowCount, Number(rows)); r++) {
    const vals = (ws.getRow(r).values as unknown[]).slice(1).map((v) =>
      v && typeof v === 'object' && 'richText' in v ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('') : v,
    );
    console.log(r, JSON.stringify(vals));
  }
}
