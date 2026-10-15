# crime-stats

Visualisierung der Polizeilichen Kriminalstatistik (PKS) des BKA.

## Struktur

```
data/raw/<jahrgang>/   BKA-Originale (PDF/XLSX), Ordner = URL-Pfad der BKA-Seite; inventory.json = alle Seiten + Download-Links
data/processed/        generierte Datasets (Parquet + Metadaten-JSON) für die App – nicht versioniert, per `npm run etl` erzeugen
shared/                gemeinsames Datenmodell (TypeScript)
etl/                   Crawler, Downloader und XLSX-Parser (Node + TypeScript)
app/                   Angular-App (Explorer: Delikte, Kennzahl, Zeitraum wählen → Diagramm + Tabelle)
```

## Befehle

```bash
npm install
npm start                                    # App unter http://localhost:4200 (kopiert vorher data/processed → app/public/data)
npm run build                                # Produktions-Build nach app/dist/app
npm test -w app -- --watch=false             # Unit-Tests der App
npm run crawl -- --year 2024                 # BKA-Seiten crawlen und PDF/XLSX laden (vorhandene Dateien werden übersprungen)
npm run crawl -- --year 2024 --skip-crawl    # nur fehlende Dateien laut inventory.json laden
npm run crawl -- --year 2023 --nur "^(LA-F-02|ST-F-01)"   # nur bestimmte Dateien (Muster auf den Dateinamen)
npm run crawl -- --year 2023 --ohne-download # nur Inventur erstellen
npm run etl -- --jahrgang 2024               # data/raw → data/processed (Länder/Städte aus allen Jahrgängen unter data/raw)
npm run typecheck
npx tsx etl/src/inspect.ts <datei.xlsx> 20   # Struktur einer XLSX-Datei ansehen
npm run deploy                               # bauen und auf GitHub Pages (Branch gh-pages) veröffentlichen
npm run deploy -- --nur-build                # nur bauen, mit 404.html und .nojekyll
```

## Veröffentlichen auf GitHub Pages

1. Repository auf GitHub anlegen und `git remote add origin https://github.com/<name>/<repo>.git`, dann `git push -u origin main`.
2. Daten lokal erzeugen (`npm run crawl`, `npm run etl`) – sie sind nicht versioniert und werden mit dem Build veröffentlicht.
3. `npm run deploy`: baut mit Basis-Pfad `/<repo>/` (bei `<name>.github.io` mit `/`, sonst `--base /pfad/`) und
   ersetzt den Branch `gh-pages` durch einen einzigen Commit mit dem Build.
4. Einmalig auf GitHub: Settings → Pages → „Deploy from a branch“, Branch `gh-pages`, Ordner `/ (root)`.
5. Eigene Domain (optional): Datei `CNAME` mit dem Domainnamen im Projektordner anlegen, DNS beim Registrar auf
   GitHub Pages zeigen lassen und `npm run deploy` ausführen – der Basis-Pfad ist dann `/`.

GitHub Pages unterstützt HTTP-Range-Requests, die die App zum Lesen der Parquet-Dateien braucht, und cacht Dateien
rund zehn Minuten. Deshalb tragen alle Datendateien außer `index.json` einen Inhalts-Hash im Namen, und die App lädt
`index.json` immer frisch. `404.html` (Kopie von `index.html`) fängt unbekannte Pfade ab.

## Datenmodell

Jede BKA-Tabelle wird zu einem Dataset (`shared/src/model.ts`): `meta.spalten` = Dimensionen (`jahr`, `region`,
`schluessel`, …) gefolgt von Wertespalten (`faelle`, `hz`, `tv|14-16`, …). Je Dataset entstehen `<id>.<hash>.parquet`
(Zeilen, nach Straftatenschlüssel sortiert, zstd) und `<id>.<hash>.json` (Metadaten inkl. Zeilenbereich je Schlüssel).
`straftaten.<hash>.json` enthält den Straftatenkatalog mit Hierarchie (`parent`) und Bezeichnungsverlauf (`namensverlauf`).
`meta.hinweise` beschreibt methodische Brüche (z. B. Tatverdächtigenzählung ab 2009, Zensus-Basis der HZ).

