import type { Page } from "@playwright/test";
import type { FuelType } from "../../src/lib/stations";

export async function chooseFuels(page: Page, fuels: readonly FuelType[]) {
  const selection = page.locator("#display-fuel");
  if (await selection.getAttribute("open") === null) await selection.locator("summary").click();
  for (const fuel of fuels) await selection.locator(`input[value="${fuel}"]`).check();
  for (const fuel of ["REGULAR", "HIGH_OCTANE", "DIESEL"]) {
    if (!fuels.includes(fuel as FuelType)) await selection.locator(`input[value="${fuel}"]`).uncheck();
  }
  await selection.locator("summary").press("Escape");
}
