import type { ReactNode } from "react";

type Tone = "info" | "danger" | "success";

const TONES: Record<Tone, string> = {
  info: "bg-surface-2 text-fg border-line",
  danger: "bg-danger-bg text-danger border-danger",
  success: "bg-success-bg text-success border-success",
};

/** Un icono sencillo por tono, decorativo: el texto del aviso es lo que se lee. */
function NoticeIcon({ tone }: { tone: Tone }) {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {tone === "danger" ? (
        <>
          <path d="M12 4 3 20h18L12 4z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      ) : tone === "success" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.5 2.8 2.8L16 9.6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </>
      )}
    </svg>
  );
}

export interface NoticeProps {
  tone?: Tone;
  children: ReactNode;
  /** Un botón o enlace a la derecha del texto (p. ej. «Volver a tu partida»). */
  action?: ReactNode;
  /** Los errores se anuncian de inmediato (`alert`); lo demás, con calma (`status`). */
  urgent?: boolean;
  className?: string;
}

export function Notice({ tone = "info", urgent = tone === "danger", children, action, className = "" }: NoticeProps) {
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ui border-(length:--frame) px-4 py-3 text-sm ${TONES[tone]} ${className}`}
    >
      <NoticeIcon tone={tone} />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
