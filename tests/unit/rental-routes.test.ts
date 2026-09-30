import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../../src/App";
import { locales, messages } from "../../src/i18n";
import { parseRoute, rentalHref, localizedHref, safeWebsite } from "../../src/lib/routes";
import { readRentalQuery, rentalQueryString } from "../../src/lib/rental-view";
import { parseIndex, parseManifest, findRentalById } from "../../src/lib/rental";
import { readFileSync } from "node:fs";
const manifest = parseManifest(JSON.parse(readFileSync("public/data/rental/nationwide/manifest.json", "utf8")));
const index = parseIndex(JSON.parse(readFileSync(`public${manifest.index.url}`, "utf8")), manifest);

describe("independent rental routes", () => {
  it.each(locales)("%s has refreshable directory and detail routes and matching locale links", locale => {
    expect(parseRoute(`/${locale}/`).kind).toBe("home");
    expect(parseRoute(rentalHref(locale)).kind).toBe("directory");
    const path = rentalHref(locale, "times-narita-airport");
    const route = parseRoute(path, "?region=JP-12&q=NRT&page=2");
    expect(route).toMatchObject({ kind: "detail", locale, id: "times-narita-airport" });
    expect(localizedHref(route, "th")).toBe("/th/return-car/times-narita-airport/?region=JP-12&q=NRT&page=2");
    const home = renderToStaticMarkup(createElement(App, { locale }));
    expect(home).toContain(`href="/${locale}/return-car/"`);
    expect(home).not.toContain('return-car-dialog');
    expect(home.match(/class="locale-switcher"/g)).toHaveLength(1);
    const shell = renderToStaticMarkup(createElement(App, { locale, initialRoute: parseRoute(rentalHref(locale)), rentalShell: true }));
    expect(shell).toContain(messages[locale].rdTitle);
    expect(shell).not.toContain('id="prefecture"');
    expect(shell.match(/class="locale-switcher"/g)).toHaveLength(1);
  });
  it.each(["/en/return-car/%2F/", "/en/return-car/<script>/", "/en/return-car/a/b/", "/de/return-car/", "/en/return-car/%E0%A4%A/", "/en/return-car//"])("invalid path never becomes the fuel homepage: %s", path => {
    expect(parseRoute(path).kind).toBe("not-found");
  });
  it("resolves current aliases without guessing unknown IDs", () => {
    const row = index.records.find(row => row.aliases.length)!;
    expect(findRentalById(index, row.aliases[0])?.id).toBe(row.id);
    expect(findRentalById(index, "does-not-exist")).toBeUndefined();
  });
  it("round-trips directory filters without coordinates or arbitrary query fields", () => {
    const query = readRentalQuery("?region=JP-12&company=times&q=NRT&page=2&counters=1&lat=35&lon=140&tracking=x", index);
    expect(query).toEqual({ prefecture: "JP-12", company: "times", query: "NRT", page: 2, pageSize: 25, counters: true });
    expect(rentalQueryString(query)).toBe("?region=JP-12&company=times&q=NRT&page=2&counters=1");
    expect(readRentalQuery("?region=JP-99&company=FAKE&page=-2", index)).toMatchObject({ prefecture: "", company: "", page: 1 });
  });
  it.each([10, 25, 50, 100])("round-trips the supported %i rows per page with directory filters", pageSize => {
    const query = readRentalQuery(`?region=JP-12&company=times&q=NRT&page=2&perPage=${pageSize}&counters=1`, index);
    expect(query).toMatchObject({ prefecture: "JP-12", company: "times", query: "NRT", page: 2, pageSize, counters: true });
    const serialized = rentalQueryString(query);
    expect(new URLSearchParams(serialized).get("perPage")).toBe(pageSize === 25 ? null : String(pageSize));
    expect(readRentalQuery(serialized, index)).toEqual(query);
  });
  it.each(["", "20", "0", "-10", "500", "25.5", "garbage"])("falls back to 25 for an absent or invalid per-page value: %s", value => {
    expect(readRentalQuery(`?perPage=${value}`, index)).toMatchObject({ pageSize: 25 });
  });
  it("allows pages beyond 500 so all nationwide records remain reachable at ten per page", () => {
    expect(readRentalQuery("?page=739&perPage=10", index)).toMatchObject({ page: 739, pageSize: 10 });
  });
  it("only enables safe https recorded websites", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "https://user:pass@example.com", "//example.com", "https://example.com\\evil", "not-a-url"]) expect(safeWebsite(value)).toBeNull();
    expect(safeWebsite("https://example.com/shop?x=1")).toBe("https://example.com/shop?x=1");
  });
});

