import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { isGuest } from "../api/types";
import { HEADER_MENU_TEXT, SOUND_TEXT } from "../i18n/es";
import { useServices, useSession } from "../services";
import { Button } from "./Button";
import { SoundControls } from "./SoundControls";
import { ThemeControls } from "./ThemeControls";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-3">
      <p aria-hidden="true" className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

const ACCOUNT_LINK = "block rounded-ui px-3 py-2 font-display text-sm font-semibold hover:bg-surface-2";

/**
 * El botón de la esquina y su panel: lo que no cabe en la barra. `shortcuts` son los accesos de la barra, que dentro del
 * panel solo se ven en pantallas estrechas. El panel se ancla al interior del encabezado, no al botón, y se desplaza si la
 * pantalla es baja. Durante una partida el encabezado no le pasa accesos: salir de la página cerraría la conexión.
 */
export function HeaderMenu({ shortcuts }: { shortcuts?: (close: () => void) => ReactNode }) {
  const { session } = useServices();
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Con el foco en otro control, el Escape es suyo (por ejemplo, cerrar unas sugerencias): no se le roba el foco.
      const focused = document.activeElement;
      if (focused && focused !== document.body && !root.current?.contains(focused)) return;
      setOpen(false);
      root.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={root}
      onBlur={(event) => {
        // Con Tab fuera del panel, se cierra (un clic fuera ya lo cierra el oyente de mousedown).
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <Button variant="header" className="shrink-0 px-3" aria-label={HEADER_MENU_TEXT.button} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((current) => !current)}>
        <MenuIcon />
      </Button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={HEADER_MENU_TEXT.button}
          className="framed absolute right-4 top-full z-30 mt-2 flex max-h-[calc(100dvh-var(--header-h)-1rem)] w-[min(20rem,calc(100vw-2rem))] flex-col gap-5 overflow-y-auto rounded-card bg-surface p-4 text-fg shadow-card"
        >
          {shortcuts?.(close)}
          <Section title={SOUND_TEXT.button}>
            <SoundControls />
          </Section>
          <Section title={HEADER_MENU_TEXT.appearance}>
            <ThemeControls />
          </Section>
          <div className="flex flex-col gap-1">
            {!user ? (
              <Link to="/login" onClick={close} className={ACCOUNT_LINK}>
                {HEADER_MENU_TEXT.logIn}
              </Link>
            ) : isGuest(user) ? (
              <Link to="/registro" onClick={close} className={ACCOUNT_LINK}>
                {HEADER_MENU_TEXT.register}
              </Link>
            ) : (
              <Link to="/perfil" onClick={close} className={ACCOUNT_LINK}>
                {HEADER_MENU_TEXT.profile}
              </Link>
            )}
            {user ? (
              // Separado y al final, para no tocarlo sin querer.
              <div className="mt-2 border-t border-line pt-3">
                <Button
                  className="w-full"
                  onClick={() => {
                    close();
                    void session.getState().logout();
                  }}
                >
                  {HEADER_MENU_TEXT.logOut}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
