import type { ThemePreferences, TypeName } from "@pokemon-minigames/shared";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
  preferences: ThemePreferences | null;
  /** Número de Pokédex de su avatar; nulo = iniciales. */
  avatarId: number | null;
}

/** Quien entró como invitado: sin cuenta, sin correo y sin estadísticas; su partida no se guarda. */
export interface GuestUser {
  id: string;
  username: string;
  guest: true;
}

/** Quien tiene la sesión abierta: una cuenta o un invitado. */
export type SessionUser = AuthUser | GuestUser;

export function isGuest(user: SessionUser | null): user is GuestUser {
  return user !== null && "guest" in user && user.guest === true;
}

/** Respuesta de /auth/register, /auth/login, /auth/guest y /auth/refresh. */
export interface AuthSession {
  user: SessionUser;
  accessToken: string;
}

export interface PokemonName {
  id: number;
  es: string;
  en: string;
  /** Solo en la lista pedida con tipos (salas con «Pistas de tipos»). */
  types?: TypeName[];
}
