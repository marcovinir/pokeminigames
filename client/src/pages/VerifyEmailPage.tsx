import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { CodeField } from "../components/CodeField";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { useServices } from "../services";
import { AuthCard } from "./AuthCard";
import { AuthLayout } from "./AuthLayout";
import { validateEmail, validateVerification } from "./auth-validation";
import { describeError } from "./describe-error";
import { useCooldown } from "./use-cooldown";

/** Lo que trae la pantalla de la que se viene (registro o login): el correo al que se envió el código y un aviso. */
interface VerifyState {
  email?: string;
  notice?: string;
  /** La pantalla que se intentaba abrir antes de pedir sesión (una sala, por ejemplo); por defecto, el lobby. */
  returnTo?: string;
}

/** El servidor deja un código nuevo por correo cada 60 s. */
const RESEND_SECONDS = 60;

/** Verificar el correo con el código de seis dígitos y abrir la sesión. */
export function VerifyEmailPage() {
  const { session, endpoints } = useServices();
  const navigate = useNavigate();
  const state = useLocation().state as VerifyState | null;
  // El correo viaja en el estado del router (nunca en la URL). Si se perdió (se recargó la página), se pide.
  const known = state?.email ?? "";
  const [email, setEmail] = useState(known);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ email?: string; code?: string }>({});
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
    const found = validateVerification({ email: clean, code });
    setErrors(found);
    setFormError(null);
    setInfo(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await session.getState().verifyEmail({ email: clean, code });
      navigate(state?.returnTo ?? "/", { replace: true });
    } catch (error) {
      setFormError(describeError(error));
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
      await endpoints.auth.resendCode(clean);
      setInfo(`Te enviamos un código nuevo a ${clean}.`);
      cooldown.start(RESEND_SECONDS);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Verifica tu correo"
        footer={
          <Link to="/registro" className="font-semibold text-accent underline">
            Usar otro correo
          </Link>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {info ? <Notice>{info}</Notice> : null}
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <p className="text-sm">
            {known ? `Te enviamos un código de 6 dígitos a ${known}. Escríbelo aquí.` : "Escribe tu correo y el código de 6 dígitos que te enviamos."}
          </p>
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
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Verificar
          </Button>
          <Button type="button" disabled={cooldown.remaining > 0 || resending} onClick={() => void handleResend()}>
            {cooldown.remaining > 0 ? `Reenviar código (espera ${cooldown.remaining} s)` : "Reenviar código"}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
