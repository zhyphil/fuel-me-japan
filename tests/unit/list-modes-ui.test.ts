import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FindFuel } from "../../src/components/FindFuel";

it("makes the three list modes reachable on the initial overview", () => {
  const html = renderToStaticMarkup(createElement(FindFuel, { locale: "en" }));
  for (const label of ["Cheapest", "Nearest", "Favorites"]) expect(html).toContain(`>${label}</button>`);
});
