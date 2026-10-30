import type { BaseStats, EvolutionNode, LocalizedText, PokedexDetail } from "@pokemon-minigames/shared";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router";
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
import { POKEDEX_TEXT, STAT_LABELS, evolutionConditionText } from "../../i18n/es";
import { useServices } from "../../services";

const LAST_POKEMON = 1025;
/** La stat más alta posible: las barras se comparan entre Pokémon, no solo dentro de uno. */
const MAX_STAT = 255;
const STAT_ORDER: (keyof BaseStats)[] = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

type Loaded = { id: number; status: "ready"; detail: PokedexDetail } | { id: number; status: "missing" } | { id: number; status: "failed" };

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

function Evolution({ node, current }: { node: EvolutionNode; current: number }) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-2 sm:flex-row">
      {node.condition ? <span className="text-center text-xs text-muted">{evolutionConditionText(node.condition)}</span> : null}
      {node.id === current ? (
        <span aria-current="page" className="rounded-ui bg-surface-2 px-3 py-1.5 font-display font-semibold">
          {node.name}
        </span>
      ) : (
        <Link to={`/pokedex/${node.id}`} className="rounded-ui px-3 py-1.5 font-display font-semibold text-accent underline underline-offset-4">
          {node.name}
        </Link>
      )}
      {node.next.length > 0 ? (
        <ul className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
          {node.next.map((next) => (
            <Evolution key={next.id} node={next} current={current} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Details({ detail }: { detail: PokedexDetail }) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        <ArtImage id={detail.id} spriteUrl={detail.spriteUrl} size={144} eager />
        <div className="min-w-0">
          <p className="text-sm text-muted">
            <span className="font-num">{pokedexNumber(detail.id)}</span> · <span>{POKEDEX_TEXT.generationName(detail.generation)}</span>
          </p>
          <h1 className="font-display text-3xl font-semibold [overflow-wrap:anywhere]">{detail.names.es}</h1>
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
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-surface-2">
                <div style={{ width: `${(detail.stats[stat] / MAX_STAT) * 100}%` }} className="h-full rounded-pill bg-accent" />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[6rem_2.5rem_1fr] items-center gap-2 border-t border-line pt-2 text-sm font-semibold">
            <dt>{POKEDEX_TEXT.total}</dt>
            <dd className="text-right font-num tabular-nums">{detail.total}</dd>
          </div>
        </dl>
      </Block>

      <DamageList types={detail.types} />

      <Block title={POKEDEX_TEXT.evolutions}>
        {detail.evolution.next.length === 0 ? (
          <p className="text-sm">{POKEDEX_TEXT.noEvolution}</p>
        ) : (
          <ul className="flex flex-col items-center gap-2 sm:items-start">
            <Evolution node={detail.evolution} current={detail.id} />
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

  const load = useCallback(
    (wanted: number, isCurrent: () => boolean) => {
      endpoints.catalog.dexEntry(wanted).then(
        (detail) => {
          if (isCurrent()) setLoaded({ id: wanted, status: "ready", detail });
        },
        (error: unknown) => {
          if (isCurrent()) setLoaded({ id: wanted, status: error instanceof ApiError && error.status === 404 ? "missing" : "failed" });
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
  const backToList = (
    <Link to="/pokedex" className="font-semibold text-accent underline underline-offset-4">
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
              <Link to={`/pokedex/${id - 1}`} className="font-semibold text-accent underline underline-offset-4">
                {POKEDEX_TEXT.previous}
              </Link>
            ) : null}
            {id < LAST_POKEMON ? (
              <Link to={`/pokedex/${id + 1}`} className="font-semibold text-accent underline underline-offset-4">
                {POKEDEX_TEXT.next}
              </Link>
            ) : null}
          </span>
        ) : null}
      </nav>
      <PlayPrompt />
      {id === null || shown?.status === "missing" ? (
        <Notice>{POKEDEX_TEXT.notFound}</Notice>
      ) : shown?.status === "failed" ? (
        <Notice tone="danger" action={<Button onClick={() => setAttempt((count) => count + 1)}>{POKEDEX_TEXT.retry}</Button>}>
          {POKEDEX_TEXT.loadDetailError}
        </Notice>
      ) : shown?.status === "ready" ? (
        <Details detail={shown.detail} />
      ) : (
        <p role="status" className="text-center text-muted">
          {POKEDEX_TEXT.loadingDetail}
        </p>
      )}
    </div>
  );
}
