import type { RoomConfig, TypeMode } from "@pokemon-minigames/shared";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import type { CurrentRoom } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { useServices, useSession } from "../services";
import {
  type CreateRoomForm,
  DEFAULT_FORM,
  LENGTH_LABELS,
  type LengthKind,
  buildRequest,
  formFromConfig,
} from "./room-form";

const shownError = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));

const ICON = "size-5";
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true" focusable="false" {...STROKE}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EnterIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true" focusable="false" {...STROKE}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" focusable="false" {...STROKE}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg data-check viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-accent opacity-0 transition-opacity duration-(--dur-fast)" aria-hidden="true" focusable="false" {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.6" />
    </svg>
  );
}

/** El título de una tarjeta del lobby, con su icono en un círculo de color. */
function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-pill bg-accent text-accent-fg">
        {icon}
      </span>
      <h2 className="font-display text-xl font-semibold">{children}</h2>
    </div>
  );
}

/** Si el usuario ya está en una partida (o dejó una sala abierta), ofrece volver a ella. */
function ResumeBanner() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [room, setRoom] = useState<CurrentRoom | null>(null);

  useEffect(() => {
    let active = true;
    endpoints.rooms.current().then(
      (current) => active && setRoom(current),
      () => {}, // No poder consultarlo no impide usar el lobby.
    );
    return () => {
      active = false;
    };
  }, [endpoints]);

  if (!room) return null;
  return (
    <Notice
      tone="success"
      action={
        <Button variant="primary" onClick={() => navigate(`/sala/${room.code}`)}>
          Volver a tu partida
        </Button>
      }
    >
      <span>Tienes una partida en curso (sala {room.code}).</span>
    </Notice>
  );
}

const TYPE_MODE_OPTIONS: { value: TypeMode; label: string; hint: string }[] = [
  { value: "random", label: "Aleatorio", hint: "El servidor sortea el par de tipos de cada ronda." },
  { value: "chosen", label: "Elegido", hint: "Cada jugador elige un tipo y juntos forman el par." },
];

function CreateRoomCard({ initial }: { initial?: RoomConfig }) {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateRoomForm>(initial ? formFromConfig(initial) : DEFAULT_FORM);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const built = buildRequest(form);
    if (!built.ok) {
      setFieldError({ field: built.field, message: built.error });
      return;
    }
    setFieldError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      const { code } = await endpoints.rooms.create(built.request);
      navigate(`/sala/${code}`);
    } catch (error) {
      setFormError(shownError(error));
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" className="p-6">
      <CardTitle icon={<PlusIcon />}>Crear sala</CardTitle>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">Modo de tipos</legend>
          {TYPE_MODE_OPTIONS.map((option) => (
            <label key={option.value} className="block cursor-pointer">
              <input
                type="radio"
                name="typeMode"
                value={option.value}
                checked={form.typeMode === option.value}
                onChange={() => setForm({ ...form, typeMode: option.value })}
                className="peer sr-only"
              />
              <span className="framed-field flex items-start gap-3 rounded-ui bg-surface px-4 py-3 transition-shadow duration-(--dur-fast) peer-checked:border-accent peer-checked:shadow-[0_0_0_3px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-checked:[&_[data-check]]:opacity-100">
                <span className="min-w-0 flex-1">
                  <span className="font-display font-semibold">{option.label}</span>
                  <span className="block text-sm text-muted">{option.hint}</span>
                </span>
                <CheckIcon />
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="length" className="mb-1.5 block text-sm font-semibold">
            Largo de la partida
          </label>
          <div className="relative">
            <select
              id="length"
              value={form.lengthKind}
              onChange={(event) => {
                setForm({ ...form, lengthKind: event.target.value as LengthKind });
                setFieldError(null);
              }}
              className="framed-field w-full appearance-none rounded-ui bg-surface px-4 py-3 pr-10 text-fg"
            >
              {(Object.keys(LENGTH_LABELS) as LengthKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {LENGTH_LABELS[kind]}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </div>
        </div>

        {form.lengthKind === "custom-rounds" ? (
          <TextField
            label="Máximo de rondas"
            inputMode="numeric"
            value={form.customRounds}
            onChange={(event) => setForm({ ...form, customRounds: event.target.value })}
            error={fieldError?.field === "customRounds" ? fieldError.message : null}
            hint="Gana quien tenga más stats al terminar."
          />
        ) : null}
        {form.lengthKind === "custom-stats" ? (
          <TextField
            label="Meta de stats"
            inputMode="numeric"
            value={form.statsGoal}
            onChange={(event) => setForm({ ...form, statsGoal: event.target.value })}
            error={fieldError?.field === "statsGoal" ? fieldError.message : null}
            hint="La partida termina al final de la ronda en que alguien llegue a la meta."
          />
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </Card>
  );
}

function JoinRoomCard() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Escribe el código de la sala.");
      return;
    }
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await endpoints.rooms.join(clean);
      navigate(`/sala/${clean}`);
    } catch (joinError) {
      setFormError(shownError(joinError));
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" className="p-6">
      <CardTitle icon={<EnterIcon />}>Unirse a una sala</CardTitle>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Código de sala"
          value={code}
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          inputClassName="font-num text-center text-2xl uppercase tracking-[0.3em]"
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          error={error}
          hint="Te lo da quien creó la sala."
        />
        <Button type="submit" size="lg" loading={submitting}>
          Unirse
        </Button>
      </form>
    </Card>
  );
}

export function LobbyPage() {
  const state = useLocation().state as { config?: RoomConfig } | null;
  const user = useSession((s) => s.user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        {user ? <p className="text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
        <h1 className="font-display text-3xl font-semibold">Lobby</h1>
      </div>
      <ResumeBanner />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CreateRoomCard initial={state?.config} />
        <JoinRoomCard />
      </div>
    </div>
  );
}
