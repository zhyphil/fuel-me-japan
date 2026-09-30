export type IconName = "star" | "pump" | "return" | "fuel" | "guide" | "locate" | "filter" | "brand" | "card" | "service" | "check" | "close" | "cash" | "contactless" | "account" | "charge" | "counter" | "terminal" | "air" | "toilet" | "shower" | "baby" | "laundry" | "truck" | "parking" | "bottle" | "wash";
const paths: Record<IconName, string> = {
  star: "m13 3 3.1 6.4 7.1 1-5.1 5 1.2 7.1-6.3-3.3-6.3 3.3 1.2-7.1-5.1-5 7.1-1L13 3Z",
  filter: "M3 5h20l-8 9v7l-4-2v-5L3 5Z",
  brand: "M4 4h9l10 10-9 9L4 13V4Zm4 4h.01",
  card: "M3 6h20v14H3V6Zm0 5h20M7 16h4",
  service: "M16 3a6 6 0 0 0-7 8L3 17l6 6 6-6a6 6 0 0 0 8-7l-5 4-5-5 3-6Z",
  check: "m6 13 5 5L21 7",
  close: "m6 6 14 14M20 6 6 20",
  cash: "M3 6h20v14H3V6Zm13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 10h1m12 6h1",
  contactless: "M7 9a8 8 0 0 1 0 8m5-11a13 13 0 0 1 0 14m5-17a18 18 0 0 1 0 20",
  account: "M4 22V10l9-7 9 7v12M9 22V12h8v10M3 22h20",
  charge: "m15 2-9 13h7l-2 9 10-14h-8l2-8Z",
  counter: "M3 14h20v9H3v-9Zm6-7a4 4 0 1 1 8 0 4 4 0 0 1-8 0Zm-4 7v-2m16 2v-2",
  terminal: "M6 3h14v20H6V3Zm3 3h8v6H9V6Zm1 10h6m-6 4h6",
  air: "M3 8h13a3 3 0 1 0-3-3M3 13h18a3 3 0 1 1-3 3M3 18h8",
  toilet: "M7 3h5v9H7V3Zm0 9h15a8 8 0 0 1-8 8v3H9v-4a8 8 0 0 1-2-7Z",
  shower: "m4 9 8-6 5 6M7 7l9 5M10 15v2m5-1v2m5-1v2m-8 3v1m6-1v1",
  baby: "M21 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM10 12h.01M16 12h.01m-6 4q3 3 6 0M13 5q-5-5 1-3",
  laundry: "M4 3h18v20H4V3Zm0 5h18M8 5h.01M13 5h.01M18 15a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  truck: "M2 5h13v14H2V5Zm13 5h5l4 5v4h-9M9 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  parking: "M8 22V4h6a6 6 0 0 1 0 12H8",
  bottle: "M10 3h6v5l4 5v10H6V13l4-5V3Zm0 4h6M6 16h14",
  wash: "m6 12 2-6h10l2 6M4 12h18v9H4v-9Zm3 4h2m8 0h2M7 3v1m6-3v3m6-1v1",
  locate: "M13 3v3m0 14v3M3 13h3m14 0h3M20 13a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15.5 13a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  pump: "M5 20V4h10v16M5 10h10M3 20h14m-2-13 4 3v6a2 2 0 0 0 4 0V7l-3-3",
  return: "M4 12h15m-4-4 4 4-4 4M4 7V4h8M4 17v3h8",
  fuel: "M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Zm-3 13a3 3 0 0 0 3 3",
  guide:
    "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm9 3a3 3 0 0 1 3-3h6v15h-5a4 4 0 0 0-4 2M7 8h3m-3 4h3m6-4h3m-3 4h3",
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
