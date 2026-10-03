import type { ThemePreferences } from "@pokemon-minigames/shared";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  /** Nulo mientras la persona no haya guardado una preferencia de tema. */
  preferences: ThemePreferences | null;
}

/** Respuesta de /auth/register, /auth/login y /auth/refresh. */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface PokemonName {
  id: number;
  es: string;
  en: string;
}
