import { asDobleTipo, gameOf } from "@pokemon-minigames/shared";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import type { GameView } from "../../game/apply-event";
import { turnSummary } from "../../game/battle";
import {
  MENU_TEXT,
  AUCTION_TEXT,
  BATTLE_TEXT,
  auctionMoney,
  auctionSaleText,
  REMATCH_TEXT,
  ROOM_GONE_CODES,
  SILHOUETTE_SCREEN,
  TYPE_LABELS,
  errorMessage,
  rematchClosedMessage,
  rematchNoShow,
  rematchRequested,
  rematchWaiting,
  silhouetteReveal,
} from "../../i18n/es";
import { useGame, useServices } from "../../services";
import { AuctionView } from "./auction/AuctionView";
import { BattleScreen } from "./auction/BattleScreen";
import { LineupView } from "./auction/LineupView";
import { PauseView } from "./auction/PauseView";
import { RevealView } from "./auction/RevealView";
import { CountdownView } from "./CountdownView";
import { RematchLoadingView, RematchNoShow } from "./RematchLoadingView";
import { RoundResultView } from "./RoundResultView";
import { RoundView } from "./RoundView";
import { SilhouetteRevealView } from "./SilhouetteRevealView";
import { SilhouetteRoundView } from "./SilhouetteRoundView";
import { SummaryView, scoreLabel, verdictLabel } from "./SummaryView";
import { TypePickerView } from "./TypePickerView";
import { WaitingView } from "./WaitingView";
import { useRoom } from "./use-room";

/** Avisa de que el rival se cayó y cuánto tiempo tiene para volver antes de perder la partida. */
function OpponentAwayNotice() {
  const { view, opponent } = useRoom();
  const remaining = useCountdown(view.opponentGraceEndsAt, view.clockOffset);
  if (view.opponentGraceEndsAt === null || view.phase === "finished") return null;
  return (
    // Lo que cambia cada segundo (la cuenta atrás) va oculto para los lectores de pantalla: si no, repetirían el aviso.
    <Notice tone="danger" urgent>
      <span>{opponent?.username ?? "Tu oponente"} se desconectó.</span>{" "}
      <span aria-hidden="true">Tiene {secondsLeft(remaining)} s para volver.</span>
    </Notice>
  );
}

/** Lo que se anuncia de la revancha (tras el veredicto): quién espera a quién, si empieza o por qué no hubo. */
function rematchAnnouncement(view: GameView): string {
  const rival = view.players.find((player) => player.seat !== view.mySeat)?.username ?? "Tu rival";
  switch (view.rematchOffer?.status) {
    case "mine":
      return rematchWaiting(rival);
    case "theirs":
      return rematchRequested(rival);
    case "starting":
      return `${REMATCH_TEXT.loadingTitle} ${REMATCH_TEXT.loadingSub}`;
    case "closed":
      return rematchClosedMessage(view.rematchOffer.closedReason ?? "failed", rival) ?? "";
    default:
      return "";
  }
}

/** Lo que se anuncia a los lectores de pantalla al cambiar de fase (lo visual cambia, pero no se oye). */
function announcement(view: GameView): string {
  if (view.silhouette && view.phase === "round_active") return `Ronda ${view.silhouette.round?.number ?? ""}: ${SILHOUETTE_SCREEN.question}`;
  if (view.silhouette && view.phase === "round_result") return view.silhouette.lastReveal ? silhouetteReveal(view.silhouette.lastReveal.pokemon.names.es) : "";
  switch (view.phase) {
    case "lineup":
      return BATTLE_TEXT.lineupTitle;
    case "battle_pause":
      return BATTLE_TEXT.pauseTitle;
    case "battle": {
      // Una sola frase por turno: el registro completo saturaría a los lectores de pantalla.
      const battle = view.auction?.battle;
      if (!battle) return "";
      const last = view.battleLog[view.battleLog.length - 1];
      if (!last || last.round !== battle.round) {
        const nameIn = (team: typeof battle.myTeam, id: number | null) => team.find((one) => one.pokemon.id === id)?.pokemon.names.es ?? "";
        return BATTLE_TEXT.roundVersus(battle.round, nameIn(battle.myTeam, battle.myTitular), nameIn(battle.rivalTeam, battle.rivalTitular));
      }
      // Con el asalto y el turno delante, dos turnos con el mismo daño también se anuncian.
      const news = BATTLE_TEXT.turnNews(last.round, last.turn, turnSummary(last.actions, last.names));
      const end = view.lastRoundEnd?.round === battle.round ? view.lastRoundEnd : null;
      return end ? `${news} ${BATTLE_TEXT.fell(last.names[end.loser], end.atLimit)}` : news;
    }
    case "auction": {
      const nameOf = (seat: number | null) => view.players.find((player) => player.seat === seat)?.username ?? "Tu rival";
      const sale = view.lastSale;
      const lot = view.auction?.lot;
      const parts = sale ? [auctionSaleText(sale, nameOf(sale.winner))] : [];
      if (lot) {
        parts.push(AUCTION_TEXT.lotOf(lot.number));
        parts.push(`${lot.currentBid === null ? AUCTION_TEXT.startingPrice : AUCTION_TEXT.currentBid}: ${auctionMoney(lot.currentBid ?? lot.price)}`);
        parts.push(lot.turn === view.mySeat ? AUCTION_TEXT.youTurn : `${AUCTION_TEXT.rivalTurn(nameOf(lot.turn))}.`);
      }
      return parts.join(". ");
    }
    case "starting":
      return "La partida empieza.";
    case "choosing_types":
      return `Ronda ${view.round?.number ?? ""}: elige un tipo.`;
    case "round_active":
      return view.round?.pair
        ? `Ronda ${view.round.number}: ${TYPE_LABELS[view.round.pair[0]]} y ${TYPE_LABELS[view.round.pair[1]]}.`
        : "";
    case "finished": {
      if (!view.ended || view.mySeat === null) return "";
      if (view.isRematchRoom && view.ended.reason === "expired") {
        return rematchNoShow(view.players.find((player) => player.seat !== view.mySeat)?.username ?? "Tu rival");
      }
      if (view.ended.auction) return verdictLabel(view.ended, view.mySeat);
      return `${verdictLabel(view.ended, view.mySeat)}. ${scoreLabel(view.ended, view.mySeat)}`;
    }
    default:
      return "";
  }
}