import { RentalDirectory } from "../../src/components/RentalDirectory";
import { ReturnCar } from "../../src/components/ReturnCar";
import { parsePartition } from "../../src/lib/rental";
import { StationMiniMap } from "../../src/components/StationMiniMap";
import { MapThumbnail } from "../../src/components/MapThumbnail";
import type { Station } from "../../src/lib/stations";

it("renders only one result page and escapes untrusted branch text", () => {
  const html = renderToStaticMarkup(createElement(RentalDirectory, { index, locale: "en", search: "", tileUrl: null, active: true }));
  expect(html.match(/class="rental-card"/g)).toHaveLength(25);
  expect(html.match(/class="station-mini-map"/g)).toHaveLength(25);
  expect(html).not.toContain('status-counter_only');
  const unsafe = structuredClone(index); unsafe.records = [{ ...index.records[0], names: { primary: '<script>alert("x")</script>', languages: {} } }];
  const safe = renderToStaticMarkup(createElement(RentalDirectory, { index: unsafe, locale: "en", search: "", tileUrl: null, active: true }));
  expect(safe).toContain('&lt;script&gt;'); expect(safe).not.toContain('<script>');
});
it("counter details cannot instantiate a fuel or return-navigation workflow", () => {
  const counter = index.records.find(row => row.candidateStatus === "COUNTER_ONLY")!;
  const artifact = manifest.partitions.find(p => p.code === counter.prefectureCode)!;
  const data = parsePartition(JSON.parse(readFileSync(`public${artifact.url}`, "utf8")), manifest, index);
  const location = data.records.find(row => row.id === counter.id)!;
  const html = renderToStaticMarkup(createElement(ReturnCar, { location, locale: "en", fuel: "REGULAR", tileUrl: null }));
  expect(html).toContain(messages.en.rdCounterHelp);
  expect(html).not.toContain('return-fuel'); expect(html).not.toContain('maps.google'); expect(html).not.toContain('return-navigation');
});
it("keeps fuel thumbnail DOM and ARIA while rental thumbnails are real links", () => {
  const station = { id: "osm:node:1", lat: 35, lon: 139, name: "Fixture", normalizedBrand: "UNKNOWN" } as Station;
  const staticThumb = renderToStaticMarkup(createElement(StationMiniMap, { station, locale: "en", tileUrl: null }));
  expect(staticThumb).toContain('class="station-mini-map-preview" role="img"');
  expect(staticThumb).toContain(messages.en.smPreview.replace("{name}", "Fixture"));
  const interactive = renderToStaticMarkup(createElement(StationMiniMap, { station, locale: "en", tileUrl: null, onOpen: () => {} }));
  expect(interactive).toContain('id="thumbnail-osm:node:1"'); expect(interactive).toContain('<button');
  const rental = renderToStaticMarkup(createElement(MapThumbnail, { point: { lat: 35, lon: 139 }, id: "rental-test", name: "Branch", icon: "/icons/rental-car.svg", locale: "en", tileUrl: null, href: "/en/return-car/rental-test/", openLabel: messages.en.rdOpenMap, previewLabel: messages.en.rdPreviewMap }));
  expect(rental).toContain('href="/en/return-car/rental-test/"'); expect(rental).toContain('/icons/rental-car.svg'); expect(rental).not.toContain('fuel-pump');
});
