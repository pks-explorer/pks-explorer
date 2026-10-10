import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auswahl } from './auswahl';

describe('Auswahl', () => {
  let auswahl: Auswahl;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    auswahl = TestBed.inject(Auswahl);
  });

  it('nutzt Standardwerte ohne Query-Parameter', () => {
    expect(auswahl.delikte()).toEqual(['------']);
    expect(auswahl.kennzahl()).toBe('faelle');
    expect(auswahl.darstellung()).toBe('absolut');
  });

  it('liest die Auswahl aus der URL', async () => {
    await router.navigateByUrl('/?d=892000,897000&k=hz&von=2000&bis=2020&modus=index');
    expect(auswahl.delikte()).toEqual(['892000', '897000']);
    expect(auswahl.kennzahl()).toBe('hz');
    expect([auswahl.von(), auswahl.bis()]).toEqual([2000, 2020]);
    expect(auswahl.darstellung()).toBe('index');
  });

  it('Farben bleiben beim Delikt, wenn ein anderes entfernt wird', async () => {
    await router.navigateByUrl('/?d=a,b,c');
    expect([...auswahl.farbSlots()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    await router.navigateByUrl('/?d=a,c');
    expect([...auswahl.farbSlots()]).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
    await router.navigateByUrl('/?d=a,c,d');
    expect(auswahl.farbSlots().get('d')).toBe(1); // niedrigster freier Slot
  });
});
