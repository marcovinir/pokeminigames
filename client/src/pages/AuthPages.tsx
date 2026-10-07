import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useServices } from "../services";
import { AuthForm } from "./AuthForm";
import { AuthHero } from "./AuthHero";
import { validateLogin, validateRegistration } from "./auth-validation";

/** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
function useReturnPath(): string {
  const state = useLocation().state as { from?: { pathname?: string } } | null;
  return state?.from?.pathname ?? "/";
}

/** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12">
      <AuthHero />
      {children}
    </div>
  );
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
          await session.getState().login({ email, password });
          navigate(returnTo, { replace: true });
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
          await session.getState().register({ email, username, password });
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
