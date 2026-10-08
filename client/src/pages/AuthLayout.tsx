import type { ReactNode } from "react";
import { AuthHero } from "./AuthHero";

/** El lema y la explicación a un lado y el formulario al otro (uno encima del otro en pantallas estrechas). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
      <AuthHero />
      {children}
    </div>
  );
}
