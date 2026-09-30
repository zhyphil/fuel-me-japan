import { isLocale, type Locale } from "../i18n";
export const eventNames = [
  "landing_view",
  "locale_selected",
  "find_fuel_click",
  "location_requested",
  "location_allowed",
  "location_denied",
  "station_view",
  "gogo_click",
  "navigate_click",
  "my_fuel_start",
  "my_fuel_success",
  "my_fuel_unknown",
  "refuel_guide_open",
  "refuel_guide_complete",
  "return_car_start",
  "return_location_selected",
  "return_station_selected",
  "return_navigation_click",
  "feedback_click",
] as const;
export type EventName = (typeof eventNames)[number];
export interface AnalyticsEvent {
  name: EventName;
  properties: { locale: Locale };
}
export type AnalyticsAdapter = (event: AnalyticsEvent) => void | Promise<void>;
// No provider, cookies, identifier, persistence or network transport in M0.0.
export function createAnalytics(adapter: AnalyticsAdapter = () => undefined) {
  return {
    track(name: EventName, properties: { locale: Locale }): void {
      if (!eventNames.includes(name) || !isLocale(properties.locale)) return;
      // Intentionally copy ONLY this allowlisted enum. Never forward arbitrary objects.
      const safeEvent = { name, properties: { locale: properties.locale } };
      try {
        void Promise.resolve(adapter(safeEvent)).catch(() => undefined);
      } catch {
        /* Telemetry cannot break UI. */
      }
    },
  };
}
export const analytics = createAnalytics();
