import { type GameResult, type HistoryEntry, isDeletedUsername } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { DELETED_ACCOUNT_NAME, RESULT_LABELS, describeConfig, historyReason } from "../../i18n/es";
import { useServices } from "../../services";
import { formatDate, formatScore } from "./format";
import { useLoad } from "./use-load";

const RESULT_TONE: Record<GameResult, "success" | "neutral" | "danger"> = {
  won: "success",
  drawn: "neutral",
  lost: "danger",
};

function HistoryRow({ game }: { game: HistoryEntry }) {
  // Una cuenta borrada no tiene perfil ni nombre que enseñar.
  const deleted = isDeletedUsername(game.opponent.username);
  return (
    // tabIndex -1: se puede enfocar por código (al cargar más partidas) sin entrar en el orden de tabulación.
    <li tabIndex={-1} className="framed rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={deleted ? DELETED_ACCOUNT_NAME : game.opponent.username} avatarId={game.opponent.avatarId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            contra{" "}
            {deleted ? (
              <span className="font-semibold">{DELETED_ACCOUNT_NAME}</span>
            ) : (
              <Link to={`/jugador/${encodeURIComponent(game.opponent.username)}`} className="font-semibold underline">
                {game.opponent.username}
              </Link>
            )}
          </p>
          <p className="text-sm text-muted">{historyReason(game.reason, game.result)}</p>
        </div>
        <div className="text-right">
          <Badge tone={RESULT_TONE[game.result]}>{RESULT_LABELS[game.result]}</Badge>
          <p className="mt-1 font-num text-lg font-semibold tabular-nums">{`${formatScore(game.myScore)} – ${formatScore(game.opponentScore)}`}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{describeConfig(game.config)}</p>
      <p className="text-xs text-muted">
        <time dateTime={game.endedAt}>{formatDate(game.endedAt)}</time>
      </p>
    </li>
  );
}

/** Tus partidas completadas, de la más reciente a la más antigua, de a páginas con "Cargar más". */
export function HistoryList() {
  const { endpoints } = useServices();
  const navigate = useNavigate();
  const first = useLoad(() => endpoints.stats.history({ before: null }), [endpoints]);
  const [more, setMore] = useState<{ games: HistoryEntry[]; cursor: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLOListElement>(null);
  /** Posición de la primera partida de la página recién cargada, para llevarle el foco. */
  const focusIndex = useRef<number | null>(null);

  // El botón "Cargar más" desaparece con la última página y con él se iría el foco: pasa a la primera partida nueva.
  useEffect(() => {
    if (focusIndex.current === null) return;
    (list.current?.children[focusIndex.current] as HTMLElement | undefined)?.focus();
    focusIndex.current = null;
  }, [more]);

  async function loadMore(cursor: string, shown: number): Promise<void> {
    if (pending) return;
    setPending(true);
    setMoreFailed(false);
    try {
      const page = await endpoints.stats.history({ before: cursor });
      focusIndex.current = shown;
      setAnnouncement(
        page.games.length === 0
          ? "No hay más partidas."
          : page.games.length === 1
            ? "Se cargó 1 partida más."
            : `Se cargaron ${page.games.length} partidas más.`,
      );
      setMore((previous) => ({ games: [...(previous?.games ?? []), ...page.games], cursor: page.nextCursor }));
    } catch {
      setMoreFailed(true);
    } finally {
      setPending(false);
    }
  }

  let body;
  if (first.state.status === "loading") {
    body = (
      <p role="status" className="text-sm text-muted">
        Cargando historial…
      </p>
    );
  } else if (first.state.status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="danger">No se pudo cargar el historial.</Notice>
        <Button onClick={first.reload}>Reintentar el historial</Button>
      </div>
    );
  } else {
    const games = [...first.state.data.games, ...(more?.games ?? [])];
    const cursor = more ? more.cursor : first.state.data.nextCursor;
    body =
      games.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Cuando juegues, tus partidas aparecerán aquí.</p>
          <Button variant="primary" onClick={() => navigate("/")}>
            Crear una sala
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol ref={list} aria-label="Historial de partidas" className="flex flex-col gap-3">
            {games.map((game) => (
              <HistoryRow key={game.id} game={game} />
            ))}
          </ol>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {moreFailed ? <Notice tone="danger">No se pudo cargar la siguiente página.</Notice> : null}
          {cursor ? (
            <div className="text-center">
              <Button loading={pending} onClick={() => void loadMore(cursor, games.length)}>
                Cargar más
              </Button>
            </div>
          ) : null}
        </div>
      );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">Historial</h2>
      {body}
    </section>
  );
}
