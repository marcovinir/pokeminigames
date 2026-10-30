import { AVATAR_POKEMON } from "@pokemon-minigames/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Notice } from "../../components/Notice";
import { AVATAR_TEXT } from "../../i18n/es";
import { useSession } from "../../services";

const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export interface AvatarPickerProps {
  /** El avatar que tiene ahora (nulo = iniciales). */
  current: number | null;
  /** Su nombre: el color de fondo de cada avatar es el suyo, como se verá luego. */
  name: string;
  onClose: () => void;
}

/**
 * La ventana «Elige tu avatar»: los 24 en una rejilla, el actual marcado. Tocar uno lo guarda y cierra; si falla, sigue
 * abierta con un aviso. Es modal: el foco entra al abrir, no sale con Tab y Escape la cierra (salvo mientras guarda: cerrar
 * entonces dejaría la sesión con un avatar y la base con otro si se elige otro antes de que responda).
 */
export function AvatarPicker({ current, name, onClose }: AvatarPickerProps) {
  const saveAvatar = useSession((s) => s.saveAvatar);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Un segundo toque puede llegar antes de que React vuelva a pintar: la guarda síncrona lo descarta.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  /** El avatar que se está guardando (para marcar su celda); `undefined` si no se guarda nada. */
  const [touched, setTouched] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const selected = panel?.querySelector<HTMLButtonElement>("button[aria-pressed='true']");
    (selected ?? panel?.querySelector<HTMLButtonElement>("button[aria-pressed]"))?.focus();
  }, []);

  async function choose(avatarId: number | null) {
    if (savingRef.current) return;
    if (avatarId === current) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setTouched(avatarId);
    setFailed(false);
    try {
      await saveAvatar(avatarId);
      onClose();
    } catch {
      savingRef.current = false;
      setSaving(false);
      setTouched(undefined);
      setFailed(true);
    }
  }

  // Las teclas se escuchan en todo el documento: tras un clic en el título, en un hueco o en el fondo, el foco cae en la
  // página (fuera de la ventana) y un manejador puesto en la ventana ya no las recibiría.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      // Si el foco está fuera de la ventana, Tab lo trae al primero y Mayús+Tab al último.
      const inside = focusable.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    // El fondo cubre la página: no se puede tocar nada de detrás mientras la ventana está abierta.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tone="raised"
        // En pantallas bajas (o con el aviso de error) la ventana se desplaza en vez de cortarse.
        className="animate-rise max-h-full w-full max-w-md overflow-y-auto p-5"
      >
        <div ref={panelRef}>
          <h2 id={titleId} className="font-display text-xl font-semibold">
            {AVATAR_TEXT.title}
          </h2>
          <div
            role="group"
            aria-label={AVATAR_TEXT.gridLabel}
            aria-busy={saving || undefined}
            className={`mt-4 grid grid-cols-6 gap-2 transition-opacity ${saving ? "opacity-60" : ""}`}
          >
            {AVATAR_POKEMON.map((pokemon) => {
              const selected = pokemon.id === current;
              const beingSaved = saving && touched === pokemon.id;
              return (
                <button
                  key={pokemon.id}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={saving || undefined}
                  data-saving={beingSaved || undefined}
                  onClick={() => void choose(pokemon.id)}
                  // El aro de foco va separado (6 px) para no tapar el aro de selección.
                  className={`flex justify-center rounded-pill p-0.5 ring-offset-2 ring-offset-surface focus-visible:outline-offset-[6px] ${selected || beingSaved ? "ring-[3px] ring-accent" : ""} ${beingSaved ? "animate-pulse" : ""}`}
                >
                  <Avatar name={name} avatarId={pokemon.id} size="md" />
                  <span className="sr-only">{pokemon.name}</span>
                </button>
              );
            })}
          </div>
          {failed ? (
            <div className="mt-4">
              <Notice tone="danger">{AVATAR_TEXT.saveError}</Notice>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {current !== null ? (
              <button type="button" onClick={() => void choose(null)} className="text-sm font-semibold underline underline-offset-4">
                {AVATAR_TEXT.useInitials}
              </button>
            ) : (
              <span />
            )}
            <Button onClick={() => (savingRef.current ? undefined : onClose())}>{AVATAR_TEXT.close}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
