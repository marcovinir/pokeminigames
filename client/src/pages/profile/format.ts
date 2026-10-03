const NO_DATA = "—";
const ONE_DECIMAL = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

/** "60 %"; sin datos, un guion. `rate` va de 0 a 1. */
export function formatPercent(rate: number | null): string {
  return rate === null ? NO_DATA : `${Math.round(rate * 100)} %`;
}

/** Siempre con un decimal y coma: "512,5". */
export function formatPower(power: number | null): string {
  return power === null ? NO_DATA : ONE_DECIMAL.format(power);
}

export function formatScore(score: number | null): string {
  return score === null ? NO_DATA : String(score);
}

export function winsLabel(wins: number): string {
  return wins === 1 ? "Ganado 1 vez" : `Ganado ${wins} veces`;
}

/** "30 sept 2026". */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}
