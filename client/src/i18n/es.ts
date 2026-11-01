import { type AuctionSalePayload,
  type BaseStats,
  type DobleTipoConfig,
  type ErrorCode,
  GENERATIONS,
  type GameEndReason,
  type GameKind,
  type GameResult,
  type PickResult,
  type RematchClosedReason,
  type RematchRecord,
  type SilhouetteConfig,
  type EvolutionCondition,
  type TypeName,
} from "@pokemon-minigames/shared";

export const TYPE_LABELS: Record<TypeName, string> = {
  normal: "normal",
  fighting: "lucha",
  flying: "volador",
  poison: "veneno",
  ground: "tierra",
  rock: "roca",
  bug: "bicho",
  ghost: "fantasma",
  steel: "acero",
  fire: "fuego",
  water: "agua",
  grass: "planta",
  electric: "eléctrico",
  psychic: "psíquico",
  ice: "hielo",
  dragon: "dragón",
  dark: "siniestro",
  fairy: "hada",
};

export const NETWORK_ERROR = "NETWORK";

const ERROR_MESSAGES: Record<ErrorCode | typeof NETWORK_ERROR, string> = {
  VALIDATION_ERROR: "Revisa los datos: hay algo que no es válido.",
  EMAIL_TAKEN: "Ese email ya está registrado.",
  USERNAME_TAKEN: "Ese nombre de usuario ya está en uso.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  WRONG_PASSWORD: "La contraseña no es correcta.",
  UNAUTHORIZED: "Tu sesión expiró. Inicia sesión de nuevo.",
  FORBIDDEN: "Esa petición no está permitida desde este sitio.",
  ACCOUNT_REQUIRED: "Necesitas una cuenta para esto.",
  INVALID_REFRESH_TOKEN: "Tu sesión expiró. Inicia sesión de nuevo.",
  NOT_FOUND: "No encontramos lo que buscas.",
  USER_NOT_FOUND: "No encontramos a ese jugador.",
  NOT_YOUR_TURN: "Aún no es tu turno.",
  INVALID_BID: "Esa puja no es válida.",
  INVALID_CHOICE: "Esa elección no es válida.",
  POKEMON_NOT_FOUND: "Ese Pokémon no existe.",
  INTERNAL_ERROR: "Algo falló en el servidor. Inténtalo de nuevo.",
  ALREADY_IN_GAME: "Ya estás en una partida. Vuelve a ella desde el lobby.",
  ROOM_NOT_FOUND: "Esa sala no existe o ya terminó.",
  ROOM_FULL: "Esa sala ya está llena.",
  ROOM_CLOSED: "Esa sala ya empezó o se cerró.",
  NAME_IN_USE: "Ya hay alguien con ese nombre en la sala. Entra con otro nombre.",
  NOT_IN_ROOM: "No participas en esa sala.",
  WRONG_PHASE: "Ahora no puedes hacer eso.",
  ALREADY_ANSWERED: "Ya enviaste tu respuesta en esta ronda.",
  ALREADY_CHOSEN: "Ya elegiste tu tipo en esta ronda.",
  INVALID_TYPE: "Ese tipo no existe.",
  SILHOUETTE_NOT_FOUND: "Esa silueta no existe.",
  SILHOUETTE_UNAVAILABLE: "No se pudo cargar la silueta.",
  RATE_LIMITED: "Vas muy rápido. Espera un momento.",
  NETWORK: "No se pudo conectar con el servidor. Revisa tu conexión.",
};

/** Mensaje en español para un código de error; cualquier código desconocido da uno genérico. */
export function errorMessage(code: string | undefined): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES];
  return ERROR_MESSAGES.INTERNAL_ERROR;
}

/** Los segundos que el servidor pide esperar (`details.retryAfterSeconds` de un 429), si vienen como número. */
export function retryAfterOf(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" ? value : undefined;
}

/** "Demasiados intentos. Inténtalo de nuevo en 9 min."; sin una espera usable, sin número. */
export function rateLimitMessage(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return "Demasiados intentos. Inténtalo de nuevo más tarde.";
  }
  const wait = retryAfterSeconds < 60 ? `${Math.ceil(retryAfterSeconds)} s` : `${Math.ceil(retryAfterSeconds / 60)} min`;
  return `Demasiados intentos. Inténtalo de nuevo en ${wait}.`;
}

