import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// En desarrollo el servidor de Vite hace de proxy al servidor del juego, sin prefijo, para que el
// cliente y la API compartan origen (la cookie de refresco solo viaja a /auth).
const api = process.env.VITE_DEV_API ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": api,
      "/rooms": api,
      "/pokemon": api,
      "/stats": api,
      "/users": api,
      "/socket.io": { target: api, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    css: false,
  },
});
