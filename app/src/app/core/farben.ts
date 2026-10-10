/**
 * Ordnet Linien dauerhaft Farbslots zu: Die Farbe gehört zur Linie, nicht zu ihrer Position.
 * Wird eine Linie entfernt, behalten die übrigen ihre Farbe; neue Linien bekommen den niedrigsten freien Slot.
 */
export class StabileSlots {
  private slots = new Map<string, number>();

  zuordnen(ids: readonly string[]): ReadonlyMap<string, number> {
    const next = new Map<string, number>();
    for (const id of ids) {
      const s = this.slots.get(id);
      if (s !== undefined) next.set(id, s);
    }
    for (const id of ids) {
      if (next.has(id)) continue;
      const belegt = new Set(next.values());
      let s = 0;
      while (belegt.has(s)) s++;
      next.set(id, s);
    }
    this.slots = next;
    return next;
  }
}
