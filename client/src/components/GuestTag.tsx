import { Badge } from "./Badge";

/** Marca a quien juega sin cuenta. Es texto, no solo color: se lee igual en cualquier tema y con lector de pantalla. */
export function GuestTag({ className = "" }: { className?: string }) {
  return <Badge className={`shrink-0 ${className}`}>Invitado</Badge>;
}
