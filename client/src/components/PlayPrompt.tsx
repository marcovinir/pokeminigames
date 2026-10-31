import { Link } from "react-router";
import { TYPES_TEXT } from "../i18n/es";
import { useSession } from "../services";

/** En las páginas públicas, para quien no tiene sesión: el camino a jugar. */
export function PlayPrompt() {
  const anonymous = useSession((s) => s.status === "anonymous");
  if (!anonymous) return null;
  return (
    <p className="text-sm">
      {TYPES_TEXT.playPrompt}{" "}
      <Link to="/login" className="font-semibold text-accent underline underline-offset-4">
        {TYPES_TEXT.playLink}
      </Link>
    </p>
  );
}
