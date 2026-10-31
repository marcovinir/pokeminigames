import type { BaseStats, EvolutionNode, LocalizedText, PokedexDetail } from "@pokemon-minigames/shared";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { pokedexNumber } from "../../catalog/pokedex";
import { ArtImage } from "../../components/ArtImage";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DamageList } from "../../components/DamageList";
import { Notice } from "../../components/Notice";
import { PlayPrompt } from "../../components/PlayPrompt";
import { TypeChip } from "../../components/TypeChip";
import { rise } from "../../components/rise";
import { usePageTitle } from "../../components/use-page-title";
import { POKEDEX_TEXT, STAT_LABELS, evolutionConditionText } from "../../i18n/es";
import { useServices } from "../../services";
import { dexErrorMessage } from "./dex-error";

/** De qué búsqueda de la lista se vino: se conserva al pasar de un Pokémon a otro. */
interface DexLinkState {
  fromSearch: string;
}

const LAST_POKEMON = 1025;
/** La stat más alta posible: las barras se comparan entre Pokémon, no solo dentro de uno. */
const MAX_STAT = 255;
const STAT_ORDER: (keyof BaseStats)[] = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

type Loaded = { id: number; status: "ready"; detail: PokedexDetail } | { id: number; status: "missing" } | { id: number; status: "failed"; message: string };

