export type IconName = "pump" | "return" | "fuel" | "guide";
const paths: Record<IconName, string> = {
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
