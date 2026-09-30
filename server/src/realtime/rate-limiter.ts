export interface RateLimiter {
  /** Registra un evento y dice si está dentro del límite. Los eventos rechazados no cuentan. */
  allow(): boolean;
}

/** Ventana deslizante: como mucho `limit` eventos en cualquier intervalo de `windowMs`. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const stamps: number[] = [];
  return {
    allow() {
      const current = now();
      while (stamps.length > 0 && current - stamps[0]! >= windowMs) stamps.shift();
      if (stamps.length >= limit) return false;
      stamps.push(current);
      return true;
    },
  };
}