function Block({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="min-w-0 p-5">
      <h2 id={titleId} className="font-display text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function OfficialText({ text }: { text: LocalizedText }) {
  return (
    <>
      {text.text}
      {text.language === "en" ? <span className="ml-1 text-muted">{POKEDEX_TEXT.inEnglish}</span> : null}
    </>
  );
}

/** Una etapa y, dentro de ella, lo que sale de ella: la sangría y la línea dicen de quién viene cada rama, en cualquier ancho. */
function Evolution({ node, current, state }: { node: EvolutionNode; current: number; state: DexLinkState | null }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {node.id === current ? (
          <span aria-current="page" className="rounded-ui bg-surface-2 px-3 py-1.5 font-display font-semibold">
            {node.name}
          </span>
        ) : (
          <Link to={`/pokedex/${node.id}`} state={state} className="rounded-ui px-3 py-1.5 font-display font-semibold text-accent underline underline-offset-4">
            {node.name}
          </Link>
        )}
        {node.condition ? <span className="text-xs text-muted">{evolutionConditionText(node.condition)}</span> : null}
      </div>
      {node.next.length > 0 ? (
        <ul className="mt-2 ml-3 flex min-w-0 flex-col gap-2 border-l-2 border-line pl-3">
          {node.next.map((next) => (
            <Evolution key={next.id} node={next} current={current} state={state} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Details({ detail, state }: { detail: PokedexDetail; state: DexLinkState | null }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // El enlace de evolución que se pulsó desaparece con la ficha vieja: el foco va al nombre en vez de perderse.
  useEffect(() => {
    if (document.activeElement === null || document.activeElement === document.body) titleRef.current?.focus();
  }, [detail.id]);
  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        <ArtImage id={detail.id} spriteUrl={detail.spriteUrl} size={144} eager />
        <div className="min-w-0">
          <p className="text-sm text-muted">
            <span className="font-num">{pokedexNumber(detail.id)}</span> · <span>{POKEDEX_TEXT.generationName(detail.generation)}</span>
          </p>
          <h1 ref={titleRef} tabIndex={-1} className="font-display text-3xl font-semibold outline-none [overflow-wrap:anywhere]">
            {detail.names.es}
          </h1>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {detail.types.map((type) => (
              <TypeChip key={type} type={type} />
            ))}
          </p>
        </div>
      </header>

      <Block title={POKEDEX_TEXT.stats}>
        <dl className="flex flex-col gap-2">
          {STAT_ORDER.map((stat) => (
            <div key={stat} className="grid grid-cols-[6rem_2.5rem_1fr] items-center gap-2 text-sm">
              <dt>{STAT_LABELS[stat]}</dt>
              <dd className="text-right font-num font-semibold tabular-nums">{detail.stats[stat]}</dd>
              <dd aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-surface-2">
                <div style={{ width: `${(detail.stats[stat] / MAX_STAT) * 100}%` }} className="h-full rounded-pill bg-accent" />
              </dd>
            </div>
          ))}
          <div className="grid grid-cols-[6rem_2.5rem_1fr] items-center gap-2 border-t border-line pt-2 text-sm font-semibold">
            <dt>{POKEDEX_TEXT.total}</dt>
            <dd className="text-right font-num tabular-nums">{detail.total}</dd>
          </div>
        </dl>
      </Block>

      <Card className="min-w-0 p-5">
        <DamageList types={detail.types} />
      </Card>

      <Block title={POKEDEX_TEXT.evolutions}>
        {detail.evolution.next.length === 0 ? (
          <p className="text-sm">{POKEDEX_TEXT.noEvolution}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            <Evolution node={detail.evolution} current={detail.id} state={state} />
          </ul>
        )}
      </Block>

      <Block title={POKEDEX_TEXT.abilities}>
        <ul className="flex flex-col gap-3 text-sm">
          {detail.abilities.map((ability) => (
            <li key={ability.name}>
              <span className="font-semibold">{ability.name}</span>
              {ability.hidden ? <span className="ml-1 text-muted">{POKEDEX_TEXT.hiddenAbility}</span> : null}
              {ability.description ? (
                <p>
                  <OfficialText text={ability.description} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Block>

      {detail.lore ? (
        <Block title={POKEDEX_TEXT.lore}>
          <p className="text-sm">
            <OfficialText text={detail.lore} />
          </p>
          <p className="mt-1 text-xs text-muted">{POKEDEX_TEXT.loreSource(detail.lore.game)}</p>
        </Block>
      ) : null}

      <p className="text-xs text-muted">{POKEDEX_TEXT.credit}</p>
    </>
  );
}

/** La ficha de un Pokémon: pública, con su propia dirección para poder compartirla. */
export function PokemonPage() {
  const { endpoints } = useServices();
  const { id: rawId = "" } = useParams();
  const id = /^\d+$/.test(rawId) && Number(rawId) >= 1 && Number(rawId) <= LAST_POKEMON ? Number(rawId) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fromList = useLocation().state as DexLinkState | null;
  const linkState = fromList?.fromSearch ? fromList : null;

  const load = useCallback(
    (wanted: number, isCurrent: () => boolean) => {
      endpoints.catalog.dexEntry(wanted).then(
        (detail) => {
          if (isCurrent()) setLoaded({ id: wanted, status: "ready", detail });
        },
        (error: unknown) => {
          if (isCurrent()) setLoaded(error instanceof ApiError && error.status === 404 ? { id: wanted, status: "missing" } : { id: wanted, status: "failed", message: dexErrorMessage(error, POKEDEX_TEXT.loadDetailError) });
        },
      );
    },
    [endpoints],
  );

  useEffect(() => {
    if (id === null) return;
    let current = true;
    load(id, () => current);
    return () => {
      current = false;
    };
  }, [id, attempt, load]);

  // Lo guardado de otro Pokémon no vale: mientras llega el nuevo, se dice que carga.
  const shown = loaded?.id === id ? loaded : null;
  const ready = shown?.status === "ready" ? shown.detail : null;
  usePageTitle(ready?.names.es ?? POKEDEX_TEXT.title);
  const backToList = (
    <Link to={`/pokedex${linkState?.fromSearch ?? ""}`} state={{ restoreScroll: true }} className="font-semibold text-accent underline underline-offset-4">
      {POKEDEX_TEXT.backToList}
    </Link>
  );

  return (
    <div style={rise(0)} className="animate-rise mx-auto flex max-w-2xl flex-col gap-5">
      <nav aria-label={POKEDEX_TEXT.navigation} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {backToList}
        {id !== null ? (
          <span className="flex gap-3">
            {id > 1 ? (
              <Link to={`/pokedex/${id - 1}`} state={linkState} className="font-semibold text-accent underline underline-offset-4">
                {POKEDEX_TEXT.previous}
              </Link>
            ) : null}
            {id < LAST_POKEMON ? (
              <Link to={`/pokedex/${id + 1}`} state={linkState} className="font-semibold text-accent underline underline-offset-4">
                {POKEDEX_TEXT.next}
              </Link>
            ) : null}
          </span>
        ) : null}
      </nav>
      <PlayPrompt />
      {/* La región existe desde el principio para que se anuncie cada Pokémon nuevo al pasar de ficha. */}
      <p role="status" data-testid="dex-announcer" className="sr-only">
        {ready?.names.es ?? ""}
      </p>
      {ready ? null : <h1 className="sr-only">{POKEDEX_TEXT.title}</h1>}
      {id === null || shown?.status === "missing" ? (
        <Notice>{POKEDEX_TEXT.notFound}</Notice>
      ) : shown?.status === "failed" ? (
        <Notice tone="danger" action={<Button
              onClick={() => {
                setLoaded(null);
                setAttempt((count) => count + 1);
              }}
            >{POKEDEX_TEXT.retry}</Button>}>
          {shown.message}
        </Notice>
      ) : shown?.status === "ready" ? (
        <Details detail={shown.detail} state={linkState} />
      ) : (
        <p role="status" className="text-center text-muted">
          {POKEDEX_TEXT.loadingDetail}
        </p>
      )}
    </div>
  );
}
