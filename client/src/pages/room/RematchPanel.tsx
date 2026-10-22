import type { RematchRecord } from "@pokemon-minigames/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { GuestTag } from "../../components/GuestTag";
import { Notice } from "../../components/Notice";
import { secondsLeft, useCountdown } from "../../game/clock";
import { REMATCH_RESPONSE_MS } from "../../game/durations";
import {
  RECENT_RESULT_LABELS,
  REMATCH_TEXT,
  recordHeadline,
  recordTitle,
  rematchClosedMessage,
  rematchRequested,
  rematchSecondsLeft,
  rematchWaiting,
} from "../../i18n/es";
import { factText } from "../../i18n/facts";
import { useFacts, useServices } from "../../services";
import { useRoom } from "./use-room";

/** Cada cuánto cambia el dato curioso. */
const FACT_EVERY_MS = 6000;

const RESULT_CHIP = {
  won: "bg-success-bg text-success",
  lost: "bg-danger-bg text-danger",
  drawn: "bg-surface-2 text-fg",
} as const;

/** El récord entre los dos (solo entre cuentas): el marcador grande, como un cartel de combate, y las últimas partidas. */
function RecordCard({ record, me, rival }: { record: RematchRecord; me: string; rival: string }) {
  return (
    <Card as="section" aria-label={`Récord contra ${rival}`} className="p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted [overflow-wrap:anywhere]">{recordTitle(rival)}</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <Avatar name={me} size="sm" />
        <p className="font-num text-4xl font-semibold tabular-nums">{`${record.mine} – ${record.theirs}`}</p>
        <Avatar name={rival} size="sm" />
      </div>
      <p className="mt-1 text-sm text-muted">{recordHeadline(record, rival)}</p>
      {record.recent.length > 0 ? (
        <ol aria-label="Últimas partidas" className="mt-3 flex flex-wrap justify-center gap-1.5">
          {record.recent.map((result, index) => (
            <li
              key={index}
              aria-label={RECENT_RESULT_LABELS[result].name}
              className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${RESULT_CHIP[result]}`}
            >
              {RECENT_RESULT_LABELS[result].short}
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

/** Los índices de 0 a length − 1 en un orden al azar. */
function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** Un dato curioso que cambia cada pocos segundos, sin repetir hasta agotarlos. No es una región viva: no interrumpe. */
function FactCard() {
  const { facts } = useServices();
  const list = useFacts((s) => s.facts);
  const [turn, setTurn] = useState<{ order: number[]; position: number }>({ order: [], position: 0 });

  useEffect(() => {
    void facts.getState().load();
  }, [facts]);

  useEffect(() => {
    if (list.length === 0) return;
    setTurn({ order: shuffled(list.length), position: 0 });
    const timer = setInterval(() => {
      setTurn((current) =>
        current.position + 1 < current.order.length ? { ...current, position: current.position + 1 } : { order: shuffled(list.length), position: 0 },
      );
    }, FACT_EVERY_MS);
    return () => clearInterval(timer);
  }, [list]);

  const fact = list[turn.order[turn.position] ?? -1];
  if (!fact) return null;
  return (
    <Card as="section" aria-label={REMATCH_TEXT.factsLabel} className="border-dashed p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{REMATCH_TEXT.factsLabel}</p>
      <p data-fact className="mt-1 text-sm">
        {factText(fact)}
      </p>
    </Card>
  );
}

/** Cuánto le queda a la oferta: el texto y la barra son visuales (los lectores de pantalla no oyen cada segundo). */
function OfferCountdown({ deadline, offset }: { deadline: number | null; offset: number }) {
  const remaining = useCountdown(deadline, offset);
  const fraction = Math.min(1, remaining / REMATCH_RESPONSE_MS);
  return (
    <>
      <p aria-hidden="true" className="mt-1 text-sm text-muted">
        {rematchSecondsLeft(secondsLeft(remaining))}
      </p>
      <div aria-hidden="true" data-rematch-bar className="mx-auto mt-2 h-1.5 w-full max-w-64 overflow-hidden rounded-pill bg-surface-2">
        <div style={{ width: `${fraction * 100}%` }} className="h-full rounded-pill bg-accent transition-[width] duration-300 ease-linear" />
      </div>
    </>
  );
}

/**
 * El bloque de revancha del resumen. Sin oferta no se ve nada; `open`: el botón «Revancha»; `mine`/`theirs`: la espera
 * (récord, quién decide y cuánto queda, y un dato curioso); `closed`: el aviso de por qué no hubo revancha.
 */
export function RematchPanel() {
  const { view, me, opponent, client } = useRoom();
  const offer = view.rematchOffer;
  const rival = opponent?.username ?? "Tu rival";
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const status = offer?.status;

  // Al pasar a esperar o a decidir el foco va al título: el botón que se pulsó desaparece y el lector de pantalla sigue ahí.
  useEffect(() => {
    if (status === "mine" || status === "theirs") headingRef.current?.focus();
  }, [status]);

  if (!offer || offer.status === "starting") return null;

  if (offer.status === "open") {
    return (
      <div className="flex justify-center">
        <Button variant="primary" size="lg" onClick={() => client.requestRematch()}>
          {REMATCH_TEXT.request}
        </Button>
      </div>
    );
  }

  if (offer.status === "closed") {
    const message = rematchClosedMessage(offer.closedReason ?? "failed", rival);
    return message ? <Notice>{message}</Notice> : null;
  }

  const mine = offer.status === "mine";
  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-col gap-3">
      {offer.record ? <RecordCard record={offer.record} me={me?.username ?? "Tú"} rival={rival} /> : null}
      <Card as="section" aria-labelledby={headingId} className="p-4 text-center">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="min-w-0 font-display text-lg font-semibold [overflow-wrap:anywhere]">
            {mine ? rematchWaiting(rival) : rematchRequested(rival)}
          </h2>
          {opponent?.guest ? <GuestTag /> : null}
        </div>
        <OfferCountdown deadline={offer.deadline} offset={view.clockOffset} />
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {mine ? (
            <Button variant="secondary" onClick={() => client.cancelRematch()}>
              {REMATCH_TEXT.cancel}
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => client.requestRematch()}>
                {REMATCH_TEXT.accept}
              </Button>
              <Button variant="secondary" onClick={() => client.cancelRematch()}>
                {REMATCH_TEXT.decline}
              </Button>
            </>
          )}
        </div>
      </Card>
      <FactCard />
    </div>
  );
}