/** Errores tras los que tiene sentido salir de la sala y volver al lobby. */
export const ROOM_GONE_CODES: readonly string[] = ["ROOM_NOT_FOUND", "NOT_IN_ROOM", "ROOM_CLOSED"];

export const PICK_RESULT_LABELS: Record<PickResult, string> = {
  VALID: "Acertó",
  NOT_FOUND: "Ese Pokémon no existe",
  WRONG_TYPES: "No tiene esos dos tipos",
  ALREADY_OWNED: "Ya estaba en su equipo",
  TAKEN: "Otro jugador lo tenía",
  NO_ANSWER: "No respondió",
};

export const END_REASON_LABELS: Record<GameEndReason, string> = {
  completed: "La partida terminó",
  forfeit: "Un jugador abandonó la partida",
  disconnect: "Un jugador se desconectó",
  exhausted: "No quedaron más pares de tipos jugables",
  cancelled: "La sala se canceló",
  expired: "La sala caducó",
  abandoned: "La partida se abandonó",
};

/** El motivo del final según el juego: en la silueta, «exhausted» es que no quedaban Pokémon (no pares de tipos). */
export function endReasonLabel(reason: GameEndReason, silhouette: boolean): string {
  return silhouette && reason === "exhausted" ? "No quedaron más Pokémon por adivinar" : END_REASON_LABELS[reason];
}

export const TYPE_ABBREVIATIONS: Record<TypeName, string> = {
  normal: "Nor",
  fighting: "Luc",
  flying: "Vol",
  poison: "Ven",
  ground: "Tie",
  rock: "Roc",
  bug: "Bic",
  ghost: "Fan",
  steel: "Ace",
  fire: "Fue",
  water: "Agu",
  grass: "Pla",
  electric: "Elé",
  psychic: "Psí",
  ice: "Hie",
  dragon: "Dra",
  dark: "Sin",
  fairy: "Had",
};

export const LOAD_ERROR_TEXT = {
  message: "No se pudo cargar esta página. Puede que haya una versión nueva o que falle la conexión.",
  reload: "Recargar",
} as const;

export const POKEDEX_TEXT = {
  title: "Pokédex",
  filters: "Filtros",
  filtersWithCount: (count: number) => `Filtros (${count})`,
  count: (count: number) => `${count} Pokémon`,
  search: "Buscar",
  searchHint: "Nombre o número",
  firstType: "Tipo 1",
  secondType: "Tipo 2",
  generation: "Generación",
  allGenerations: "Todas",
  generationName: (generation: number) => `${generation}.ª generación`,
  generationTab: (generation: number) => `${generation}.ª`,
  sort: "Ordenar por",
  sorts: { numero: "Número", nombre: "Nombre", total: "Total de stats" },
  listLabel: "Pokémon",
  showMore: "Ver más",
  noMatches: "No hay Pokémon con esos filtros.",
  clearFilters: "Limpiar filtros",
  loading: "Cargando la Pokédex…",
  loadError: "No se pudo cargar la Pokédex. Revisa tu conexión.",
  retry: "Reintentar",
  stats: "Estadísticas base",
  total: "Total",
  evolutions: "Evoluciones",
  noEvolution: "No evoluciona.",
  abilities: "Habilidades",
  hiddenAbility: "(oculta)",
  lore: "Descripción",
  loreSource: (game: string) => `Pokédex de ${game}`,
  inEnglish: "(en inglés)",
  credit: "Textos oficiales de los juegos de Pokémon, © Nintendo / Game Freak / Creatures. Datos vía PokeAPI.",
  notFound: "Ese Pokémon no existe.",
  backToList: "Volver a la Pokédex",
  navigation: "Navegación de la Pokédex",
  previous: "Anterior",
  next: "Siguiente",
  loadingDetail: "Cargando…",
  loadDetailError: "No se pudo cargar este Pokémon. Revisa tu conexión.",
} as const;

const TIME_OF_DAY = { day: "de día", night: "de noche" } as const;

