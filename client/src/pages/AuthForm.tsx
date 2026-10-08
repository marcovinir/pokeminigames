import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage, rateLimitMessage, retryAfterOf } from "../i18n/es";
import { AuthCard } from "./AuthCard";
import { type FieldErrors, serverFieldErrors } from "./auth-validation";

export interface AuthFormProps {
  title: string;
  submitLabel: string;
  /** Pide también el nombre de usuario (registro). */
  withUsername?: boolean;
  validate(values: { email: string; username: string; password: string }): FieldErrors;
  onSubmit(values: { email: string; username: string; password: string }): Promise<void>;
  footer: ReactNode;
  /** Un aviso de éxito que trae la pantalla de la que se viene (p. ej. «Contraseña cambiada»). */
  notice?: string;
  /** Algo que va justo debajo de la contraseña (p. ej. «¿Olvidaste tu contraseña?»). */
  extra?: ReactNode;
}

/** El 429 dice cuánto esperar; los demás errores ya traen su mensaje en español. */
const describe = (error: ApiError): string =>
  error.code === "RATE_LIMITED" ? rateLimitMessage(retryAfterOf(error.details)) : error.message;

/** Formulario común de inicio de sesión y registro: valida, envía y muestra los errores del servidor. */
export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer, notice, extra }: AuthFormProps) {
  const [values, setValues] = useState({ email: "", username: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const clean = { email: values.email.trim(), username: values.username.trim(), password: values.password };
    const found = validate(clean);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(clean);
    } catch (error) {
      const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
      setErrors(fields);
      // Si el servidor señaló campos concretos, el aviso general sobra.
      setFormError(Object.keys(fields).length > 0 ? null : error instanceof ApiError ? describe(error) : errorMessage(undefined));
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title={title} footer={footer}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
        {withUsername ? (
          <TextField
            label="Nombre de usuario"
            autoComplete="username"
            value={values.username}
            onChange={set("username")}
            error={errors.username}
            hint="De 3 a 30 letras, números o guion bajo."
          />
        ) : null}
        <TextField
          label="Contraseña"
          type="password"
          autoComplete={withUsername ? "new-password" : "current-password"}
          value={values.password}
          onChange={set("password")}
          error={errors.password}
          hint={withUsername ? "Mínimo 8 caracteres." : undefined}
        />
        {extra ? <div className="-mt-1">{extra}</div> : null}
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          {submitLabel}
        </Button>
      </form>
    </AuthCard>
  );
}
