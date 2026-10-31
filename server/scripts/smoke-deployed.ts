/**
 * Prueba de humo contra la URL de un servicio desplegado (Render):
 *
 *   npm run smoke:deployed -- https://mi-servicio.onrender.com
 *
 * No crea cuentas ni escribe nada: solo GET y un único POST con un origen ajeno que el servidor rechaza antes de
 * procesarlo. Espera a que el servicio despierte (la capa gratuita lo duerme) y comprueba lo que se puede ver desde fuera.
 */
export interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SmokeOptions {
  baseUrl: string;
  /** Cuántos nombres de Pokémon debe traer `/pokemon/names` (1025 con el catálogo real). */
  expectedNames?: number;
  /** Cuánto esperar a que el servicio despierte. */
  wakeTimeoutMs?: number;
  /** Inyectables para las pruebas. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const FOREIGN_ORIGIN = "https://origen-ajeno.invalid";
const WAKE_POLL_MS = 3000;

export async function runSmoke(options: SmokeOptions): Promise<SmokeCheck[]> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const wakeTimeoutMs = options.wakeTimeoutMs ?? 90_000;
  const expectedNames = options.expectedNames ?? 1025;

  const checks: SmokeCheck[] = [];
  const check = async (name: string, run: () => Promise<string>): Promise<void> => {
    try {
      checks.push({ name, ok: true, detail: await run() });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const expect = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };
  const json = async (response: Response): Promise<any> => response.json().catch(() => null);

  // 1. El servicio responde (puede estar durmiendo: se insiste hasta que despierte).
  const started = now();
  let healthy = false;
  while (!healthy && now() - started < wakeTimeoutMs) {
    try {
      const response = await doFetch(`${base}/health`);
      healthy = response.ok && (await json(response))?.status === "ok";
    } catch {
      // Sigue durmiendo o arrancando.
    }
    if (!healthy) await sleep(WAKE_POLL_MS);
  }
  if (!healthy) {
    return [{ name: "El servicio responde en /health", ok: false, detail: `no respondió en ${Math.round(wakeTimeoutMs / 1000)} s` }];
  }
  checks.push({ name: "El servicio responde en /health", ok: true, detail: `respondió tras ${Math.round((now() - started) / 1000)} s` });

  // 2 y 3. El cliente.
  let indexHtml = "";
  await check("Sirve el cliente en la raíz (HTML con el nodo raíz de React, sin caché)", async () => {
    const response = await doFetch(`${base}/`);
    indexHtml = await response.text();
    expect(response.status === 200, `responde ${response.status}`);
    expect((response.headers.get("content-type") ?? "").includes("text/html"), "no es HTML");
    expect(indexHtml.includes('id="root"'), "el HTML no tiene el nodo raíz de React");
    expect((response.headers.get("cache-control") ?? "").includes("no-cache"), "index.html debería revalidarse siempre (no-cache)");
    return "200 text/html";
  });

  await check("Las pantallas del cliente (/perfil, /login, /sala/ABC234) devuelven el cliente", async () => {
    for (const path of ["/perfil", "/login", "/sala/ABC234"]) {
      const response = await doFetch(`${base}${path}`);
      expect(response.status === 200 && (await response.text()).includes('id="root"'), `${path} no devuelve el cliente (${response.status})`);
    }
    return "3 rutas";
  });

  await check("Los archivos con hash del cliente se cachean para siempre", async () => {
    const asset = /(?:src|href)="(\/assets\/[^"]+)"/.exec(indexHtml)?.[1];
    expect(asset !== undefined, "index.html no enlaza ningún archivo de /assets");
    const response = await doFetch(`${base}${asset}`);
    expect(response.status === 200, `${asset} responde ${response.status}`);
    expect((response.headers.get("cache-control") ?? "").includes("immutable"), `${asset} no lleva Cache-Control inmutable`);
    return asset!;
  });

  // 4. La API.
  await check(`/pokemon/names trae los ${expectedNames} nombres`, async () => {
    const response = await doFetch(`${base}/pokemon/names`);
    const names = await json(response);
    expect(response.status === 200 && Array.isArray(names), `responde ${response.status}`);
    expect(names.length === expectedNames, `trae ${names.length} nombres y se esperaban ${expectedNames}`);
    expect(names.every((n: any) => typeof n.id === "number" && typeof n.es === "string" && typeof n.en === "string"), "algún nombre no tiene id, es y en");
    return `${names.length} nombres`;
  });

  await check("La Pokédex responde: lista, ficha de Charizard y su página", async () => {
    const list = await json(await doFetch(`${base}/pokemon/dex`));
    expect(Array.isArray(list?.pokemon) && list.pokemon.length > 0, "la lista de la Pokédex viene vacía");
    const detail = await doFetch(`${base}/pokemon/dex/6`);
    expect(detail.status === 200, `la ficha de la Pokédex responde ${detail.status}`);
    const page = await doFetch(`${base}/pokedex/6`);
    expect(page.status === 200, `la página de la Pokédex responde ${page.status}`);
    return `${list.pokemon.length} Pokémon`;
  });

  await check("Las rutas protegidas piden sesión (401 UNAUTHORIZED)", async () => {
    for (const path of ["/stats", "/stats/history", "/rooms/current", "/auth/me"]) {
      const response = await doFetch(`${base}${path}`);
      expect(response.status === 401 && (await json(response))?.error?.code === "UNAUTHORIZED", `${path} no pide sesión (${response.status})`);
    }
    return "4 rutas";
  });

  await check("Una ruta de la API que no existe da 404 en JSON", async () => {
    const response = await doFetch(`${base}/auth/no-existe`);
    expect(response.status === 404 && (await json(response))?.error?.code === "NOT_FOUND", `responde ${response.status}`);
    return "404 NOT_FOUND";
  });

  // 5. Seguridad.
  await check("Rechaza una petición que cambia algo desde un origen ajeno (403 FORBIDDEN)", async () => {
    const response = await doFetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: FOREIGN_ORIGIN },
      body: JSON.stringify({ email: "humo@example.com", password: "no-importa" }),
    });
    expect(response.status === 403 && (await json(response))?.error?.code === "FORBIDDEN", `responde ${response.status}: debería rechazar el origen ajeno`);
    return "403 FORBIDDEN";
  });

  await check("No concede CORS a otros orígenes", async () => {
    const response = await doFetch(`${base}/health`, { headers: { Origin: FOREIGN_ORIGIN } });
    const allowed = response.headers.get("access-control-allow-origin");
    expect(allowed === null, `concede CORS a ${allowed}`);
    return "sin cabecera de CORS";
  });

  await check("La dirección usa HTTPS", async () => {
    const url = new URL(base);
    expect(url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1", `usa ${url.protocol}`);
    return url.protocol;
  });

  return checks;
}

if (import.meta.filename === process.argv[1]) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Uso: npm run smoke:deployed -- https://mi-servicio.onrender.com");
    process.exit(2);
  }
  console.log(`Prueba de humo de ${baseUrl} (si el servicio duerme, puede tardar hasta un minuto)...\n`);
  const checks = await runSmoke({ baseUrl });
  for (const { name, ok, detail } of checks) console.log(`${ok ? "OK    " : "FALLA "} ${name} — ${detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? "\nTodo bien." : `\n${failed} comprobación(es) fallaron.`);
  // exitCode y no process.exit(): en Windows, salir con conexiones fetch aún cerrándose aborta Node con un error de libuv.
  process.exitCode = failed === 0 ? 0 : 1;
}
