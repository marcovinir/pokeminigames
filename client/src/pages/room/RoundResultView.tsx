import type { RoundPlayerResult, Seat } from "@pokemon-minigames/shared";
import { PokemonCard } from "../../components/PokemonCard";
import { TypeChip } from "../../components/TypeChip";
import { secondsLeft, useCountdown } from "../../game/clock";
import { PICK_RESULT_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

function ResultCard({ title, result }: { title: string; result: RoundPlayerResult }) {
  const won = result.result === "VALID";
  return (
    <section aria-label={`Resultado de ${title}`} className="framed rounded-card bg-surface p-4">
      <h2 className="text-sm text-muted">{title}</h2>
      <p className={`mt-1 font-medium ${won ? "text-success" : "text-danger"}`}>{PICK_RESULT_LABELS[result.result]}</p>
      {result.text ? <p className="mt-1 text-sm text-muted">Escribió: «{result.text}»</p> : null}
      <div className="mt-3">{result.pokemon ? <PokemonCard pokemon={result.pokemon} /> : null}</div>
      <p className="mt-3 text-sm">
        Total: <span className="font-num font-medium tabular-nums">{result.totalStats}</span> · {result.teamSize} Pokémon
      </p>
    </section>
  );
}

export function RoundResultView() {
  const { view, opponent } = useRoom();
  const result = view.lastResult;
  const untilNext = useCountdown(result?.nextRoundAt ?? null, view.clockOffset);

  if (!result || view.mySeat === null) {
    return (
      <p role="status" className="text-center text-muted">
        Resultado de la ronda…
      </p>
    );
  }

  const mine = result.results[view.mySeat];
  const rivalSeat: Seat = view.mySeat === 1 ? 2 : 1;
  const theirs = result.results[rivalSeat];

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Resultado de la ronda {result.round}</h1>
        <div className="mt-2 flex justify-center gap-2" aria-label="Par de tipos">
          <TypeChip type={result.type1} />
          <TypeChip type={result.type2} />
        </div>
      </div>

      {/* Un resumen breve para lectores de pantalla; lo visual es el detalle de cada tarjeta. */}
      <p role="status" className="sr-only">
        Ronda {result.round}. Tú: {PICK_RESULT_LABELS[mine.result]}
        {mine.pokemon ? `, ${mine.pokemon.names.es}` : ""}. {opponent?.username ?? "Rival"}: {PICK_RESULT_LABELS[theirs.result]}
        {theirs.pokemon ? `, ${theirs.pokemon.names.es}` : ""}.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ResultCard title="Tú" result={mine} />
        <ResultCard title={opponent?.username ?? "Tu rival"} result={theirs} />
      </div>

      <p className="text-center text-sm text-muted">
        {result.nextRoundAt === null
          ? "Calculando el resultado final…"
          : `Siguiente ronda en ${secondsLeft(untilNext)} s`}
      </p>
    </section>
  );
}
