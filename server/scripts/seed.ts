import { readFileSync } from "node:fs";
import { createPrismaClient } from "../src/db/prisma.js";
import { seedCatalog } from "../src/catalog/seed.js";
import type { CatalogSnapshot } from "../src/catalog/snapshot.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Falta DATABASE_URL. Define server/.env (copia server/.env.example).");
  process.exit(1);
}

const snapshot = JSON.parse(
  readFileSync(new URL("../data/catalog.snapshot.json", import.meta.url), "utf8"),
) as CatalogSnapshot;

const prisma = createPrismaClient(databaseUrl);
try {
  const { pokemon } = await seedCatalog(prisma, snapshot);
  console.log(`Catálogo cargado: ${pokemon} Pokémon, 18 tipos, nombres en español e inglés.`);
} finally {
  await prisma.$disconnect();
}
