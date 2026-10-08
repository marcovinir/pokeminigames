-- Verificación del correo y recuperación de la contraseña con códigos que llegan por correo (etapa 7).

-- CreateEnum
CREATE TYPE "email_code_purpose" AS ENUM ('verify_email', 'reset_password');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "email_codes" (
    "user_id" UUID NOT NULL,
    "purpose" "email_code_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("user_id","purpose")
);

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las cuentas que ya existían se dan por verificadas (con la fecha de esta migración): nadie queda fuera al activar la
-- verificación. Las que se creen después nacen sin verificar.
UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP;

-- Los intentos de un código van de 0 a 5: la base de datos es el tope duro aunque falle cualquier otra protección.
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5);
