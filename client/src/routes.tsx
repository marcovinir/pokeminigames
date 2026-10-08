import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { LoadingScreen } from "./components/LoadingScreen";
import { useSession } from "./services";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { LobbyPage } from "./pages/Lobby";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { RoomPage } from "./pages/room/RoomPage";

/** Rutas que exigen sesión: sin ella llevan a /login y, tras entrar, vuelven a donde se iba. */
function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Rutas para quien aún no ha entrado: con sesión llevan al lobby. */
function PublicOnly() {
  const status = useSession((s) => s.status);
  if (status === "loading") return <LoadingScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/verificar" element={<VerifyEmailPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/sala/:code" element={<RoomPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/jugador/:username" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
