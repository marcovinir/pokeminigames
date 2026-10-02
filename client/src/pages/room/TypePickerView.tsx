import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { useState } from "react";
import { Timer } from "../../components/Timer";
import { TYPE_CHOICE_MS } from "../../game/durations";
import { TYPE_LABELS } from "../../i18n/es";
import { TYPE_STYLES } from "../../theme/type-styles";
import { LeaveButton } from "./LeaveButton";
import { useRoom } from "./use-room";

/** Modo elegido: cada jugador toca un tipo; con los dos se forma el par de la ronda. */
export function TypePickerView() {
  const { view, client } = useRoom();
  const [chosen, setChosen] = useState<TypeName | null>(null);
  const round = view.round;
  const locked = round?.typeChosen ?? false;
  // Tras tocar un tipo no se puede cambiar mientras llega la confirmación: el servidor se queda con la primera
  // elección. Si lo rechaza (hay un error a la vista), se puede volver a elegir.
  const waiting = chosen !== null && !view.lastError;

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Elige un tipo</h1>
        <p className="mt-1 text-sm text-muted">Tú y tu rival eligen uno; con los dos se forma el par de la ronda {round?.number}.</p>
      </div>
      <Timer deadline={round?.deadline ?? null} offset={view.clockOffset} totalMs={TYPE_CHOICE_MS} label="Tiempo para elegir" />

      <div role="group" aria-label="Tipos" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {TYPE_NAMES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={locked || waiting}
            aria-pressed={chosen === type}
            onClick={() => {
              setChosen(type);
              client.chooseType(type);
            }}
            style={TYPE_STYLES[type]}
            className={`rounded-ui px-2 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed ${
              locked && chosen !== type ? "opacity-40" : ""
            } ${chosen === type ? "outline-4 outline-offset-2 outline-fg" : ""}`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <p role="status" className="text-center text-sm text-muted">
        {locked
          ? chosen
            ? `Elegiste ${TYPE_LABELS[chosen]}. Esperando a tu oponente…`
            : "Ya elegiste tu tipo. Esperando a tu oponente…"
          : "Toca el tipo que quieras."}
      </p>
      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}
