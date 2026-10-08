import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { useServices } from "../services";
import { AuthForm } from "./AuthForm";
import { AuthLayout } from "./AuthLayout";
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
    <AuthLayout>
      <AuthForm
        title="Iniciar sesión"
        submitLabel="Entrar"
        validate={validateLogin}
        onSubmit={async ({ email, password }) => {
          try {
            await session.getState().login({ email, password });
            navigate(returnTo, { replace: true });
          } catch (error) {
            // La contraseña era correcta pero falta verificar el correo (el servidor ya envió un código nuevo): a verificarlo.
            if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
              navigate("/verificar", { state: { email, notice: "Tu correo aún no está verificado. Te enviamos un código.", returnTo } });
              return;
            }
            throw error;
          }
        }}
        footer={
          <>
            ¿No tienes cuenta?{" "}
            <Link to="/registro" className="font-semibold text-accent underline">
              Crea una
            </Link>
          </>
        }
      />
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { session } = useServices();
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <AuthForm
        title="Crear cuenta"
        submitLabel="Crear cuenta"
        withUsername
        validate={validateRegistration}
        onSubmit={async ({ email, username, password }) => {
          const pending = await session.getState().register({ email, username, password });
          // Con la verificación activa no hay sesión todavía: el código llegó por correo.
          if (pending) {
            navigate("/verificar", { state: { email: pending.email } });
            return;
          }
          navigate("/", { replace: true });
        }}
        footer={
          <>
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-semibold text-accent underline">
              Inicia sesión
            </Link>
          </>
        }
      />
    </AuthLayout>
  );
}
