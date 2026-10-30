import type { TypeName } from "@pokemon-minigames/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeIcon } from "../../src/components/TypeIcon";

describe("TypeIcon", () => {
  it("dibuja el símbolo de un tipo conocido", () => {
    const { container } = render(<TypeIcon type="fire" size={18} />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("con un tipo desconocido (datos corruptos) no dibuja nada en vez de romper la pantalla", () => {
    const { container } = render(<TypeIcon type={"bogus" as TypeName} size={18} />);
    expect(container).toBeEmptyDOMElement();
  });
});
