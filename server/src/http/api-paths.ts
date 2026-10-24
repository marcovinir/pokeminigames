/**
 * Prefijos de las rutas de la API. Todo lo que no empiece por uno de ellos (ni sea /health ni /socket.io) es una pantalla
 * del cliente. `/health` y `/socket.io` no están aquí a propósito: no pasan por el límite general de peticiones.
 */
export const API_PREFIXES = ["/auth", "/rooms", "/pokemon", "/stats", "/users", "/silhouettes"] as const;