/** Cómo se evoluciona, en pocas palabras. */
export function evolutionConditionText(condition: EvolutionCondition): string {
  const when = "timeOfDay" in condition && condition.timeOfDay ? `, ${TIME_OF_DAY[condition.timeOfDay]}` : "";
  switch (condition.kind) {
    case "level":
      return `nivel ${condition.level}${when}`;
    case "item":
      return `con ${condition.item}`;
    case "trade":
      return "por intercambio";
    case "friendship":
      return `por amistad${when}`;
    case "other":
      return "condición especial";
  }
}

export const HEADER_MENU_TEXT = {
  button: "Menú",
  sections: "Secciones",
  appearance: "Apariencia",
  logIn: "Iniciar sesión",
  register: "Crear cuenta",
  profile: "Mi perfil",
  logOut: "Cerrar sesión",
} as const;

export const TYPES_TEXT = {
  title: "Matriz de Tipos",
  first: "Tipo 1",
  second: "Tipo 2",
  none: "Ninguno",
  damageTitle: "Daño que recibe",
  chartTitle: "Todos los tipos",
  chartHint: "En cada fila, el tipo que ataca; en cada columna, el que recibe.",
  chartLabel: "Tabla de efectividad de tipos",
  cornerLabel: "Ataca / recibe",
  link: "Matriz de Tipos",
  selectedColumn: "(elegido)",
  playPrompt: "¿Quieres jugar? Entra con tu cuenta o como invitado.",
  playLink: "Entrar a jugar",
  seeInPokedex: "Ver estos Pokémon en la Pokédex",
} as const;

export const RESULT_LABELS: Record<GameResult, string> = { won: "Ganaste", drawn: "Empate", lost: "Perdiste" };

const SAME_FOR_ALL = (text: string): Record<GameResult, string> => ({ won: text, drawn: text, lost: text });

/** El motivo del fin contado desde el lado de quien mira su historial. */
export const HISTORY_REASON_LABELS: Record<GameEndReason, Record<GameResult, string>> = {
  completed: SAME_FOR_ALL("La partida terminó"),
  forfeit: { won: "Tu rival abandonó", drawn: "Un jugador abandonó la partida", lost: "Abandonaste la partida" },
  disconnect: { won: "Tu rival se desconectó", drawn: "Un jugador se desconectó", lost: "Te desconectaste" },
  exhausted: SAME_FOR_ALL("Se agotaron los pares de tipos jugables"),
  cancelled: SAME_FOR_ALL("La sala se canceló"),
  expired: SAME_FOR_ALL("La sala caducó"),
  abandoned: SAME_FOR_ALL("La partida se abandonó"),
};

/** Las partidas anteriores a que se guardara el motivo (nulo) se muestran como una partida normal. */
export function historyReason(reason: GameEndReason | null, result: GameResult): string {
  return HISTORY_REASON_LABELS[reason ?? "completed"][result];
}

/** "Tipos aleatorios · 3 rondas", "Tipos elegidos · hasta 7 rondas", "Tipos aleatorios · meta de 2500 puntos". */
export function describeConfig(config: DobleTipoConfig): string {
  const types = config.typeMode === "random" ? "Tipos aleatorios" : "Tipos elegidos";
  const length =
    config.statsGoal !== null
      ? `meta de ${config.statsGoal} puntos`
      : config.lengthMode === "fixed_rounds"
        ? `${config.roundsLimit} rondas`
        : `hasta ${config.roundsLimit} ${config.roundsLimit === 1 ? "ronda" : "rondas"}`;
  return `${types} · ${length}`;
}

export const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  spAttack: "At. esp.",
  spDefense: "Def. esp.",
  speed: "Velocidad",
};

// --- Revancha ------------------------------------------------------------------------------------------------------

/** Los textos fijos de la revancha (botones, títulos y etiquetas). */
export const REMATCH_TEXT = {
  request: "Revancha",
  cancel: "Cancelar",
  accept: "Aceptar",
  decline: "Rechazar",
  backToLobby: "Volver al lobby",
  firstGame: "Es su primera partida juntos",
  factsLabel: "¿Sabías que…?",
  loadingTitle: "¡Revancha!",
  loadingSub: "Preparando la sala…",
  youReady: "✓ Tú, listo",
} as const;

