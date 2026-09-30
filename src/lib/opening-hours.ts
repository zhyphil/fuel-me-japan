import { messages, type Locale } from "../i18n";

export interface OpeningHoursDisplay {
  kind: "translated" | "raw" | "unknown";
  lines: string[];
}
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display a conservative subset of OSM opening_hours; never evaluate open-now.
 * Unsupported syntax retains the WHOLE source, including every exception.
 * Reference: https://wiki.openstreetmap.org/wiki/Key:opening_hours/specification
 */
export function formatOpeningHours(value: string | undefined | null, locale: Locale): OpeningHoursDisplay {
  const t = messages[locale];
  if (!value?.trim()) return { kind: "unknown", lines: [t.ffUnknown] };
  const raw: OpeningHoursDisplay = { kind: "raw", lines: [value] };
  if (value.length > 4096) return raw;
  const range = (from: string, to: string) => t.ffHoursRange.replace("{from}", from).replace("{to}", to);
  // Fixed UTC Gregorian dates only supply localized labels, never station dates.
  const dayLabels = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC", calendar: "gregory" });
  const dateLabels = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC", calendar: "gregory" });
  const monthLabels = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC", calendar: "gregory" });
  const day = (token: string) => dayLabels.format(new Date(Date.UTC(2024, 0, 1 + weekdays.indexOf(token))));
  const state = (token: string) => token === "open" ? t.ffHoursOpen : token === "unknown" ? t.ffUnknown : t.ffHoursClosed;

  function datePart(month: string, date?: string): string | null {
    const index = months.indexOf(month);
    if (index < 0) return null;
    const number = date === undefined ? 1 : Number(date);
    const point = new Date(Date.UTC(2000, index, number));
    if (point.getUTCMonth() !== index || number < 1) return null;
    return (date === undefined ? monthLabels : dateLabels).format(point);
  }
  function dateSelector(token: string): string | null {
    const match = token.match(/^([A-Z][a-z]{2})(?: (\d{1,2}))?(?:-([A-Z][a-z]{2})(?: (\d{1,2}))?|-([0-9]{1,2}))?$/);
    if (!match) return null;
    const [, month, date, endMonth, endDate, shortEnd] = match;
    const from = datePart(month, date);
    if (!from) return null;
    if (!endMonth && !shortEnd) return from;
    const toDate = endDate ?? shortEnd;
    if ((date === undefined) !== (toDate === undefined)) return null;
    if ((endMonth ?? month) === month && date && toDate && Number(toDate) < Number(date)) return null;
    const to = datePart(endMonth ?? month, toDate);
    return to ? range(from, to) : null;
  }
  function selector(value: string): string | null {
    if (!value) return t.ffHoursEveryDay;
    const parts = value.replace(/\s*-\s*/g, "-").split(/\s*,\s*/);
    const isWeekday = (part: string) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?$/.test(part);
    if (parts.every((part) => isWeekday(part) || part === "PH" || part === "SH")) {
      return parts.map((part) => {
        if (part === "PH") return t.ffHoursPublicHolidays;
        if (part === "SH") return t.ffHoursSchoolHolidays;
        const [from, to] = part.split("-");
        return to ? range(day(from), day(to)) : day(from);
      }).join(t.ffHoursListSeparator);
    }
    const labels = parts.map(dateSelector);
    return labels.every((label) => label !== null) ? labels.join(t.ffHoursListSeparator) : null;
  }
  function times(value: string): string | null {
    const spans: string[] = [];
    for (const part of value.split(/\s*,\s*/)) {
      const match = part.match(/^(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)$/);
      if (!match) return null;
      const [, h1, m1, h2, m2] = match;
      const start = Number(h1) * 60 + Number(m1);
      const end = Number(h2) * 60 + Number(m2);
      if (start >= 1440 || end > 1440 || start === end) return null;
      const from = `${h1.padStart(2, "0")}:${m1}`;
      const endClock = `${h2.padStart(2, "0")}:${m2}`;
      const to = end < start ? t.ffHoursNextDay.replace("{time}", endClock) : endClock;
      spans.push(`${from}–${to}`);
    }
    return spans.join(t.ffHoursListSeparator);
  }

  const lines: string[] = [];
  for (const part of value.split(";")) {
    const rule = part.trim().replace(/\s+/g, " ");
    if (rule === "24/7") { lines.push(t.ffHoursAlwaysOpen); continue; }
    const match = rule.match(/^(?:(.+?)\s+)?(off|closed|open|unknown|(?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)(?:\s+(open|off|closed|unknown))?$/);
    if (!match) return raw;
    const [, period = "", action, modifier] = match;
    const label = selector(period);
    const isState = /^(off|closed|open|unknown)$/.test(action);
    if (label === null || (isState && modifier)) return raw;
    let hours = isState ? state(action) : times(action);
    if (hours === null) return raw;
    if (modifier) hours = t.ffHoursWithState.replace("{hours}", hours).replace("{state}", state(modifier));
    lines.push(t.ffHoursRule.replace("{period}", label).replace("{hours}", hours));
  }
  return { kind: "translated", lines };
}
