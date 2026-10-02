import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { TextField } from "../components/TextField";
import { errorMessage } from "../i18n/es";
import { type FieldErrors, serverFieldErrors } from "./auth-validation";

export interface AuthFormProps {
  title: string;
  submitLabel: string;
  /** Pide también el nombre de usuario (registro). */
  withUsername?: boolean;
  validate(values: { email: string; username: string; password: string }): FieldErrors;
  onSubmit(values: { email: string; username: string; password: string }): Promise<void>;
  footer: ReactNode;
}

/** Formulario común de inicio de sesión y registro: valida, envía y muestra los errores del servidor. */
export function AuthForm({ title, submitLabel, withUsername = false, validate, onSubmit, footer }: AuthFormProps) {
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
      setFormError(Object.keys(fields).length > 0 ? null : error instanceof ApiError ? error.message : errorMessage(undefined));
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-medium">{title}</h1>
      <form onSubmit={handleSubmit} noValidate className="framed flex flex-col gap-4 rounded-card bg-surface p-4">
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
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">{footer}</p>
    </section>
  );
}