export const rematchWaiting = (name: string): string => `Esperando a ${name}…`;
export const rematchSecondsLeft = (seconds: number): string => `Le quedan ${seconds} s para decidir`;
/** El mismo plazo dicho a quien decide (la petición la hizo el rival). */
export const rematchYourSecondsLeft = (seconds: number): string => `Te quedan ${seconds} s para decidir`;
export const rematchRequested = (name: string): string => `${name} quiere la revancha`;
export const rematchEntering = (name: string): string => `${name} entrando…`;
export const rematchNoShow = (name: string): string => `${name} no llegó.`;

/** Las últimas partidas del récord, como fichas: la letra que se ve y el nombre que se lee. */
export const RECENT_RESULT_LABELS: Record<GameResult, { short: string; name: string }> = {
  won: { short: "G", name: "Ganada" },
  lost: { short: "P", name: "Perdida" },
  drawn: { short: "E", name: "Empate" },
};
export const recordTitle = (name: string): string => `Tú contra ${name}`;

/** El aviso de por qué no hubo revancha; `null` si lo canceló quien lo lee (no hace falta decirle nada). */
export function rematchClosedMessage(reason: RematchClosedReason, name: string): string | null {
  switch (reason) {
    case "self":
      return null;
    case "declined":
      return `${name} ya no quiere la revancha.`;
    case "left":
      return `${name} se fue.`;
    case "timeout":
      return "Se acabó el tiempo.";
    case "unavailable":
      return "La revancha ya no está disponible.";
    case "failed":
      return "No se pudo crear la sala.";
  }
}

/** La línea bajo el marcador del récord: «5 partidas jugadas · vas ganando», o «Es su primera partida juntos». */
export function recordHeadline(record: RematchRecord, rivalName: string): string {
  if (record.played === 1) return REMATCH_TEXT.firstGame;
  const verdict = record.mine > record.theirs ? "vas ganando" : record.mine < record.theirs ? `va ganando ${rivalName}` : "van empatados";
  return `${record.played} partidas jugadas · ${verdict}`;
}

/** El control de sonido del encabezado. */
export const SOUND_TEXT = {
  button: "Sonido",
  music: "Música",
  musicVolume: "Volumen de la música",
  effects: "Efectos",
  effectsVolume: "Volumen de los efectos",
} as const;

/** Aviso en la ronda: el rival ya envió su respuesta (sin decir qué). */
export const OPPONENT_ANSWERED = "Tu rival ya respondió";

/** El lema de las pantallas de acceso (la parte resaltada va en el color de acento). */
export const AUTH_HERO_TEXT = {
  lead: "Minijuegos Pokémon para jugar",
  highlight: "1 vs 1",
  tail: "con tus amigos.",
  gamesLabel: "Minijuegos",
} as const;

/** «Borrar mi cuenta», al final del perfil propio. */
export const DELETE_ACCOUNT_TEXT = {
  title: "Borrar mi cuenta",
  warning:
    "No se puede deshacer: se borran tu correo, tu nombre y tu contraseña, y se cierran tus sesiones. Tus partidas seguirán en el historial de tus rivales como «Cuenta borrada».",
  confirm: "Borrar mi cuenta para siempre",
  cancel: "Cancelar",
  missingPassword: "Escribe tu contraseña.",
  done: "Tu cuenta se borró.",
} as const;

/** Cómo se ve una cuenta borrada (su nombre de relleno, `borrada_…`, no se enseña). */
export const DELETED_ACCOUNT_NAME = "Cuenta borrada";

export const AVATAR_TEXT = {
  gridLabel: "Avatares",
  change: "Cambiar avatar",
  title: "Elige tu avatar",
  useInitials: "Usar mis iniciales",
  close: "Cerrar",
  saveError: "No se pudo guardar tu avatar. Inténtalo de nuevo.",
} as const;

/** Lo que oye un lector de pantalla en el avatar del perfil. */
export const avatarLabel = (pokemonName: string): string => `Avatar: ${pokemonName}`;

export const MENU_TEXT = {
  title: "¿A qué jugamos?",
  subtitle: "Elige un minijuego para dos.",
  play: "Jugar",
  newBadge: "NUEVO",
  backToMenu: "Volver al menú",
  /** El crédito del fanart de fondo; el nombre del autor va después, enlazado a su perfil. */
  backgroundCredit: (title: string) => `Fondo: «${title}», de `,
  /** El crédito de un fanart sin autor conocido; le sigue el enlace «¿Es tuyo?» a Contacto. */
  unknownAuthorCredit: (title: string) => `Fondo: «${title}», fanart de autor desconocido · `,
  isItYours: "¿Es tuyo?",
} as const;

