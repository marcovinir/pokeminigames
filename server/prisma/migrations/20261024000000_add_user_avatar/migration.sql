-- El avatar de cada cuenta: el número de Pokédex de uno de los 24 que se pueden elegir (shared/src/avatars.ts).
-- Nulo = iniciales, como todas las cuentas que ya existen. Sin clave foránea a "pokemon": la validación es la lista.
ALTER TABLE "users" ADD COLUMN "avatar_pokemon_id" SMALLINT;
