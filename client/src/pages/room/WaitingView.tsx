import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
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
    <section className="framed mx-auto max-w-md rounded-card bg-surface p-6 text-center">
      <h1 className="text-xl font-medium">Sala de espera</h1>
      <p className="mt-3 text-sm text-muted">Comparte este código con tu oponente:</p>
      <p aria-label="Código de la sala" className="my-2 font-num text-4xl font-medium tracking-widest">
        {code}
      </p>
      <CopyCodeButton code={code} />

      <ul className="mt-5 flex flex-col gap-1 text-sm" aria-label="Jugadores">
        {view.players.map((player) => (
          <li key={player.seat}>
            {player.username} {player.connected ? "" : <span className="text-muted">(sin conectar)</span>}
          </li>
        ))}
      </ul>
      <p role="status" className="mt-4 text-sm text-muted">
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
    </section>
  );
}