/** Las tarjetas del menú: nombre, frase y si es nuevo. */
export const GAME_CARDS: Record<GameKind, { name: string; description: string; isNew: boolean }> = {
  doble_tipo: { name: "Doble tipo", description: "Nombra un Pokémon con los dos tipos. Gana quien sume más stats.", isNew: false },
  silueta: { name: "¿Quién es ese Pokémon?", description: "Adivina la silueta. Cuanto más rápido, más puntos.", isNew: true },
  subasta: { name: "Subasta Pokémon", description: "Puja por siluetas y combate con lo que compres.", isNew: true },
};

export const AUCTION_TEXT = {
  traps: "Siluetas trampa",
  trapsHint: "A veces la silueta no es el Pokémon que compras.",
  withTraps: "Con siluetas trampa",
  withoutTraps: "Sin siluetas trampa",
  yourMoney: "Tu dinero",
  theirMoney: "Su dinero",
  boughtSilhouette: "Silueta comprada",
  lotBids: "Pujas de este lote",
  yourTurn: "¡Te toca pujar!",
  startingPrice: "Precio inicial",
  currentBid: "Puja actual",
  stillThere: "¿Sigues ahí?",
  stillHere: "Sigo aquí",
  sold: "¡Vendido!",
  cannotBid: "No te alcanza: solo puedes retirarte.",
  retire: "Retirarme",
  bothRetire: "Va a quien tenga menos",
  revealTitle: "¿Qué compró cada uno?",
  revealLog: "Revelación",
  wasTrap: "¡Era una trampa!",
  ready: "Listo",
  waitingRival: "Esperando al rival…",
  noWinner: "Sin ganador",
  noPurchases: "No llegó a comprar ninguno.",
  youTurn: "Te toca.",
  lotOf: (lot: number): string => `Lote ${lot} de 12`,
  openAt: (amount: string): string => `Abrir en ${amount}`,
  endsAt: (amount: string): string => `queda en ${amount}`,
  rivalTurn: (rival: string): string => `Le toca a ${rival}`,
  autoFor: (name: string): string => `Este va para ${name}`,
  leading: (name: string): string => `Va ganando ${name}`,
  rivalTakes: (rival: string): string => `${rival} se lo lleva`,
  rivalDecides: (rival: string): string => `${rival} decide si lo abre`,
  rivalRetired: (rival: string): string => `${rival} se retiró. Si abres, es tuyo.`,
  youRetired: (rival: string): string => `Te retiraste. ${rival} decide si lo abre.`,
  rivalDeciding: (rival: string): string => `${rival} decide: si se retira, será tu turno de abrir o retirarte.`,
  ifRivalRetires: (rival: string): string => `Si ${rival} se retira, es tuyo. Si sube, volverá a tocarte a ti.`,
  waitingFor: (rival: string): string => `Esperando a ${rival}…`,
  yourCap: (limit: string): string => `Tu tope es ${limit}.`,
  teamSize: (size: number): string => `${size} de 6`,
  teamOf: (name: string): string => `Equipo de ${name}`,
  limitNote: (limit: string): string => `Puedes pujar hasta ${limit}. El resto se guarda para completar tus 6.`,
};

export const AUCTION_HELP = {
  title: "Cómo se puja",
  close: "Entendido",
  steps: [
    "Cuando te toque, sube la puja. No hay prisa: no hay reloj.",
    "O retírate. Si ya hay una puja, el otro se lleva el Pokémon a ese precio; si no, decide él.",
    "Cada uno termina con 6 Pokémon, y al final se revela quiénes eran. ¡Algunas siluetas son trampa!",
  ],
} as const;

export const AUCTION_SUMMARY_TEXT = {
  title: "Resumen del combate",
  damage: "Daño hecho",
  spent: "Dinero gastado",
} as const;

