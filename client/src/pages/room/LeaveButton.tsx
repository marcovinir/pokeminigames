import { useState } from "react";
import { Button } from "../../components/Button";

/** Abandonar una partida en curso pide una segunda confirmación: hacerlo por error cuesta la partida. */
export function LeaveButton({ onLeave }: { onLeave(): void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Abandonar partida
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Confirmar abandono" className="flex flex-wrap items-center gap-2 text-sm">
      <span>Si abandonas, pierdes la partida.</span>
      <Button variant="primary" onClick={onLeave}>
        Sí, abandonar
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Seguir jugando
      </Button>
    </div>
  );
}
