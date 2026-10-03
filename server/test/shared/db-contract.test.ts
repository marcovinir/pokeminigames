import { GAME_END_REASONS, THEME_MODES, THEME_NAMES } from "@pokemon-minigames/shared";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db.js";

afterAll(() => prisma.$disconnect());

async function enumValues(typeName: "game_end_reason" | "theme_name" | "theme_mode"): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
    `SELECT unnest(enum_range(NULL::${typeName}))::text AS value`,
  );
  return rows.map((row) => row.value);
}

describe("los enums de la base de datos son los de shared", () => {
  it("motivos de fin de la partida", async () => {
    expect(await enumValues("game_end_reason")).toEqual([...GAME_END_REASONS]);
  });

  it("tema y modo", async () => {
    expect(await enumValues("theme_name")).toEqual([...THEME_NAMES]);
    expect(await enumValues("theme_mode")).toEqual([...THEME_MODES]);
  });
});
