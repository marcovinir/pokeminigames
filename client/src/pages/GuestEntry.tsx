import { type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { rise } from "../components/rise";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { Link } from "react-router";
import { isGuest } from "../api/types";
import { useServices, useSession } from "../services";
import { validateUsername } from "./auth-validation";

/** «Juega como invitado»: solo un nombre, sin correo ni contraseña. Entra al lobby (o a donde se iba) y no guarda nada. */
export function GuestEntry({ returnTo }: { returnTo: string }) {
  const { session } = useServices();
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // El estado se actualiza en el siguiente render: dos pulsaciones seguidas lo verían aún en `false`.
  const sending = useRef(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (sending.current) return;
    const clean = name.trim();
    const found = validateUsername(clean);
    setError(found);
    setFormError(null);
    if (found) return;

    sending.current = true;
    setSubmitting(true);
    try {
      await session.getState().loginAsGuest(clean);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : errorMessage(undefined));
      sending.current = false;
      setSubmitting(false);
    }
  }

  // Ya invitado (p. ej. desde otra pestaña): entrar otra vez crearía otra identidad y la partida en curso perdería el asiento.
  if (isGuest(user)) {
    return (
      <Card as="section" style={rise(2)} className="animate-rise mx-auto w-full max-w-sm p-6">
        <p>Ya juegas como invitado {user.username}.</p>
        <Link to="/" className="mt-3 inline-block font-semibold text-accent underline">
          Seguir jugando
        </Link>
      </Card>
    );
  }

  return (
    <Card as="section" style={rise(2)} className="animate-rise mx-auto w-full max-w-sm p-6">
      <h2 className="font-display text-lg font-semibold">¿Sin cuenta? Juega como invitado</h2>
      <p className="mt-1 text-sm text-muted">Solo un nombre. Tus partidas no se guardan ni cuentan para las estadísticas.</p>
      <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Nombre"
          autoComplete="off"
          hint="De 3 a 30 letras, números o guion bajo."
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        <Button type="submit" variant="secondary" size="lg" loading={submitting}>
          Entrar como invitado
        </Button>
      </form>
    </Card>
  );
}
