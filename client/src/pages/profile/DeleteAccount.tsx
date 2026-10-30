import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Notice } from "../../components/Notice";
import { TextField } from "../../components/TextField";
import { DELETE_ACCOUNT_TEXT, errorMessage } from "../../i18n/es";
import { useServices } from "../../services";

/**
 * Al final del perfil propio: borrar la cuenta con la contraseña. El servidor la anonimiza (las partidas siguen en el
 * historial de los rivales); al terminar, la sesión se cierra y se vuelve a la página de inicio con un aviso.
 */
export function DeleteAccount() {
  const { session } = useServices();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const refocusOpener = useRef(false);

  // El botón vuelve a existir al cerrar el formulario: entonces recibe el foco (si se cerró con «Cancelar»).
  useEffect(() => {
    if (open || !refocusOpener.current) return;
    refocusOpener.current = false;
    openerRef.current?.focus();
  }, [open]);

  // Cancelar no deja la contraseña escrita en memoria y devuelve el foco al botón que abrió el formulario.
  const cancel = () => {
    setOpen(false);
    setPassword("");
    setFieldError(null);
    setError(null);
    refocusOpener.current = true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password === "") {
      setFieldError(DELETE_ACCOUNT_TEXT.missingPassword);
      return;
    }
    setFieldError(null);
    setSending(true);
    try {
      await session.getState().deleteAccount(password);
      navigate("/login", { replace: true, state: { notice: DELETE_ACCOUNT_TEXT.done } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : errorMessage(undefined));
      setSending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="delete-account-title" className="p-5">
      <h2 id="delete-account-title" className="font-display text-xl font-semibold">
        {DELETE_ACCOUNT_TEXT.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{DELETE_ACCOUNT_TEXT.warning}</p>
      {open ? (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          <TextField
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            // Se abre con un clic en «Borrar mi cuenta»: lo siguiente es escribir la contraseña.
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldError}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={sending}>
              {DELETE_ACCOUNT_TEXT.confirm}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              {DELETE_ACCOUNT_TEXT.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button ref={openerRef} onClick={() => setOpen(true)}>
            {DELETE_ACCOUNT_TEXT.title}
          </Button>
        </div>
      )}
    </Card>
  );
}
