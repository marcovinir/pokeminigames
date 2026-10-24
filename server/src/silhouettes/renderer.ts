import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

export interface SilhouetteRenderer {
  /** El PNG de la silueta de ese Pokémon: sus píxeles en negro, la transparencia intacta. */
  render(pokemonId: number): Promise<Buffer>;
}

export interface SilhouetteRendererOptions {
  /** Plantilla de la URL del arte con `{id}` (http, https o file: la E2E usa un archivo local). */
  artUrl: string;
  /** Cuántas siluetas se guardan hechas (por defecto 200). */
  cacheSize?: number;
  fetchImpl?: typeof fetch;
}

/** Pinta de negro todo píxel visible: la silueta tiene la forma del Pokémon y nada de su color. */
export function blacken(art: Buffer): Buffer {
  const png = PNG.sync.read(art);
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3]! > 0) {
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
    }
  }
  return PNG.sync.write(png);
}

export function createSilhouetteRenderer({ artUrl, cacheSize = 200, fetchImpl = fetch }: SilhouetteRendererOptions): SilhouetteRenderer {
  const cache = new Map<number, Promise<Buffer>>();

  async function download(pokemonId: number): Promise<Buffer> {
    const url = artUrl.replaceAll("{id}", String(pokemonId));
    if (url.startsWith("file:")) return readFile(fileURLToPath(url));
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`El arte de ${pokemonId} respondió ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  return {
    render(pokemonId) {
      const cached = cache.get(pokemonId);
      if (cached) return cached;
      const made = download(pokemonId).then(blacken);
      cache.set(pokemonId, made);
      // Un fallo no se queda en la caché: el siguiente intento vuelve a pedirlo.
      made.catch(() => cache.delete(pokemonId));
      while (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
      return made;
    },
  };
}
