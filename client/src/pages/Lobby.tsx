import {
  GENERATIONS,
  type GameKind,
  SILHOUETTE_DEFAULT_GENERATIONS,
  SILHOUETTE_DEFAULT_ROUNDS,
  SILHOUETTE_ROUNDS,
  type SilhouetteRounds,
  type TypeMode,
  gameFromSlug,
} from "@pokemon-minigames/shared";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ApiError } from "../api/client";
import type { CurrentRoom } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { rise } from "../components/rise";
import { TextField } from "../components/TextField";
import { GAME_CARDS, MENU_TEXT, AUCTION_TEXT, SILHOUETTE_TEXT, errorMessage, generationLabel } from "../i18n/es";
import { isGuest } from "../api/types";
import { useServices, useSession } from "../services";
import {
  type CreateRoomForm,
  DEFAULT_FORM,
  LENGTH_LABELS,
  type LengthKind,
  buildRequest,
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

function CreateRoomCard() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateRoomForm>(DEFAULT_FORM);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hintsId = useId();

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
    <Card as="section" style={rise(1)} className="animate-rise p-6">
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

        <label className="block cursor-pointer">
          <input
            type="checkbox"
            role="switch"
            checked={form.typeHints}
            aria-labelledby={`${hintsId}-label`}
            aria-describedby={`${hintsId}-hint`}
            onChange={(event) => setForm({ ...form, typeHints: event.target.checked })}
            className="peer sr-only"
          />
          <span className="framed-field flex items-start gap-3 rounded-ui bg-surface px-4 py-3 transition-shadow duration-(--dur-fast) peer-checked:border-accent peer-checked:shadow-[0_0_0_3px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-checked:[&_[data-check]]:opacity-100">
            <span className="min-w-0 flex-1">
              <span id={`${hintsId}-label`} className="font-display font-semibold">
                Pistas de tipos
              </span>
              <span id={`${hintsId}-hint`} className="block text-sm text-muted">
                Muestra los tipos en las sugerencias; hace la ronda más fácil.
              </span>
            </span>
            <CheckIcon />
          </span>
        </label>

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </Card>
  );
}

