/** Small manual whitelist; never changes or promotes downloaded OSM records. */
import contract from "./station-reviewed.json" with { type: "json" };
import type { Station } from "./stations";
import type { MessageKey } from "../i18n";

export type ReviewedStationFields = Pick<Station, "name" | "address" | "openingHours"> & { serviceType?: "SELF" | "FULL" };
export interface StationReview {
  url: string;
  checkedAt: string;
  facts: ReviewedStationFields;
  hoursKey?: Extract<MessageKey, `station.hours.${string}`>;
  osm: Station;
  referencePoint: { lat: number; lon: number };
}
export const stationReviews = contract.records as StationReview[];
const byId = new Map(stationReviews.map(row => [row.osm.id, row]));
export function stationReviewMatches(station: Station, review: StationReview): boolean {
  const original = station.reviewedFacts?.osm ?? station;
  // Any upstream change, even a source timestamp, requires another identity review.
  return Object.keys(original).length === Object.keys(review.osm).length &&
    Object.entries(review.osm).every(([key, value]) => original[key as keyof Station] === value);
}
export function applyReviewedStationFacts(station: Station): Station {
  const review = byId.get(station.id);
  if (!review || !stationReviewMatches(station, review)) return station;
  // Deliberately exclude price, fuel, cards, brand, coordinates and entrance claims.
  const result: Station = { ...station, reviewedFacts: review };
  for (const key of ["name", "address", "openingHours"] as const) if (review.facts[key]) result[key] = review.facts[key];
  if (review.facts.serviceType === "SELF" || review.facts.serviceType === "FULL") result.serviceType = review.facts.serviceType;
  return result;
}
