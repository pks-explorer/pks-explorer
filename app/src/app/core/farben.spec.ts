import { StabileSlots } from './farben';

describe('StabileSlots', () => {
  it('Farben bleiben bei der Linie, wenn eine andere entfernt wird', () => {
    const s = new StabileSlots();
    expect([...s.zuordnen(['a', 'b', 'c'])]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect([...s.zuordnen(['a', 'c'])]).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
    expect(s.zuordnen(['a', 'c', 'd']).get('d')).toBe(1); // niedrigster freier Slot
  });
});