/** Crear una sala de «¿Quién es ese Pokémon?»: rondas y generaciones (por defecto 10 y Kanto). */
function CreateSilhouetteRoomCard() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<SilhouetteRounds>(SILHOUETTE_DEFAULT_ROUNDS);
  const [generations, setGenerations] = useState<number[]>([...SILHOUETTE_DEFAULT_GENERATIONS]);
  const [generationsError, setGenerationsError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  function toggle(n: number): void {
    setGenerationsError(false);
    setGenerations((current) => (current.includes(n) ? current.filter((g) => g !== n) : [...current, n].sort((a, b) => a - b)));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    if (generations.length === 0) {
      setGenerationsError(true);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const { code } = await endpoints.rooms.create({ game: "silueta", rounds, generations });
      navigate(`/sala/${code}`);
    } catch (error) {
      setFormError(shownError(error));
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" style={rise(1)} className="animate-rise p-6">
      <CardTitle icon={<PlusIcon />}>Crear sala</CardTitle>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <div>
          <label htmlFor="silhouette-rounds" className="mb-1.5 block text-sm font-semibold">
            {SILHOUETTE_TEXT.rounds}
          </label>
          <div className="relative">
            <select
              id="silhouette-rounds"
              value={rounds}
              onChange={(event) => setRounds(Number(event.target.value) as SilhouetteRounds)}
              className="framed-field w-full appearance-none rounded-ui bg-surface px-4 py-3 pr-10 text-fg"
            >
              {SILHOUETTE_ROUNDS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </div>
        </div>
        <fieldset aria-describedby={generationsError ? errorId : undefined}>
          <legend className="mb-1.5 text-sm font-semibold">{SILHOUETTE_TEXT.generations}</legend>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            {GENERATIONS.map((g) => (
              <label key={g.n} className="block cursor-pointer">
                <input type="checkbox" checked={generations.includes(g.n)} onChange={() => toggle(g.n)} className="peer sr-only" />
                <span className="framed-field flex items-center gap-2 rounded-ui bg-surface px-3 py-2 text-sm transition-shadow duration-(--dur-fast) peer-checked:border-accent peer-checked:shadow-[0_0_0_3px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-checked:[&_[data-check]]:opacity-100">
                  <span className="min-w-0 flex-1">{generationLabel(g.n, g.region)}</span>
                  <CheckIcon />
                </span>
              </label>
            ))}
          </div>
          {generationsError ? (
            <p id={errorId} role="alert" className="mt-2 text-sm font-semibold text-danger">
              {SILHOUETTE_TEXT.noGeneration}
            </p>
          ) : null}
        </fieldset>
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </Card>
  );
}

/** «Ya hay alguien con ese nombre»: una cuenta no puede cambiar de nombre, un invitado sí (saliendo y entrando con otro). */
const NAME_IN_USE_TEXT = {
  account: "Ya hay alguien con tu mismo nombre en esa sala: con esta cuenta no puedes unirte a ella.",
  guest: "Ya hay alguien con ese nombre en la sala. Cierra sesión (arriba a la derecha) y entra como invitado con otro nombre.",
} as const;

/** Crear una sala de subasta: lo único que se elige es si hay siluetas trampa. */
function CreateAuctionRoomCard() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [traps, setTraps] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trapsId = useId();

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const { code } = await endpoints.rooms.create({ game: "subasta", traps });
      navigate(`/sala/${code}`);
    } catch (error) {
      setFormError(shownError(error));
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" style={rise(1)} className="animate-rise p-6">
      <CardTitle icon={<PlusIcon />}>Crear sala</CardTitle>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <label className="block cursor-pointer">
          <input
            type="checkbox"
            role="switch"
            checked={traps}
            aria-labelledby={`${trapsId}-label`}
            aria-describedby={`${trapsId}-hint`}
            onChange={(event) => setTraps(event.target.checked)}
            className="peer sr-only"
          />
          <span className="framed-field flex items-start gap-3 rounded-ui bg-surface px-4 py-3 transition-shadow duration-(--dur-fast) peer-checked:border-accent peer-checked:shadow-[0_0_0_3px_var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-checked:[&_[data-check]]:opacity-100">
            <span className="min-w-0 flex-1">
              <span id={`${trapsId}-label`} className="font-display font-semibold">
                {AUCTION_TEXT.traps}
              </span>
              <span id={`${trapsId}-hint`} className="block text-sm text-muted">
                {AUCTION_TEXT.trapsHint}
              </span>
            </span>
            <CheckIcon />
          </span>
        </label>
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </Card>
  );
}

function JoinRoomCard() {
  const { endpoints } = useServices();
  const user = useSession((s) => s.user);
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
      const nameInUse = joinError instanceof ApiError && joinError.code === "NAME_IN_USE";
      setFormError(nameInUse ? NAME_IN_USE_TEXT[isGuest(user) ? "guest" : "account"] : shownError(joinError));
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" style={rise(2)} className="animate-rise p-6">
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

/** El lobby de un juego: crear su sala o unirse con un código (de cualquier juego). */
export function LobbyPage({ game = "doble_tipo" }: { game?: GameKind }) {
  const user = useSession((s) => s.user);

  return (
    <div className="flex flex-col gap-6">
      <div style={rise(0)} className="animate-rise">
        <Link to="/" className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
          {MENU_TEXT.backToMenu}
        </Link>
        {user ? <p className="mt-2 text-sm font-semibold text-muted">Hola, {user.username}</p> : null}
        <h1 className="font-display text-3xl font-semibold">{GAME_CARDS[game].name}</h1>
      </div>
      <ResumeBanner />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {game === "silueta" ? <CreateSilhouetteRoomCard /> : game === "subasta" ? <CreateAuctionRoomCard /> : <CreateRoomCard />}
        <JoinRoomCard />
      </div>
    </div>
  );
}

/** `/jugar/:juego`: el lobby de ese juego; un juego que no existe vuelve al menú. */
export function LobbyRoute() {
  const game = gameFromSlug(useParams().juego ?? "");
  if (!game) return <Navigate to="/" replace />;
  return <LobbyPage key={game} game={game} />;
}
