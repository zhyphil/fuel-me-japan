import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "./offline";
import type { Locale, MessageKey } from "../../src/i18n";
import { parseManifest, parseIndex, parsePartition, rentalManifestUrl, type RentalIndexEntry } from "../../src/lib/rental";
import type { Coordinates, DataManifest, Station } from "../../src/lib/stations";

export { rentalManifestUrl };
export const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
export const messages = Object.fromEntries(locales.map(locale => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<Locale, Record<MessageKey, string>>;
export const rentalManifest = parseManifest(JSON.parse(readFileSync(`public${rentalManifestUrl}`, "utf8")));
export const rentalIndex = parseIndex(JSON.parse(readFileSync(`public${rentalManifest.index.url}`, "utf8")), rentalManifest);
export const officialBranches = rentalIndex.records.filter(row => row.verification === "OFFICIAL_FACILITY_CHECKED");
export const naha = officialBranches.find(row => row.airportCode === "OKA")!;
export const chitose = officialBranches.find(row => row.airportCode === "CTS")!;
export const counter = rentalIndex.records.find(row => row.candidateStatus === "COUNTER_ONLY")!;
export function rentalLocation(row: RentalIndexEntry) {
  const artifact = rentalManifest.partitions.find(p => p.code === row.prefectureCode)!;
  return parsePartition(JSON.parse(readFileSync(`public${artifact.url}`, "utf8")), rentalManifest, rentalIndex).records.find(r => r.id === row.id)!;
}
export function detailPath(row: RentalIndexEntry, locale: Locale = "en", search = "") { return `/${locale}/return-car/${row.id}/${search}`; }

// Serve the shipped bytes unchanged. The real browser loader still checks the manifest,
// SHA-256, lengths, source rights, index/partition consistency and official identities.
export async function rentalFixtures(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-01T00:00:00Z"));
  const paths = new Set([rentalManifestUrl, ...rentalManifest.downloads.map(item => item.url)]);
  await page.route("**/data/rental/nationwide/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (!paths.has(path)) return route.fulfill({ status: 404, body: "Unknown offline rental artifact" });
    return route.fulfill({ contentType: path.endsWith(".json") ? "application/json" : "text/plain", body: readFileSync(`public${path}`) });
  });
  await page.addInitScript(() => {
    const state = { geolocationCalls: 0, aborted: [] as string[] };
    Object.assign(window, { __rentalObservation: state });
    for (const key of ["getCurrentPosition", "watchPosition"] as const) Object.defineProperty(navigator.geolocation, key, { configurable: true, value: () => { state.geolocationCalls++; throw new Error("Rental flow requested geolocation"); } });
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      signal?.addEventListener("abort", () => { state.aborted.push(new URL(url, location.href).pathname); }, { once: true });
      return original(input, init);
    };
  });
}
export async function observations(page: Page) {
  return page.evaluate(() => (window as unknown as { __rentalObservation: { geolocationCalls: number; aborted: string[] } }).__rentalObservation);
}
export async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}
export function stationRow(id: number, point: Coordinates, fields: Partial<Station> = {}): Station {
  return { id: `osm:node:${id}`, osmType: "node", osmId: id, lat: point.lat, lon: point.lon, name: `Fixture station ${id}`, address: `Fixture address ${id}`, prefectureCode: "JP-47", source: "osm", positionMethod: "OSM_NODE", sourceUpdatedAt: "2026-09-29T00:00:00Z", serviceType: "UNKNOWN", paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", fuelRegular: "UNKNOWN", fuelHighOctane: "UNKNOWN", fuelDiesel: "UNKNOWN", ...fields };
}
export const nahaRows = [
  stationRow(1, naha, { name: "Diesel only", fuelRegular: "NO", fuelDiesel: "YES" }),
  stationRow(2, { lat: naha.lat + .001, lon: naha.lon }, { name: "Unknown supply" }),
  stationRow(3, { lat: naha.lat + .002, lon: naha.lon }, { name: "Regular recorded", fuelRegular: "YES", fuelDiesel: "NO", serviceType: "SELF", openingHours: "Mo-Fr 08:00-18:00" }),
  stationRow(4, { lat: naha.lat + .003, lon: naha.lon }, { name: "Complex hours", openingHours: "sunrise-sunset" }),
  stationRow(9, { lat: naha.lat + .3, lon: naha.lon }, { name: "Outside radius" }),
];
const chitoseRows = [stationRow(5, { lat: chitose.lat + .001, lon: chitose.lon }, { name: "Chitose fixture", prefectureCode: "JP-01" })];
export async function stationFixtures(page: Page, options: { empty?: boolean; rows?: Station[] } = {}) {
  const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
  const records = options.empty ? [stationRow(10, { lat: 35.68, lon: 139.76 }, { prefectureCode: "JP-13" })] : options.rows ?? [...nahaRows, ...chitoseRows];
  for (const entry of manifest.stations.partitions) {
    const stations = records.filter(row => row.prefectureCode === entry.code);
    const body = JSON.stringify({ schemaVersion: 1, version: manifest.stations.version, prefectureCode: entry.code, stations });
    entry.count = stations.length; entry.bytes = Buffer.byteLength(body); entry.sha256 = createHash("sha256").update(body).digest("hex");
    entry.bbox = stations.length ? [Math.min(...stations.map(s => s.lon)) - .01, Math.min(...stations.map(s => s.lat)) - .01, Math.max(...stations.map(s => s.lon)) + .01, Math.max(...stations.map(s => s.lat)) + .01] : null;
    entry.cells = entry.bbox ? [entry.bbox] : [];
    await page.route(`**${entry.path}`, route => route.fulfill({ contentType: "application/json", body }));
  }
  manifest.stations.count = manifest.stations.partitions.reduce((sum, p) => sum + p.count, 0);
  await page.route("**/data/manifest.json", route => route.fulfill({ json: manifest }));
  return manifest;
}
export async function fixtures(page: Page, empty = false) {
  await rentalFixtures(page);
  return stationFixtures(page, { empty });
}
export async function openDetail(page: Page, row = naha, locale: Locale = "en") {
  await page.goto(detailPath(row, locale));
  const detail = page.getByTestId("rental-detail");
  await expect(detail).toHaveAttribute("data-rental-id", row.id);
  await expect(detail.locator("#return-fuel")).toBeVisible();
  return detail;
}
// Exercise the application's same-document navigation, rather than page.goto (which
// would conceal missing cleanup on unmount and discard mounted homepage state).
export async function switchBranch(page: Page, row: RentalIndexEntry, locale: Locale = "en") {
  await page.locator("[data-return-directory]").click();
  const directory = page.getByTestId("rental-directory");
  await expect(directory).toBeVisible();
  await directory.locator("#rental-region").selectOption(row.prefectureCode);
  await directory.locator("#rental-company").selectOption(row.companyId);
  await directory.locator("#rental-query").fill(row.airportCode ?? row.names.primary ?? "");
  await directory.getByRole("button", { name: messages[locale].rdSearch, exact: true }).click();
  await directory.locator(`[id="rental-card-${row.id}"]`).click();
  await expect(page.getByTestId("rental-detail")).toHaveAttribute("data-rental-id", row.id);
  await expect(page.locator("#return-fuel")).toBeVisible();
}
export function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /hydrat|Minified React error/i.test(message.text())) errors.push(message.text()); });
  return errors;
}
export async function destination(link: Locator, provider: "google" | "apple" = "google") {
  return new URL(await link.getAttribute("href") ?? "").searchParams.get(provider === "google" ? "destination" : "daddr");
}

export function evidencePath(info: TestInfo, filename: string) {
  const project = (info.project.name || "chromium-default").replace(/[^a-z0-9-]/gi, "-");
  const directory = `reports/evidence/rental-expansion/browser/${project}`;
  mkdirSync(directory, { recursive: true });
  return `${directory}/${filename}`;
}