function RoomView() {
  const { view } = useRoom();
  const isSilhouette = view.config !== null && gameOf(view.config) === "silueta";
  switch (view.phase) {
    case "waiting":
      // Una sala de revancha ya tiene a los dos sentados: no hay código que compartir, solo esperar a que entren.
      return view.isRematchRoom ? <RematchLoadingView /> : <WaitingView />;
    case "starting":
      return <CountdownView />;
    case "choosing_types":
      return <TypePickerView />;
    case "round_active":
      return isSilhouette ? <SilhouetteRoundView /> : <RoundView />;
    case "round_result":
      return isSilhouette ? <SilhouetteRevealView /> : <RoundResultView />;
    case "auction":
      return <AuctionView />;
    case "reveal":
      return <RevealView />;
    case "lineup":
      return <LineupView />;
    case "battle":
      return <BattleScreen />;
    case "battle_pause":
      return <PauseView />;
    case "finished":
      // Si la sala de la revancha caducó porque el rival no entró, no hubo partida: no hay veredicto.
      return view.isRematchRoom && view.ended?.reason === "expired" ? <RematchNoShow /> : <SummaryView />;
    default:
      return (
        <p role="status" className="text-center text-muted">
          Conectando con la sala…
        </p>
      );
  }
}

export function RoomPage() {
  const { code = "" } = useParams();
  const { game, names } = useServices();
  const navigate = useNavigate();
  const error = useGame((s) => s.view.lastError);
  const connection = useGame((s) => s.connection);
  const phase = useGame((s) => s.view.phase);
  const ended = useGame((s) => s.view.ended);
  const view = useGame((s) => s.view);
  const typeHints = useGame((s) => asDobleTipo(s.view.config)?.typeHints === true);
  const nextRoom = useGame((s) => s.view.nextRoom);
  // Con una oferta de revancha viva la sala sigue abierta: los avisos de conexión importan también en el resumen.
  const offerStatus = useGame((s) => s.view.rematchOffer?.status);
  const connectionMatters = phase !== "finished" || (offerStatus !== undefined && offerStatus !== "closed");

  useEffect(() => {
    game.client.join(code);
    // Al salir de la pantalla se cierra la conexión (y se limpia el estado).
    return () => game.client.dispose();
  }, [game.client, code]);

  // Los dos aceptaron la revancha: a la sala nueva (sin dejar la vieja en el historial del navegador).
  useEffect(() => {
    if (nextRoom) navigate(`/sala/${encodeURIComponent(nextRoom)}`, { replace: true });
  }, [nextRoom, navigate]);

  // Los tipos de cada Pokémon solo se piden en las salas con «Pistas de tipos»; sin ellas ni siquiera viajan. Se espera a
  // conocer la configuración: pedir antes descargaba la lista sin tipos y luego otra vez con ellos.
  const configKnown = useGame((s) => s.view.config !== null);
  useEffect(() => {
    if (configKnown) void names.getState().load({ withTypes: typeHints });
  }, [names, typeHints, configKnown]);

  // La sala ya no existe, terminó o no eres parte de ella: no hay nada más que hacer aquí.
  // Con la partida terminada el resumen se queda: el servidor ya cerró la sala y es lo esperable.
  const gone = error !== null && ROOM_GONE_CODES.includes(error.code);
  // Pulsar justo cuando el turno cambió no es un fallo: la pantalla ya muestra de quién es.
  const lateBid = (phase === "auction" || phase === "reveal" || phase === "battle") && (error?.code === "NOT_YOUR_TURN" || error?.code === "WRONG_PHASE");
  if (error && gone && !ended) {
    return (
      <section className="mx-auto max-w-md text-center">
        <Notice tone="danger">{errorMessage(error.code)}</Notice>
        <div className="mt-4">
          {/* Lleva al menú (sin la sala no se sabe de qué juego era): el botón lo dice. */}
          <Button variant="primary" onClick={() => navigate("/")}>
            {MENU_TEXT.backToMenu}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="log" aria-label="Anuncios de la partida" className="sr-only">
        {announcement(view)}
      </p>
      {/* La revancha va aparte: si cambia la oferta, no se vuelve a leer el veredicto. */}
      <p role="log" aria-label="Anuncios de la revancha" className="sr-only">
        {phase === "finished" && !(view.isRematchRoom && ended?.reason === "expired") ? rematchAnnouncement(view) : ""}
      </p>
      {connection === "disconnected" && connectionMatters ? <Notice>Conexión perdida. Reconectando…</Notice> : null}
      {connection === "replaced" && connectionMatters ? (
        <Notice
          action={
            <Button variant="primary" onClick={() => game.client.join(code)}>
              Jugar aquí
            </Button>
          }
        >
          <span>Abriste esta partida en otra pestaña.</span>
        </Notice>
      ) : null}
      <OpponentAwayNotice />
      {error && !gone && !lateBid ? <Notice tone="danger">{errorMessage(error.code)}</Notice> : null}
      <RoomView />
    </div>
  );
}
