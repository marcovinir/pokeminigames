import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { CodeField } from "../components/CodeField";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { useServices } from "../services";
import { AuthCard } from "./AuthCard";
import { AuthLayout } from "./AuthLayout";
import { serverFieldErrors, validateEmail, validateReset } from "./auth-validation";
import { describeError } from "./describe-error";
import { useCooldown } from "./use-cooldown";

/** El servidor contesta lo mismo exista o no la cuenta: la pantalla tampoco asegura nada. */
const SENT_NOTICE = "Si existe una cuenta con ese correo, te enviamos un código.";
const RESENT_NOTICE = "Si existe una cuenta con ese correo, te enviamos un código nuevo.";
const CHANGED_NOTICE = "Contraseña cambiada. Inicia sesión con la nueva.";

/** El servidor deja un código nuevo por correo cada 60 s. */
const RESEND_SECONDS = 60;

const backToLogin = (
  <Link to="/login" className="font-semibold text-accent underline">
    Volver a iniciar sesión
  </Link>
);

/** Pide el correo y envía el código para cambiar la contraseña; sigue a la pantalla donde se escribe. */
export function ForgotPasswordPage() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = email.trim();
    const found = validateEmail(clean);
    setEmailError(found.email);
    setFormError(null);
    if (found.email) return;

    setSubmitting(true);
    try {
      await endpoints.auth.forgotPassword(clean);
      navigate("/restablecer", { state: { email: clean, notice: SENT_NOTICE } });
    } catch (error) {
      setFormError(describeError(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Recupera tu contraseña" footer={backToLogin}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <p className="text-sm">Escribe el correo de tu cuenta y te enviamos un código.</p>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
            error={emailError}
          />
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Enviar código
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}

/** Lo que trae la pantalla de la que se viene: el correo al que se envió el código y un aviso. */
interface ResetState {
  email?: string;
  notice?: string;
}

/** Cambia la contraseña con el código que llegó. No abre sesión: vuelve al inicio de sesión con un aviso. */
export function ResetPasswordPage() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const state = useLocation().state as ResetState | null;
  // El correo viaja en el estado del router (nunca en la URL). Si se perdió (se recargó la página), se pide.
  const known = state?.email ?? "";
  const [email, setEmail] = useState(known);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(state?.notice ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Quien llega con el correo viene de que se le acaba de enviar un código: antes de pedir otro hay que esperar.
  const cooldown = useCooldown(known ? RESEND_SECONDS : 0);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = email.trim();
    const found = validateReset({ email: clean, code, password });
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await endpoints.auth.resetPassword({ email: clean, code, password });
      navigate("/login", { state: { notice: CHANGED_NOTICE } });
    } catch (error) {
      const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
      setErrors({ email: fields.email, password: fields.password });
      // Si el servidor señaló campos concretos, el aviso general sobra.
      setFormError(fields.email || fields.password ? null : describeError(error));
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (cooldown.remaining > 0 || resending) return;
    const clean = email.trim();
    const found = validateEmail(clean);
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (found.email) return;

    setResending(true);
    try {
      await endpoints.auth.forgotPassword(clean);
      setInfo(RESENT_NOTICE);
      cooldown.start(RESEND_SECONDS);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Nueva contraseña" footer={backToLogin}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {info ? <Notice>{info}</Notice> : null}
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          {known ? null : (
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              error={errors.email}
            />
          )}
          <CodeField
            value={code}
            onChange={(next) => {
              setCode(next);
              setErrors((current) => ({ ...current, code: undefined }));
            }}
            error={errors.code}
            autoFocus={Boolean(known)}
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            error={errors.password}
            hint="Mínimo 8 caracteres."
          />
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Cambiar contraseña
          </Button>
          <Button type="button" disabled={cooldown.remaining > 0 || resending} onClick={() => void handleResend()}>
            {cooldown.remaining > 0 ? `Reenviar código (espera ${cooldown.remaining} s)` : "Reenviar código"}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
