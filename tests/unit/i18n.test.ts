import { describe, expect, it } from "vitest";
import {
  japaneseLabels,
  localeFromPath,
  locales,
  messages,
  translate,
} from "../../src/i18n";
describe("locale contract", () => {
  it("supports exactly the five frozen locales", () => {
    expect(locales).toEqual(["en", "zh-Hant", "ko", "zh-Hans", "th"]);
  });
  it.each(locales)("%s has complete non-empty structured UI copy", (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual(
      Object.keys(messages.en).sort(),
    );
    expect(
      Object.values(messages[locale]).every((value) => value.trim().length > 0),
    ).toBe(true);
  });
  it("selects a known locale and falls back safely", () => {
    expect(localeFromPath("/zh-Hant/")).toBe("zh-Hant");
    expect(localeFromPath("/th/")).toBe("th");
    expect(localeFromPath("/ja/")).toBe("en");
    expect(localeFromPath("/")).toBe("en");
  });
  it("falls back from requested locale to English to Japanese reference", () => {
    expect(translate("de", "language")).toBe("Language");
    expect(translate("ko", "untranslatedFuelReference", "レギュラー")).toBe(
      "レギュラー",
    );
    expect(translate("th", "language")).toBe("ภาษา");
  });
  it("retains the exact physical Japanese recognition labels", () => {
    expect(japaneseLabels).toEqual({
      regular: "レギュラー",
      highOctane: "ハイオク",
      diesel: "軽油",
      selfService: "セルフ",
      cash: "現金",
      member: "会員",
      fullTank: "満タン",
    });
  });
});
