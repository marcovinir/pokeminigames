import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { LoadBoundary } from "./components/LoadBoundary";
import { LoadingScreen } from "./components/LoadingScreen";
import { isGuest } from "./api/types";
import { useSession } from "./services";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { INFO_PAGES, INFO_SLUGS } from "./i18n/info";
import { InfoPage } from "./pages/InfoPage";
import { LobbyRoute } from "./pages/Lobby";
import { MainMenu } from "./pages/MainMenu";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { RoomPage } from "./pages/room/RoomPage";

// Se carga aparte: no engorda el arranque de quien solo viene a jugar.
const TypesPage = lazy(() => import("./pages/types/TypesPage").then((module) => ({ default: module.TypesPage })));

const PokedexPage = lazy(() => import("./pages/pokedex/PokedexPage").then((module) => ({ default: module.PokedexPage })));

/** Rutas que exigen sesión: sin ella llevan a /login y, tras entrar, vuelven a donde se iba. */
function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Rutas solo de cuentas (perfil y estadísticas): un invitado no tiene nada que ver ahí y vuelve al lobby. */
function RequireAccount() {
  const user = useSession((s) => s.user);
  if (isGuest(user)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Rutas para quien aún no ha entrado: con una cuenta abierta llevan al lobby. Un invitado sí puede verlas: es cómo
 * se pasa de invitado a tener cuenta.
 */
function PublicOnly() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  if (status === "loading") return <LoadingScreen />;
  if (status === "authenticated" && !isGuest(user)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<MainMenu />} />
        <Route path="/jugar/:juego" element={<LobbyRoute />} />
        <Route path="/sala/:code" element={<RoomPage />} />
        <Route element={<RequireAccount />}>
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/jugador/:username" element={<ProfilePage />} />
        </Route>
      </Route>
      {/* Las páginas de información son públicas: se ven con sesión, sin ella y como invitado. */}
      {INFO_SLUGS.map((slug) => (
        <Route key={slug} path={INFO_PAGES[slug].path} element={<InfoPage slug={slug} />} />
      ))}
      <Route
        path="/tipos"
        element={
          <LoadBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <TypesPage />
            </Suspense>
          </LoadBoundary>
        }
      />
      <Route
        path="/pokedex"
        element={
          <LoadBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <PokedexPage />
            </Suspense>
          </LoadBoundary>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