export const BATTLE_TEXT = {
  lineupTitle: "Elige tu alineación",
  lineupTimer: "Tiempo para elegir la alineación",
  yourLineup: "Tu alineación",
  rivalTeam: "Equipo rival",
  titular: "Titular",
  confirm: "Confirmar",
  whatDoes: (name: string): string => `¿Qué hace ${name}?`,
  waitingFor: (name: string): string => `Esperando a ${name}…`,
  rivalSlow: (name: string): string => `${name} lleva rato sin elegir…`,
  healNote: "+25 % de PS",
  usedNote: "Ya usado",
  yourTeam: "Tu equipo",
  switchCost: "Cambiar gasta tu turno",
  log: "Registro",
  stillStanding: (count: number): string => `${count} en pie`,
  inBattle: (name: string): string => `${name}, en combate`,
  fainted: (name: string): string => `${name}, debilitado`,
  switchTo: (name: string, percent: number): string => `Cambiar a ${name}, ${percent} % de PS`,
  roundLabel: (round: number, turn: number, maxTurns: number): string => `Asalto ${round} · Turno ${turn}/${maxTurns}`,
  resolving: "Resolviendo…",
  pauseTitle: "Pausa entre asaltos",
  pauseTimer: "Tiempo de la pausa",
  whoGoesOut: "¿Quién sale a pelear?",
  nobodyLeft: "No te quedan Pokémon.",
  moveUp: (name: string): string => `Subir ${name}`,
  moveDown: (name: string): string => `Bajar ${name}`,
  position: (name: string, position: number): string => `${name}: posición ${position}`,
  sendOut: (name: string): string => `Sacar a ${name}`,
  hpOf: (name: string): string => `PS de ${name}`,
  fell: (name: string, atLimit: boolean): string => (atLimit ? `${name} cayó por el límite de turnos.` : `${name} cayó.`),
  roundVersus: (round: number, mine: string, theirs: string): string => `Asalto ${round}: ${mine} contra ${theirs}.`,
  turnNews: (round: number, turn: number, summary: string): string => `Asalto ${round}, turno ${turn}: ${summary}`,
  roundTurn: (round: number, turn: number): string => `Asalto ${round} · Turno ${turn}`,
};

/** «₽ 1.000.000»: siempre con punto de miles, sea cual sea el idioma del navegador. */
export function auctionMoney(amount: number): string {
  return "₽ " + String(amount).replace(/\B(?=(\d{3})+$)/g, ".");
}

/** Cómo se cerró un lote. */
export function auctionSaleText(sale: AuctionSalePayload, winner: string): string {
  return sale.paid === 0 ? `Lote ${sale.lot}: ${winner} se lo lleva gratis` : `Lote ${sale.lot}: ${winner} se lo lleva por ${auctionMoney(sale.paid)}`;
}

export const SILHOUETTE_TEXT = {
  rounds: "Rondas",
  generations: "Generaciones",
  noGeneration: "Elige al menos una generación",
} as const;

/** «1.ª (Kanto)». */
export const generationLabel = (n: number, region: string): string => `${n}.ª (${region})`;

/** Textos de las pantallas de la silueta. */
export const SILHOUETTE_SCREEN = {
  question: "¿Quién es ese Pokémon?",
  imageAlt: "Silueta de un Pokémon",
  unavailable: "No se pudo cargar la silueta",
  noAnswer: "sin respuesta",
  correct: "Acertó",
  wrong: "Falló",
  you: "Tú",
  answers: "Respuestas",
  pokemonList: "Pokémon de la partida",
  youGotIt: "Acertaste",
  bothGotIt: "Acertaron los dos",
  nobody: "Nadie acertó",
} as const;

/** «3,2 s»: los milisegundos con una decimal y coma. */
export const silhouetteSeconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
export const silhouetteRoundOf = (round: number, total: number): string => `Ronda ${round} de ${total}`;
export const silhouetteAnsweredIn = (ms: number): string => `Respondiste en ${silhouetteSeconds(ms)}`;
export const silhouetteReveal = (name: string): string => `¡Es ${name}!`;
export const silhouetteRivalGotIt = (rival: string): string => `Acertó ${rival}`;

/** «10 rondas · 1.ª (Kanto), 2.ª (Johto)»: la configuración de una sala de silueta. */
export function describeSilhouetteConfig(config: SilhouetteConfig): string {
  const gens = config.generations.map((n) => generationLabel(n, GENERATIONS.find((g) => g.n === n)?.region ?? "")).join(", ");
  return `${config.rounds} rondas · ${gens}`;
}
