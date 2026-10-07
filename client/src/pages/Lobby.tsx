import type { RoomConfig, TypeMode } from "@pokemon-minigames/shared";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import type { CurrentRoom } from "../api/endpoints";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { useServices } from "../services";
import {
  type CreateRoomForm,
  DEFAULT_FORM,
  LENGTH_LABELS,
  type LengthKind,
  buildRequest,
  formFromConfig,
} from "./room-form";

const shownError = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));

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
    <section className="framed rounded-card bg-surface p-4">
      <h2 className="mb-3 text-lg font-medium">Crear sala</h2>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Modo de tipos</legend>
          {TYPE_MODE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="typeMode"
                value={option.value}
                checked={form.typeMode === option.value}
                onChange={() => setForm({ ...form, typeMode: option.value })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="length" className="mb-1 block text-sm font-medium">
            Largo de la partida
          </label>
          <select
            id="length"
            value={form.lengthKind}
            onChange={(event) => {
              setForm({ ...form, lengthKind: event.target.value as LengthKind });
              setFieldError(null);
            }}
            className="framed w-full rounded-ui bg-surface px-3 py-2 text-fg"
          >
            {(Object.keys(LENGTH_LABELS) as LengthKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {LENGTH_LABELS[kind]}
              </option>
            ))}
          </select>
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

        <Button type="submit" variant="primary" loading={submitting}>
          Crear sala
        </Button>
      </form>
    </section>
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
    <section className="framed rounded-card bg-surface p-4">
      <h2 className="mb-3 text-lg font-medium">Unirse a una sala</h2>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Código de sala"
          value={code}
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          error={error}
          hint="Te lo da quien creó la sala."
        />
        <Button type="submit" loading={submitting}>
          Unirse
        </Button>
      </form>
    </section>
  );
}

export function LobbyPage() {
  const state = useLocation().state as { config?: RoomConfig } | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-medium">Lobby</h1>
      <ResumeBanner />
      <div className="grid gap-6 md:grid-cols-2">
        <CreateRoomCard initial={state?.config} />
        <JoinRoomCard />
      </div>
    </div>
  );
}
