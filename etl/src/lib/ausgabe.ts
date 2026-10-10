/** Schreibt Datasets, Straftatenkatalog und Index nach data/processed/. */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  partitionsDatei,
  type DataIndex,
  type Dataset,
  type DatasetIndexEintrag,
  type DatasetPartition,
  type Straftat,
} from '@crime-stats/shared';

export class Ausgabe {
  private readonly eintraege: DatasetIndexEintrag[] = [];

  constructor(
    private readonly dir: string,
    private readonly jahrgang: number,
  ) {}

  /**
   * Schreibt ein Dataset als eine Datei oder – bei `partitioniert` – aufgeteilt nach Straftatenschlüssel:
   * Metadaten in <id>.json, Zeilen je Schlüssel in <id>/<schluessel>.json. Die App lädt dann nur die
   * gewählten Delikte.
   */
  async dataset(ds: Dataset, { partitioniert = false } = {}): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const datei = `${ds.meta.id}.json`;
    if (partitioniert) {
      ds.meta.partitionen = await this.partitionen(ds);
      await writeFile(path.join(this.dir, datei), JSON.stringify({ meta: ds.meta, zeilen: [] }));
    } else {
      await writeFile(path.join(this.dir, datei), JSON.stringify(ds));
    }

    const { id, titel, bereich, ebene, jahre, kennzahlen } = ds.meta;
    this.eintraege.push({ id, titel, bereich, ebene, datei, jahre, kennzahlen });
    const teile = ds.meta.partitionen
      ? `, ${ds.meta.partitionen.schluessel.length} Partitionen`
      : '';
    console.log(`  → ${datei}: ${ds.zeilen.length} Zeilen, ${jahre[0]}–${jahre.at(-1)}${teile}`);
  }

  private async partitionen(ds: Dataset) {
    const iKey = ds.meta.spalten.indexOf('schluessel');
    const teile = new Map<string, Dataset['zeilen']>();
    for (const z of ds.zeilen) {
      const k = z[iKey] as string;
      const liste = teile.get(k) ?? [];
      liste.push(z);
      teile.set(k, liste);
    }
    const verzeichnis = ds.meta.id;
    const ziel = path.join(this.dir, verzeichnis);
    await rm(ziel, { recursive: true, force: true }); // veraltete Partitionen entfernen
    await mkdir(ziel, { recursive: true });
    for (const [k, zeilen] of teile) {
      const teil: DatasetPartition = { zeilen };
      await writeFile(path.join(ziel, partitionsDatei(k)), JSON.stringify(teil));
    }
    return { nach: 'schluessel' as const, verzeichnis, schluessel: [...teile.keys()] };
  }

  /** Schreibt Straftatenkatalog und index.json; als Letztes aufrufen. */
  async abschliessen(straftaten: Straftat[]): Promise<void> {
    const index: DataIndex = {
      jahrgang: this.jahrgang,
      datasets: this.eintraege,
      straftaten: 'straftaten.json',
    };
    await writeFile(path.join(this.dir, index.straftaten), JSON.stringify(straftaten, null, 1));
    await writeFile(path.join(this.dir, 'index.json'), JSON.stringify(index, null, 2));
  }
}
