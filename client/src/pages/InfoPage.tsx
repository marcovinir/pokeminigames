import { Link } from "react-router";
import { Card } from "../components/Card";
import { rise } from "../components/rise";
import { INFO_PAGES, type InfoSlug } from "../i18n/info";
import { useSession } from "../services";

/** Una página del pie (Acerca de, Privacidad…): pública; «Volver» lleva al menú con sesión y a la entrada sin ella. */
export function InfoPage({ slug }: { slug: InfoSlug }) {
  const status = useSession((s) => s.status);
  const page = INFO_PAGES[slug];
  return (
    <article style={rise(0)} className="animate-rise mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold">{page.title}</h1>
      <Card className="flex flex-col gap-4 p-5 leading-relaxed">{page.body}</Card>
      <div>
        <Link to={status === "authenticated" ? "/" : "/login"} className="font-semibold text-accent underline">
          Volver
        </Link>
      </div>
    </article>
  );
}
