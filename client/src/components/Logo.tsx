/** La bola del juego: dos mitades de color, una banda y un botón. Es decorativa; el nombre va al lado como texto. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="32" cy="32" r="30" className="fill-fg" />
      <path d="M32 6a26 26 0 0 1 26 26H6A26 26 0 0 1 32 6z" className="fill-accent" />
      <path d="M6 32h52a26 26 0 0 1-52 0z" className="fill-surface" />
      <circle cx="32" cy="32" r="9" className="fill-fg" />
      <circle cx="32" cy="32" r="5" className="fill-surface" />
    </svg>
  );
}

/**
 * La bola con el nombre del juego en la fuente de títulos. En pantallas estrechas el nombre puede quedar solo para los
 * lectores de pantalla (`hideNameOnMobile`), para que quepan los botones.
 */
export function Logo({ size = 30, hideNameOnMobile = false }: { size?: number; hideNameOnMobile?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className={`font-display text-xl font-semibold tracking-tight max-[380px]:in-data-[theme=pokedex]:text-base ${hideNameOnMobile ? "max-sm:sr-only" : ""}`}>PokeMiniGames</span>
    </span>
  );
}