`bevoelkerung.json` enthält die Wohnbevölkerung (31.12. des Vorjahres) aus den BKA-Tabellen `02-BU-BV` (Bund ab 2000
nach Alter und Geschlecht), `03-LA-BV` (Länder nach Staatsangehörigkeit), `04-KR-BV` und `05-ST-BV` (Kreise, Städte
ab 2019). Für 2024 gilt wie bei den älteren Jahren die Zensus-2011-Fortschreibung. Die ETL prüft: Fälle ÷ Bevölkerung
trifft die amtliche HZ (Ausnahme DE 2013, 1,8 %). In `05-ST-BV` 2024 sind die Gemeindeschlüssel ab Cottbus um eine
Zeile verrutscht; Städte werden deshalb über den Namen zugeordnet.

### Datasets

| ID | Quelle | Inhalt |
|---|---|---|
| `bund-faelle-zeitreihe` | `T01-ZR-Bund-Fälle`, je Jahrgang `LA-F-02`, `ST-F-01` | Deutschland ab 1987, dazu 16 Länder, 84 Städte (ab 100.000 Einwohnern, Landeshauptstädte) und rund 400 Kreise (`KR-F-01`, ausgewählte Straftaten) aus den Jahrgangstabellen: Fälle, HZ, Versuche, Aufklärung, Tatverdächtige. Dimension `region` (`DE`, Länderkennziffer, Gemeindeschlüssel) |
| `bund-tatverdaechtige-zeitreihe` | `ZR-TV-01…09`, `ZR-BZ-01…03` | Bund, 1987–2024: Tatverdächtige nach Geschlecht, Staatsangehörigkeit und 20 Altersgruppen; TVBZ ab 2009; Länder und Städte aus `LA-TV`/`ST-TV` (nur Anzahl) |
| `bund-opfer-zeitreihe` | `ZR-O-01…03`, `ZR-BZ-04…06` | Bund, 2000–2024: Opfer nach Alter, Geschlecht und Versuch/Vollendung; OGZ; Länder und Städte aus `LA-O-01`/`ST-O-01` (nur Anzahl) |

## App

Die gesamte Auswahl steht in der URL und ist damit als Link teilbar, z. B.
`/?ds=bund-tatverdaechtige-zeitreihe&d=892000&k=tv&geschlecht=weiblich&vgl=alter&von=2000`
(`ds` = Bereich, `d` = Straftatenschlüssel, `k` = Kennzahl, Dimensionsfilter unter ihrer ID,
`vgl` = Dimension für den Linienvergleich, `vglw` = gewählte Vergleichswerte (z. B. Regionen), `modus` = `je100k` (je 100.000 Einwohner), `anteil` (% der Bevölkerung) oder `index` (erstes Jahr = 100)).

Die Raten je Einwohner sind eigene Berechnungen (Anzahl ÷ Bevölkerung der Region bzw. Gruppe) und nur für Anzahlen
wählbar; für Nichtdeutsche gibt es keine (Tatverdächtige ohne Wohnsitz in Deutschland sind nicht in der Bevölkerung).

Die App liest Daten nur über `PksDataSource` (`app/src/app/core/services/pks-data.ts`), ohne Backend: Sie lädt die
Metadaten und liest aus den Parquet-Dateien per HTTP-Range-Request (`hyparquet`) nur die Zeilen der gewählten Delikte
und nur die Spalten der aktuellen Ansicht (typisch 5–100 KB je Auswahl). Der statische Host muss Range-Requests
unterstützen (GitHub Pages, Netlify, Cloudflare Pages u. a. tun das). Für frei formulierte Auswertungen könnte später
DuckDB-WASM dieselben Parquet-Dateien lesen.
