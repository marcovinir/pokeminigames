import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Con varias pruebas en paralelo el equipo va justo de CPU y 1 s (el valor por defecto) no alcanza para escribir con
// `userEvent` y esperar el resultado; 4 s no alarga las pruebas que pasan, solo evita falsos fallos.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => cleanup());
