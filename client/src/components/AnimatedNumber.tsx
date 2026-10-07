import { useCountUp } from "../game/motion";

/** Un número que sube o baja hasta su valor nuevo (y salta directo si la persona pidió «reducir movimiento»). */
export function AnimatedNumber({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}
