import { describe, expect, it } from "vitest";
import { formatOpeningHours } from "../../src/lib/opening-hours";
import { locales, type Locale } from "../../src/i18n";

const example = "Mo-Sa 08:00-18:00; Su off; Jan 01-03 off";
const expected: Record<Locale, string[]> = {
  en: ["Monday–Saturday: 08:00–18:00", "Sunday: Closed", "January 1–January 3: Closed"],
  "zh-Hans": ["星期一至星期六：08:00–18:00", "星期日：休息", "1月1日至1月3日：休息"],
  "zh-Hant": ["星期一至星期六：08:00–18:00", "星期日：休息", "1月1日至1月3日：休息"],
  ko: ["월요일–토요일: 08:00–18:00", "일요일: 휴무", "1월 1일–1월 3일: 휴무"],
  th: ["วันจันทร์–วันเสาร์: 08:00–18:00", "วันอาทิตย์: ปิด", "1 มกราคม–3 มกราคม: ปิด"],
};

describe("recorded opening hours display", () => {
  it.each(locales)("translates the user example into %s without dropping date exceptions", (locale) => {
    expect(formatOpeningHours(example, locale)).toEqual({ kind: "translated", lines: expected[locale] });
  });
  it.each(locales)("localizes 24/7 in %s", (locale) => {
    const labels = { en: "Open 24 hours every day", "zh-Hans": "每天 24 小时营业", "zh-Hant": "每天 24 小時營業", ko: "매일 24시간 영업", th: "เปิดตลอด 24 ชั่วโมงทุกวัน" };
    expect(formatOpeningHours("24/7", locale)).toEqual({ kind: "translated", lines: [labels[locale]] });
  });
  it("keeps missing data unknown instead of assuming any schedule", () => {
    for (const value of [undefined, null, "", "  "]) expect(formatOpeningHours(value, "zh-Hans")).toEqual({ kind: "unknown", lines: ["未知"] });
  });
  it("keeps rule order, weekday unions, split shifts and local public holidays", () => {
    expect(formatOpeningHours("Mo,We-Fr 08:00-12:00,13:00-18:00; Su,PH off", "zh-Hans").lines).toEqual([
      "星期一、星期三至星期五：08:00–12:00、13:00–18:00", "星期日、日本公共假日：休息",
    ]);
  });
  it("labels overnight clocks and preserves explicit midnight", () => {
    expect(formatOpeningHours("22:00-02:00; Su 06:00-24:00", "zh-Hans").lines).toEqual([
      "每天：22:00–02:00（次日）", "星期日：06:00–24:00",
    ]);
  });
  it("formats date lists and year-wrapping month ranges without inventing years", () => {
    expect(formatOpeningHours("Jan 1-Jan 3 off; Dec 31-Jan 2 off; May 3,May 5 off; Oct-Mar 08:00-17:00", "en").lines).toEqual([
      "January 1–January 3: Closed", "December 31–January 2: Closed", "May 3, May 5: Closed", "October–March: 08:00–17:00",
    ]);
  });
  it("distinguishes recorded open, closed and unknown modifiers", () => {
    expect(formatOpeningHours("Mo open; Tu closed; PH unknown; Fr 09:00-10:00 off", "zh-Hans").lines).toEqual([
      "星期一：营业", "星期二：休息", "日本公共假日：未知", "星期五：09:00–10:00（休息）",
    ]);
  });
  it.each([
    'Mo-Fr 09:00-18:00; Su[2] off', 'Mo 09:00+', 'Mo 09:00-18:00 || "by appointment"',
    'Mo 09:00-18:00 "Su off; call first"', 'Mo-Su 04:00-27:00', 'PH Mo-Fr 09:00-17:00',
    'sunrise-sunset', 'Mo-Fr 09:00-18:00, Sa 10:00-12:00', 'Mo 25:00-26:00',
    'Mo 08:70-18:00', 'Mo 08:00-24:30', 'Feb 30 off', 'Jan 00-03 off', 'Jan 04-01 off',
    'Mo 08:00-08:00', 'Mo 08:00-18:00;', 'Mo 08:00-18:00; invalid',
  ])("preserves the entire unsupported or malformed record: %s", (value) => {
    expect(formatOpeningHours(value, "zh-Hans")).toEqual({ kind: "raw", lines: [value] });
  });
});
