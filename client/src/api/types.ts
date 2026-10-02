export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
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
