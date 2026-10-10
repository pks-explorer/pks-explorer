/** Hinweise zur Vergleichbarkeit, die in mehreren BKA-Zeitreihen gelten. */
import type { Hinweis } from '@crime-stats/shared';

export const HINWEIS_GEBIETSSTAND: Hinweis = {
  text: '1987–1990: nur früheres Bundesgebiet. 1991–1992: Erfassung in den neuen Ländern noch unvollständig, Vergleiche erst ab 1993 sinnvoll.',
  bisJahr: 1992,
  abJahr: 1993,
  bruch: true,
};

export const hinweisTatverdaechtigenzaehlung = (kennzahlen: string[]): Hinweis => ({
  text: 'Ab 2009 „echte“ Tatverdächtigenzählung (jede Person je Delikt und Jahr nur einmal) – nicht mit den Vorjahren vergleichbar.',
  kennzahlen,
  abJahr: 2009,
  bruch: true,
});

/** Belastungs-/Häufigkeitszahlen: Bevölkerungsbasis wechselt 2013 auf den Zensus 2011. */
export const hinweisZensus = (kennzahl: string, name: string): Hinweis => ({
  text: `${name} ab 2013 auf Basis Zensus 2011. 2024 ebenfalls auf Basis Zensus 2011 (vergleichbar mit 2013–2023); das BKA weist zusätzlich Werte auf Basis Zensus 2022 aus.`,
  kennzahlen: [kennzahl],
  abJahr: 2013,
  bruch: true,
});

export const HINWEIS_REGISTRIERTE_KRIMINALITAET: Hinweis = {
  text: 'Änderungen der registrierten Kriminalität entsprechen nicht immer der tatsächlichen Entwicklung (Anzeigeverhalten, Kontrollintensität, Rechtsänderungen, Erfassungsregeln).',
};
