-- La restricción original aceptaba fixed_rounds con rounds_limit NULL, porque
-- NULL IN (3, 5) da NULL y un CHECK que da NULL se considera cumplido.
ALTER TABLE "games" DROP CONSTRAINT "games_length_config_check";

ALTER TABLE "games" ADD CONSTRAINT "games_length_config_check" CHECK (
  ("length_mode" = 'fixed_rounds' AND "rounds_limit" IS NOT NULL AND "rounds_limit" IN (3, 5) AND "stats_goal" IS NULL)
  OR
  ("length_mode" = 'custom' AND (("rounds_limit" IS NOT NULL)::int + ("stats_goal" IS NOT NULL)::int) = 1
    AND COALESCE("rounds_limit", 1) >= 1 AND COALESCE("stats_goal", 1) >= 1)
);
