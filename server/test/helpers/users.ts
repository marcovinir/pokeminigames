import type { Express } from "express";
import request from "supertest";

export interface TestUser {
  userId: string;
  username: string;
  token: string;
}

/** Entra como invitado por la API (sin cuenta) y devuelve su id `guest_…` y su access token. */
export async function enterAsGuest(app: Express, username: string): Promise<TestUser> {
  const response = await request(app).post("/auth/guest").send({ username });
  if (response.status !== 201) throw new Error(`No se pudo entrar como invitado ${username}: ${response.status}`);
  return { userId: response.body.user.id, username, token: response.body.accessToken };
}

/** Registra un usuario por la API y devuelve su id y su access token. */
export async function registerUser(app: Express, username: string): Promise<TestUser> {
  const response = await request(app)
    .post("/auth/register")
    .send({ email: `${username}@example.com`, username, password: "pikachu-123" });
  if (response.status !== 201) throw new Error(`No se pudo registrar a ${username}: ${response.status}`);
  return { userId: response.body.user.id, username, token: response.body.accessToken };
}
