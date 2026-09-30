import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

export default function setup(): void {
  const testEnv = parse(readFileSync(new URL("../.env.test", import.meta.url)));
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, ...testEnv },
  });
}
