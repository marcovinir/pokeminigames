import type { ErrorCode } from "@pokemon-minigames/shared";
import { NETWORK_ERROR, errorMessage, rateLimitMessage, retryAfterOf } from "../i18n/es";
import type { AuthSession } from "./types";

/** Error de una llamada al servidor. `message` ya está en español y listo para mostrar. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | typeof NETWORK_ERROR,
    readonly details?: unknown,
  ) {
    // Un 429 dice cuánto esperar cuando el servidor lo informa, en cualquier pantalla y no solo en los formularios.
    super(code === "RATE_LIMITED" ? rateLimitMessage(retryAfterOf(details)) : errorMessage(code));
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  /** Prefijo de todas las rutas. Vacío = el mismo origen que la página (lo habitual). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Se llama cuando la sesión no se pudo renovar: hay que volver a iniciar sesión. */
  onSessionLost?: () => void;
  /** Se llama tras cada renovación: otra pestaña pudo cambiar de identidad (p. ej. de invitado a cuenta). */
  onSessionRefreshed?: (session: AuthSession) => void;
}

export interface RequestOptions {
  body?: unknown;
  /** Por defecto la petición lleva el access token y, si da 401, renueva la sesión y reintenta. */
  auth?: boolean;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: { code?: ErrorCode; details?: unknown } };
    return new ApiError(response.status, data.error?.code ?? "INTERNAL_ERROR", data.error?.details);
  } catch {
    return new ApiError(response.status, "INTERNAL_ERROR");
  }
}

/**
 * Cliente HTTP del servidor. Guarda el access token en memoria (nunca en el almacenamiento del
 * navegador) y, cuando caduca, lo renueva con la cookie de refresco: una sola vez, aunque varias
 * peticiones fallen a la vez.
 */
export class ApiClient {
  private token: string | null = null;
  private refreshing: Promise<AuthSession | null> | null = null;
  private refreshFailedByNetwork = false;

  constructor(private readonly options: ApiClientOptions = {}) {}

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, { body, auth = true }: RequestOptions = {}): Promise<T> {
    let response = await this.send(method, path, body, auth ? this.token : null);

    if (response.status === 401 && auth) {
      const session = await this.refreshSession();
      // Sin red no se sabe si la sesión sigue viva: es un error de red, no una sesión perdida.
      if (!session && this.refreshFailedByNetwork) throw new ApiError(0, NETWORK_ERROR);
      if (!session) {
        this.options.onSessionLost?.();
        throw await toApiError(response);
      }
      response = await this.send(method, path, body, session.accessToken);
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** Renueva la sesión con la cookie. Las llamadas simultáneas comparten una sola petición. */
  refreshSession(): Promise<AuthSession | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<AuthSession | null> {
    this.refreshFailedByNetwork = false;
    try {
      const response = await this.send("POST", "/auth/refresh", undefined, null);
      if (!response.ok) {
        this.token = null;
        return null;
      }
      const session = (await response.json()) as AuthSession;
      this.token = session.accessToken;
      this.options.onSessionRefreshed?.(session);
      return session;
    } catch {
      this.refreshFailedByNetwork = true;
      return null;
    }
  }

  private async send(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);
    try {
      return await doFetch(`${this.options.baseUrl ?? ""}${path}`, {
        method,
        credentials: "include",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR);
    }
  }
}
