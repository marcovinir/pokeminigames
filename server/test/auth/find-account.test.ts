import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAccountByUsername } from "../../src/auth/find-account.js";
import { buildTestApp } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const app = buildTestApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("findAccountByUsername (script de moderación)", () => {
  it("encuentra la cuenta sin distinguir mayúsculas", async () => {
    await request(app).post("/auth/register").send({ email: "ash@example.com", username: "Ash", password: "pikachu-123" });
    for (const name of ["ash", "ASH", "Ash"]) {
      const found = await findAccountByUsername(prisma, name);
      expect(found).toMatchObject({ username: "Ash", email: "ash@example.com" });
      expect(found?.createdAt).toBeInstanceOf(Date);
    }
  });

  it("devuelve null si no existe", async () => {
    expect(await findAccountByUsername(prisma, "nadie")).toBeNull();
  });
});
