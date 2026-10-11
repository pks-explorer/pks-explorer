import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auswahl } from './auswahl';

describe('Auswahl', () => {
  let auswahl: Auswahl;
  let router: Router;
  const warten = () => new Promise((r) => setTimeout(r));

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    auswahl = TestBed.inject(Auswahl);
  });

  it('nutzt Standardwerte ohne Query-Parameter', () => {
    expect(auswahl.datasetId()).toBe('bund-faelle-zeitreihe');
    expect(auswahl.delikte()).toEqual(['------']);
    expect(auswahl.kennzahl()).toBeNull();
    expect(auswahl.darstellung()).toBe('absolut');
    expect(auswahl.filter()).toEqual({});
  });

  it('liest Auswahl und Dimensionsfilter aus der URL', async () => {
    await router.navigateByUrl(
      '/?ds=bund-tatverdaechtige-zeitreihe&d=892000,897000&k=tvbz&von=2009&modus=index&geschlecht=weiblich&alter=14-16&vgl=staatsangehoerigkeit',
    );
    expect(auswahl.datasetId()).toBe('bund-tatverdaechtige-zeitreihe');
    expect(auswahl.delikte()).toEqual(['892000', '897000']);
    expect(auswahl.kennzahl()).toBe('tvbz');
    expect(auswahl.von()).toBe(2009);
    expect(auswahl.filter()).toEqual({ geschlecht: 'weiblich', alter: '14-16' });
    expect(auswahl.vergleich()).toBe('staatsangehoerigkeit');
  });

  it('setzt beim Bereichswechsel Kennzahl, Filter und Vergleich zurück, behält aber die Delikte', async () => {
    await router.navigateByUrl('/?d=892000&k=hz&geschlecht=weiblich&vgl=alter');
    auswahl.setDataset('bund-opfer-zeitreihe');
    await warten();
    expect(auswahl.datasetId()).toBe('bund-opfer-zeitreihe');
    expect(auswahl.delikte()).toEqual(['892000']);
    expect(auswahl.kennzahl()).toBeNull();
    expect(auswahl.filter()).toEqual({});
    expect(auswahl.vergleich()).toBeNull();
  });
});
