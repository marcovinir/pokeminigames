import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";
import { ServicesProvider, createServices } from "./services";

// Vacío = el mismo origen que la página (en desarrollo, Vite hace de proxy al servidor del juego).
const services = createServices({ baseUrl: import.meta.env.VITE_API_URL ?? "" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ServicesProvider>
  </StrictMode>,
);
