import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefuelGuide } from "../../src/components/RefuelGuide";
import { locales, messages } from "../../src/i18n";
import { fieldGuideProvenance, validateFieldGuideSources, validateGuideMessages } from "../../src/lib/field-guide";

describe("field guide sources stay separate and publish only reviewed links", () => {
  it("accepts the reviewed provenance and five dictionaries", () => {
    expect(validateFieldGuideSources(fieldGuideProvenance)).toEqual([]);
    expect(validateGuideMessages(messages, locales)).toEqual([]);
  });
  it.each(["owner", "sourceURL", "purpose", "termsURL", "allowedUseAssessment", "attribution", "refreshPolicy", "reviewDate", "transformationVersion"])("rejects a source without required %s", (field) => {
    const source = structuredClone(fieldGuideProvenance);
    delete (source.sources[0] as Record<string, unknown>)[field];
    expect(validateFieldGuideSources(source).length).toBeGreaterThan(0);
  });
  it("rejects a JAF deep link in the public link field", () => {
    const source = structuredClone(fieldGuideProvenance);
    source.sources[2].publicURL = source.sources[2].sourceURL;
    expect(validateFieldGuideSources(source)).toContain("JAF 公开链接必须为首页。");
  });
  it("rejects missing sources, duplicates, unreviewed links and invalid dates", () => {
    for (const mutate of [
      (source: typeof fieldGuideProvenance) => { source.sources.pop(); },
      (source: typeof fieldGuideProvenance) => { source.sources.push(source.sources[0]); },
      (source: typeof fieldGuideProvenance) => { source.sources[0].publicURL = "https://example.com/"; },
      (source: typeof fieldGuideProvenance) => { source.sources[0].sourceURL = "javascript:alert(1)"; },
      (source: typeof fieldGuideProvenance) => { source.reviewDate = "2026-02-30"; },
      (source: typeof fieldGuideProvenance) => { source.sources[0].transformationVersion = "unreviewed"; },
    ]) {
      const source = structuredClone(fieldGuideProvenance);
      mutate(source);
      expect(validateFieldGuideSources(source).length).toBeGreaterThan(0);
    }
  });
  it.each(locales)("rejects missing %s safety copy before publishing", (locale) => {
    const dictionaries = structuredClone(messages);
    dictionaries[locale].rgMisfuelBody = " ";
    expect(validateGuideMessages(dictionaries, locales)).toEqual([`加油指引缺少 ${locale} 文案：rgMisfuelBody。`]);
  });
});

it.each(locales)("%s renders a standalone article with five steps, seven Japanese labels and permitted sources", (locale) => {
  const html = renderToStaticMarkup(createElement(RefuelGuide, {
    locale,
  }));
  const steps = html.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  expect(steps?.match(/<li>/g)).toHaveLength(5);
  for (const label of ["レギュラー", "ハイオク", "軽油", "セルフ", "現金", "会員", "満タン"]) expect(html).toContain(`<dt lang="ja">${label}</dt>`);
  for (const key of ["rgIntro", "rgStep1Body", "rgStep2Body", "rgStep3Body", "rgStep4Body", "rgStep5Body", "rgLightVehicle", "rgMisfuelBody", "rgStaff", "rgAttribution"] as const) expect(html).toContain(messages[locale][key]);
  expect(html.match(/href="([^"]+)"/g)).toEqual([
    'href="https://www.fdma.go.jp/laws/tutatsu/post1258/"',
    'href="https://www.fdma.go.jp/publication/ugoki/items/190507-3.pdf"',
    'href="https://www.fdma.go.jp/about/others/post3.html"',
    'href="https://jaf.or.jp/"',
    `href="/${locale}/"`,
  ]);
  expect(html).not.toMatch(/<dialog\b|<nav\b|<img\b|<form\b|<select\b/);
  expect(html).toContain('<h1 id="refuel-guide-title">');
});
