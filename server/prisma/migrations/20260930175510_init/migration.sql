-- CreateEnum
CREATE TYPE "language" AS ENUM ('es', 'en');

-- CreateEnum
CREATE TYPE "type_mode" AS ENUM ('random', 'chosen');

-- CreateEnum
CREATE TYPE "length_mode" AS ENUM ('fixed_rounds', 'custom');

-- CreateEnum
CREATE TYPE "game_status" AS ENUM ('waiting', 'in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "pick_result" AS ENUM ('VALID', 'NOT_FOUND', 'WRONG_TYPES', 'ALREADY_OWNED', 'TAKEN', 'NO_ANSWER');

-- CreateTable
CREATE TABLE "types" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pokemon" (
    "id" INTEGER NOT NULL,
    "base_hp" INTEGER NOT NULL,
    "base_attack" INTEGER NOT NULL,
    "base_defense" INTEGER NOT NULL,
    "base_sp_attack" INTEGER NOT NULL,
    "base_sp_defense" INTEGER NOT NULL,
    "base_speed" INTEGER NOT NULL,
    "total_stats" INTEGER NOT NULL,
    "sprite_url" TEXT NOT NULL,

    CONSTRAINT "pokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pokemon_types" (
    "pokemon_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "slot" SMALLINT NOT NULL,

    CONSTRAINT "pokemon_types_pkey" PRIMARY KEY ("pokemon_id","slot")
);

-- CreateTable
CREATE TABLE "pokemon_names" (
    "pokemon_id" INTEGER NOT NULL,
    "language" "language" NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,

    CONSTRAINT "pokemon_names_pkey" PRIMARY KEY ("pokemon_id","language")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "room_code" VARCHAR(10) NOT NULL,
    "type_mode" "type_mode" NOT NULL,
    "length_mode" "length_mode" NOT NULL,
    "rounds_limit" INTEGER,
    "stats_goal" INTEGER,
    "status" "game_status" NOT NULL DEFAULT 'waiting',
    "winner_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "game_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat" SMALLINT NOT NULL,
    "final_stats" INTEGER,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("game_id","seat")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "type1_id" INTEGER NOT NULL,
    "type2_id" INTEGER NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_picks" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "submitted_text" TEXT,
    "result" "pick_result" NOT NULL,
    "pokemon_id" INTEGER,
    "submitted_at" TIMESTAMPTZ(3),

    CONSTRAINT "round_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "types_name_key" ON "types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_types_pokemon_id_type_id_key" ON "pokemon_types"("pokemon_id", "type_id");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_names_language_normalized_name_key" ON "pokemon_names"("language", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_room_code_key" ON "games"("room_code");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_user_id_key" ON "game_players"("game_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_game_id_number_key" ON "rounds"("game_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "round_picks_round_id_user_id_key" ON "round_picks"("round_id", "user_id");

-- AddForeignKey
ALTER TABLE "pokemon_types" ADD CONSTRAINT "pokemon_types_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_types" ADD CONSTRAINT "pokemon_types_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_names" ADD CONSTRAINT "pokemon_names_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_type1_id_fkey" FOREIGN KEY ("type1_id") REFERENCES "types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_type2_id_fkey" FOREIGN KEY ("type2_id") REFERENCES "types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_picks" ADD CONSTRAINT "round_picks_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_picks" ADD CONSTRAINT "round_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_picks" ADD CONSTRAINT "round_picks_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "pokemon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridad que Prisma no puede expresar en schema.prisma

-- total_stats es un valor derivado; la base de datos garantiza que sea coherente.
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_total_stats_check"
  CHECK ("total_stats" = "base_hp" + "base_attack" + "base_defense" + "base_sp_attack" + "base_sp_defense" + "base_speed");

ALTER TABLE "pokemon_types" ADD CONSTRAINT "pokemon_types_slot_check"
  CHECK ("slot" IN (1, 2));

-- El nombre de usuario es único sin distinguir mayúsculas.
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));

-- Partida de rondas fijas: 3 o 5 rondas y sin meta de stats.
-- Partida personalizada: exactamente una de las dos condiciones de fin.
ALTER TABLE "games" ADD CONSTRAINT "games_length_config_check" CHECK (
  ("length_mode" = 'fixed_rounds' AND "rounds_limit" IN (3, 5) AND "stats_goal" IS NULL)
  OR
  ("length_mode" = 'custom' AND (("rounds_limit" IS NOT NULL)::int + ("stats_goal" IS NOT NULL)::int) = 1
    AND COALESCE("rounds_limit", 1) >= 1 AND COALESCE("stats_goal", 1) >= 1)
);

ALTER TABLE "game_players" ADD CONSTRAINT "game_players_seat_check"
  CHECK ("seat" IN (1, 2));

-- Un par de tipos se guarda siempre ordenado (type1_id < type2_id): así el par es no ordenado y sin repetidos.
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_type_order_check"
  CHECK ("type1_id" < "type2_id");

ALTER TABLE "rounds" ADD CONSTRAINT "rounds_number_check"
  CHECK ("number" >= 1);

-- Una respuesta es VALID si y solo si ganó un Pokémon.
ALTER TABLE "round_picks" ADD CONSTRAINT "round_picks_valid_has_pokemon_check"
  CHECK (("result" = 'VALID') = ("pokemon_id" IS NOT NULL));
