import { Card } from "../components/Card";
import { LogoMark } from "../components/Logo";
import { TypeChip } from "../components/TypeChip";

const STEPS = [
  "Aparece un par de tipos, por ejemplo veneno y acero.",
  "Tienes 15 segundos para nombrar un Pokémon que tenga los dos.",
  "Gana quien sume más stats al final de la partida.",
] as const;

/**
 * La parte de la izquierda de las pantallas de acceso: el lema, cómo se juega y una tarjeta de ejemplo. En pantallas
 * estrechas solo queda el lema, para que el formulario esté a la vista.
 */
export function AuthHero() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <LogoMark size={64} className="animate-beat" />
        <p className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          Nombra el Pokémon, <span className="text-accent">gana más stats.</span>
        </p>
      </div>

      <div className="hidden md:block">
        <ol aria-label="Cómo se juega" role="list" className="flex flex-col gap-3">
          {STEPS.map((text, index) => (
            <li key={text} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-semibold text-accent-fg"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div data-preview aria-hidden="true" className="hidden md:block">
        <Card tone="raised" className="max-w-sm p-5 md:-rotate-1">
          <p className="text-xs font-semibold text-muted">Ronda 2 de 3</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TypeChip type="poison" size="lg" />
            <span className="font-display text-xl font-semibold text-muted">+</span>
            <TypeChip type="steel" size="lg" />
          </div>
          <div className="framed mt-4 rounded-ui bg-surface-2 px-4 py-3 text-muted">Escribe un Pokémon…</div>
        </Card>
      </div>
    </div>
  );
}
