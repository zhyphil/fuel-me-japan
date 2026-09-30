import { isJapanCoordinates, prefectureCodes, type Coordinates, type FuelType, type PartitionCode, type PriceFile, type Station } from "./stations";

// Proper names, in the same ISO 3166-2 order as the data contract and importer.
const names = [
  "北海道 / Hokkaido", "青森 / Aomori", "岩手 / Iwate", "宮城 / Miyagi", "秋田 / Akita", "山形 / Yamagata", "福島 / Fukushima",
  "茨城 / Ibaraki", "栃木 / Tochigi", "群馬 / Gunma", "埼玉 / Saitama", "千葉 / Chiba", "東京 / Tokyo", "神奈川 / Kanagawa",
  "新潟 / Niigata", "富山 / Toyama", "石川 / Ishikawa", "福井 / Fukui", "山梨 / Yamanashi", "長野 / Nagano", "岐阜 / Gifu",
  "静岡 / Shizuoka", "愛知 / Aichi", "三重 / Mie", "滋賀 / Shiga", "京都 / Kyoto", "大阪 / Osaka", "兵庫 / Hyogo", "奈良 / Nara",
  "和歌山 / Wakayama", "鳥取 / Tottori", "島根 / Shimane", "岡山 / Okayama", "広島 / Hiroshima", "山口 / Yamaguchi",
  "徳島 / Tokushima", "香川 / Kagawa", "愛媛 / Ehime", "高知 / Kochi", "福岡 / Fukuoka", "佐賀 / Saga", "長崎 / Nagasaki",
  "熊本 / Kumamoto", "大分 / Oita", "宮崎 / Miyazaki", "鹿児島 / Kagoshima", "沖縄 / Okinawa",
];
export const prefectures = prefectureCodes.map((code, index) => ({ code, name: names[index] }));
export function prefectureName(code: PartitionCode): string | undefined {
  return prefectures.find((prefecture) => prefecture.code === code)?.name;
}
export type MapProvider = "google" | "apple";
export function navigationUrl(provider: MapProvider, destination: Coordinates): string {
  if (!isJapanCoordinates(destination)) throw new Error("Invalid station destination");
  const point = `${destination.lat},${destination.lon}`;
  return provider === "google"
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: point, travelmode: "driving" })}`
    : `https://maps.apple.com/?${new URLSearchParams({ daddr: point, dirflg: "d" })}`;
}
export function mapSearchUrl(provider: MapProvider, manualPlace = ""): string {
  const query = manualPlace.trim() ? `ガソリンスタンド ${manualPlace.trim()}` : "gas station near me";
  return provider === "google"
    ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`
    : `https://maps.apple.com/?${new URLSearchParams({ q: query })}`;
}
export function filterStations<T extends Station>(stations: T[], query: string): T[] {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!needle) return stations;
  return stations.filter((station) => [station.name, station.originalBrand, station.city, station.address]
    .some((value) => value?.normalize("NFKC").toLocaleLowerCase().includes(needle)));
}
export const priceStaleDays = 14;
export function isPriceStale(surveyDate: string, now = Date.now()): boolean {
  const date = Date.parse(`${surveyDate}T00:00:00Z`);
  return !Number.isFinite(date) || now - date > priceStaleDays * 86_400_000;
}
export const fuelTypes: FuelType[] = ["REGULAR", "HIGH_OCTANE", "DIESEL"];
export function prefecturalPrices(data: PriceFile | null, code: PartitionCode) {
  return fuelTypes.map((fuelType) => ({ fuelType, record: code === "UNKNOWN" ? undefined : data?.records.find((row) => row.prefectureCode === code && row.fuelType === fuelType) }));
}
