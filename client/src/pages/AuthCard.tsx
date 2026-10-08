import type { ReactNode } from "react";
import { Card } from "../components/Card";
import { rise } from "../components/rise";

/** La tarjeta de las pantallas de acceso: título, contenido y, abajo, un pie con enlaces. */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card as="section" tone="raised" style={rise(1)} className="animate-rise mx-auto w-full max-w-sm p-6">
      <h1 className="mb-5 font-display text-2xl font-semibold">{title}</h1>
      {children}
      {footer ? <p className="mt-5 border-t-(length:--frame) border-line pt-4 text-sm text-muted">{footer}</p> : null}
    </Card>
  );
}
