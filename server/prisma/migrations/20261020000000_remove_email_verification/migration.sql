-- Se retira la verificación del correo y la recuperación de la contraseña con códigos (decisión del 2026-10-18: nada de
-- verificación por correo ni de códigos OTP). La migración 20261007230000 (que creó todo esto) ya está aplicada en
-- producción y se queda como está: esta la deshace con una migración nueva.

-- DropTable (lleva consigo su clave primaria, su clave foránea a `users` y su restricción de intentos)
DROP TABLE "email_codes";

-- DropEnum
DROP TYPE "email_code_purpose";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email_verified_at";
