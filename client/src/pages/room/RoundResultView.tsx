import type { RoundPlayerResult, Seat } from "@pokemon-minigames/shared";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { PokemonCard } from "../../components/PokemonCard";
import { rise } from "../../components/rise";
import { TypeChip } from "../../components/TypeChip";
import { secondsLeft, useCountdown } from "../../game/clock";
import { RESULT_PAUSE_MS } from "../../game/durations";
import { PICK_RESULT_LABELS } from "../../i18n/es";
import { useRoom } from "./use-room";

function ResultCard({ title, result, index, guest = false }: { title: string; result: RoundPlayerResult; index: number; guest?: boolean }) {
  const won = result.result === "VALID";
  return (
    <Card as="section" aria-label={`Resultado de ${title}`} data-result={result.result} style={rise(index)} className={`animate-rise p-5 ${won ? "border-success" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate font-display text-lg font-semibold">{title}</h2>
          {guest ? <GuestTag /> : null}
        </div>
        <Badge tone={won ? "success" : "danger"}>{PICK_RESULT_LABELS[result.result]}</Badge>
      </div>
      {result.text ? <p className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">Escribió: «{result.text}»</p> : null}
      <div className="mt-4">
        {result.pokemon ? (
          <PokemonCard pokemon={result.pokemon} size="lg" eager />
        ) : (
          <div data-empty-art aria-hidden="true" className="flex h-64 items-center justify-center rounded-card bg-surface-2 font-display text-6xl text-muted">
            ?
          </div>
        )}
      </div>
      <p className="mt-4 text-sm">
        Total: <span className="font-num font-semibold tabular-nums">{result.totalStats}</span> · {result.teamSize} Pokémon
      </p>
    </Card>
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
  const remaining = result.nextRoundAt === null ? 0 : Math.min(100, (untilNext / RESULT_PAUSE_MS) * 100);

  return (
    <section className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Resultado de la ronda {result.round}</h1>
        <div className="mt-3 flex flex-wrap justify-center gap-3" aria-label="Par de tipos">
          <TypeChip type={result.type1} size="lg" />
          <TypeChip type={result.type2} size="lg" />
        </div>
      </div>

      {/* Un resumen breve para lectores de pantalla; lo visual es el detalle de cada tarjeta. */}
      <p role="status" className="sr-only">
        Ronda {result.round}. Tú: {PICK_RESULT_LABELS[mine.result]}
        {mine.pokemon ? `, ${mine.pokemon.names.es}` : ""}. {opponent?.username ?? "Rival"}: {PICK_RESULT_LABELS[theirs.result]}
        {theirs.pokemon ? `, ${theirs.pokemon.names.es}` : ""}.
        {result.example ? ` Un Pokémon que servía: ${result.example.names.es}.` : ""}
      </p>

      {/* Si nadie o solo una persona acertó, el servidor muestra uno de los que servían para este par. Va arriba (compacto):
          la pausa dura 6 s y debajo de las dos tarjetas de resultado, en un teléfono, no se llegaría a ver. */}
      {result.example ? (
        <section
          aria-label={`Un Pokémon que servía: ${result.example.names.es}`}
          style={rise(2)}
          className="animate-rise mx-auto w-full max-w-md"
        >
          <h2 className="mb-1.5 text-center font-display text-base font-semibold">Un Pokémon que servía</h2>
          <PokemonCard pokemon={result.example} eager />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ResultCard title="Tú" result={mine} index={0} />
        <ResultCard title={opponent?.username ?? "Tu rival"} result={theirs} index={1} guest={opponent?.guest === true} />
      </div>

      <div className="mx-auto w-64 text-center">
        <p className="text-sm text-muted">
          {result.nextRoundAt === null ? "Calculando el resultado final…" : `Siguiente ronda en ${secondsLeft(untilNext)} s`}
        </p>
        <div data-next-bar aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div style={{ width: `${remaining}%` }} className="h-full rounded-pill bg-accent transition-[width] duration-300 ease-linear" />
        </div>
      </div>
    </section>
  );
}
