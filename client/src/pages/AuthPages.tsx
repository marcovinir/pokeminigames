import { Link, useLocation, useNavigate } from "react-router";
import { useServices } from "../services";
import { AuthForm } from "./AuthForm";
import { validateLogin, validateRegistration } from "./auth-validation";

/** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
function useReturnPath(): string {
  const state = useLocation().state as { from?: { pathname?: string } } | null;
  return state?.from?.pathname ?? "/";
}

export function LoginPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const returnTo = useReturnPath();

  return (
    <AuthForm
      title="Iniciar sesión"
      submitLabel="Entrar"
      validate={validateLogin}
      onSubmit={async ({ email, password }) => {
        await session.getState().login({ email, password });
        navigate(returnTo, { replace: true });
      }}
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="text-accent underline">
            Crea una
          </Link>
        </>
      }
    />
  );
}

export function RegisterPage() {
  const { session } = useServices();
  const navigate = useNavigate();

  return (
    <AuthForm
      title="Crear cuenta"
      submitLabel="Crear cuenta"
      withUsername
      validate={validateRegistration}
      onSubmit={async ({ email, username, password }) => {
        await session.getState().register({ email, username, password });
        navigate("/", { replace: true });
      }}
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-accent underline">
            Inicia sesión
          </Link>
        </>
      }
    />
  );
}
