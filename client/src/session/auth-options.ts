import { useEffect, useState } from "react";
import type { Endpoints } from "../api/endpoints";
import { useServices } from "../services";

/** Una consulta por conjunto de servicios: las pantallas de acceso no la repiten al cambiar de una a otra. */
const asked = new WeakMap<Endpoints, Promise<boolean>>();

/**
 * ¿Verifica el servidor el correo de las cuentas? Mientras no se sabe (o si la consulta falla) es `false`: la aplicación se
 * comporta como antes y no ofrece, por ejemplo, «¿Olvidaste tu contraseña?». Una consulta fallida no se recuerda.
 */
export function useEmailVerification(): boolean {
  const { endpoints } = useServices();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    let answer = asked.get(endpoints);
    if (!answer) {
      answer = endpoints.auth.options().then(
        (options) => options.emailVerification,
        () => {
          asked.delete(endpoints);
          return false;
        },
      );
      asked.set(endpoints, answer);
    }
    void answer.then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, [endpoints]);

  return enabled;
}
