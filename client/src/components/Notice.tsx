import type { ReactNode } from "react";

type Tone = "info" | "danger" | "success";

const TONES: Record<Tone, string> = {
  info: "bg-surface-2 text-fg border-line",
  danger: "bg-danger-bg text-danger border-danger",
  success: "bg-success-bg text-success border-success",
};

export interface NoticeProps {
  tone?: Tone;
  children: ReactNode;
  /** Los errores se anuncian de inmediato (`alert`); lo demás, con calma (`status`). */
  urgent?: boolean;
  className?: string;
}

export function Notice({ tone = "info", urgent = tone === "danger", children, className = "" }: NoticeProps) {
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`rounded-ui border-(length:--frame) px-3 py-2 text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
