import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useRoom } from "./use-room";

/** Copia el código de la sala al portapapeles; si el navegador no lo permite, lo dice. */
function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Button onClick={() => void copy()}>
      {state === "copied" ? "Código copiado" : state === "failed" ? "No se pudo copiar" : "Copiar código"}
    </Button>
  );
}

export function WaitingView() {
  const { view, client, opponent } = useRoom();
  const navigate = useNavigate();
  const code = view.code ?? "";

  return (
    <Card as="section" tone="raised" className="mx-auto max-w-md p-8 text-center">
      <h1 className="font-display text-2xl font-semibold">Sala de espera</h1>
      <p className="mt-3 text-sm text-muted">Comparte este código con tu oponente:</p>
      <p aria-label="Código de la sala" className="my-4 flex justify-center gap-2">
        {[...code].map((letter, index) => (
          <span
            key={index}
            style={{ "--i": index } as React.CSSProperties}
            className="animate-rise inline-flex h-14 w-11 items-center justify-center rounded-ui bg-surface-2 font-num text-3xl font-semibold"
          >
            {letter}
          </span>
        ))}
      </p>
      <CopyCodeButton code={code} />

      <ul className="mt-7 flex justify-center gap-8" aria-label="Jugadores">
        {view.players.map((player) => (
          <li key={player.seat} className="flex flex-col items-center gap-2">
            <Avatar name={player.username} size="lg" />
            <span className="text-sm font-semibold">{player.username}</span>
            {player.connected ? null : <span className="text-xs text-muted">(sin conectar)</span>}
          </li>
        ))}
        {view.players.length < 2 ? (
          <li data-empty-seat aria-hidden="true" className="flex flex-col items-center gap-2">
            <span className="animate-beat inline-flex size-14 items-center justify-center rounded-pill border-2 border-dashed border-line font-display text-2xl text-muted">
              ?
            </span>
            <span className="text-sm text-muted">Tu rival</span>
          </li>
        ) : null}
      </ul>
      <p role="status" className="mt-5 text-sm text-muted">
        {opponent ? "Tu oponente ya se unió. Esperando a que se conecte…" : "Esperando a tu oponente…"}
      </p>

      <div className="mt-5">
        <Button
          variant="ghost"
          onClick={() => {
            client.leave();
            navigate("/");
          }}
        >
          {opponent ? "Salir de la sala" : "Cancelar sala"}
        </Button>
      </div>
    </Card>
  );
}
