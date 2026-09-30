import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MyFuel } from "../../src/components/MyFuel";
import { locales, messages } from "../../src/i18n";

it.each(locales)("%s renders only the manual fuel selector, labels and on-site reminder", (locale) => {
  const html = renderToStaticMarkup(createElement(MyFuel, {
    locale,
    fuel: "REGULAR",
    onFuelChange: () => undefined,
    trigger: {} as HTMLButtonElement,
    onClose: () => undefined,
  }));
  expect(html.match(/<select\b/g)).toHaveLength(1);
  expect(html.match(/<option\b/g)).toHaveLength(3);
  expect(html).toContain(messages[locale].myFuelPreference);
  expect(html).toContain(messages[locale].myFuelGuidance);
  for (const label of ["レギュラー", "ハイオク", "軽油"]) expect(html).toContain(`<dt lang="ja">${label}</dt>`);
  // The manual screen has no vehicle lookup, pending state or result announcement.
  expect(html).not.toMatch(/<form\b|role="(?:status|alert)"/);
});
