# crime-stats

Visualisierung der Polizeilichen Kriminalstatistik (PKS) des BKA.

## Struktur

```
data/raw/<jahrgang>/   BKA-Originale (PDF/XLSX), Ordner = URL-Pfad der BKA-Seite; inventory.json = alle Seiten + Download-Links
data/processed/        generierte Datasets (JSON) für die App
shared/                gemeinsames Datenmodell (TypeScript)
etl/                   Crawler, Downloader und XLSX-Parser (Node + TypeScript)
app/                   Angular-App (folgt)
```

## Befehle

```bash
npm install
npm run crawl -- --year 2024                 # BKA-Seiten crawlen und PDF/XLSX laden (vorhandene Dateien werden übersprungen)
npm run crawl -- --year 2024 --skip-crawl    # nur fehlende Dateien laut inventory.json laden
npm run etl -- --jahrgang 2024               # data/raw → data/processed
npm run typecheck
npx tsx etl/src/inspect.ts <datei.xlsx> 20   # Struktur einer XLSX-Datei ansehen
```

## Datenmodell

Jede BKA-Tabelle wird zu einem Dataset (`shared/src/model.ts`): `meta.spalten` = Dimensionen (`jahr`, `region`,
`schluessel`, …) gefolgt von Kennzahlen (`faelle`, `hz`, `aq`, …); `zeilen` sind Arrays in dieser Reihenfolge.
`straftaten.json` enthält den Straftatenkatalog mit Hierarchie (`parent`) und Bezeichnungsverlauf (`namensverlauf`).
`meta.hinweise` beschreibt methodische Brüche (z. B. Tatverdächtigenzählung ab 2009, Zensus-Basis der HZ).

### Datasets

| ID | Quelle | Inhalt |
|---|---|---|
| `bund-faelle-zeitreihe` | `T01-ZR-Bund-Fälle` | Bund, 1987–2024, je Straftatenschlüssel: Fälle, HZ, Versuche, Schusswaffe, Aufklärung, Tatverdächtige |
