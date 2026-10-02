import { useEffect } from "react";
import { Header } from "./components/Header";
import { AppRoutes } from "./routes";
import { useServices } from "./services";

export function App() {
  const { session } = useServices();

  // Al cargar, intenta recuperar la sesión con la cookie de refresco (solo consulta una vez).
  useEffect(() => {
    void session.getState().bootstrap();
  }, [session]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <AppRoutes />
      </main>
    </>
  );
}
