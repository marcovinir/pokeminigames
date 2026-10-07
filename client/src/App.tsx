import { useEffect } from "react";
import { Footer } from "./components/Footer";
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
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <AppRoutes />
      </main>
      <Footer />
    </div>
  );
}
