-- Motivo del fin de cada partida y preferencia de tema de cada usuario (etapa 4).

-- CreateEnum
CREATE TYPE "game_end_reason" AS ENUM ('completed', 'forfeit', 'disconnect', 'exhausted', 'cancelled', 'expired', 'abandoned');

-- CreateEnum
CREATE TYPE "theme_name" AS ENUM ('clasico', 'pokedex');

-- CreateEnum
CREATE TYPE "theme_mode" AS ENUM ('auto', 'claro', 'oscuro');

-- AlterTable
ALTER TABLE "games" ADD COLUMN "end_reason" "game_end_reason";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme" "theme_name",
ADD COLUMN "theme_mode" "theme_mode";

-- CreateIndex
CREATE INDEX "game_players_user_id_idx" ON "game_players"("user_id");

-- CreateIndex
CREATE INDEX "round_picks_user_id_idx" ON "round_picks"("user_id");

-- El motivo debe ser coherente con el estado: una partida en espera o en curso no tiene motivo;
-- una terminada solo admite los motivos de una partida terminada y una abandonada, los de una
-- sala que no llegó a terminar (el mismo reparto que hace el motor). Nulo vale siempre: las
-- partidas anteriores a esta migración no lo tienen.
ALTER TABLE "games" ADD CONSTRAINT "games_end_reason_check" CHECK (
  "end_reason" IS NULL
  OR ("status" = 'completed' AND "end_reason" IN ('completed', 'forfeit', 'disconnect', 'exhausted'))
  OR ("status" = 'abandoned' AND "end_reason" IN ('cancelled', 'expired', 'abandoned'))
);

-- La preferencia de tema se guarda entera o no se guarda.
ALTER TABLE "users" ADD CONSTRAINT "users_theme_pair_check" CHECK (("theme" IS NULL) = ("theme_mode" IS NULL));
