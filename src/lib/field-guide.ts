import provenance from "../../public/field-guides/refuel-sources.json";
import { japaneseLabels, type MessageKey } from "../i18n";

export const guideSteps = [
  { title: "rgStep1Title", body: "rgStep1Body" },
  { title: "rgStep2Title", body: "rgStep2Body" },
  { title: "rgStep3Title", body: "rgStep3Body" },
  { title: "rgStep4Title", body: "rgStep4Body" },
  { title: "rgStep5Title", body: "rgStep5Body" },
] as const satisfies readonly { title: MessageKey; body: MessageKey }[];

export const guideFuelLabels = [
  { japanese: japaneseLabels.regular, key: "myFuelRegular" },
  { japanese: japaneseLabels.highOctane, key: "myFuelHighOctane" },
  { japanese: japaneseLabels.diesel, key: "myFuelDiesel" },
] as const;
export const guideMachineLabels = [
  { japanese: japaneseLabels.selfService, key: "rgSelfService" },
  { japanese: japaneseLabels.cash, key: "rgCash" },
  { japanese: japaneseLabels.member, key: "rgMember" },
  { japanese: japaneseLabels.fullTank, key: "rgFullTank" },
] as const;

export const guideMessageKeys = [
  "rgTitle", "rgClose", "rgPreference", "rgMultiple", "rgPreferenceHelp", "rgLabels", "rgLightVehicle",
  ...guideSteps.flatMap((step) => [step.title, step.body]),
  ...guideFuelLabels.map((label) => label.key),
  ...guideMachineLabels.map((label) => label.key),
  "rgStaff", "rgMisfuelTitle", "rgMisfuelBody", "rgComplete", "rgReviewed", "rgAttribution",
  "rgSourceSafety", "rgSourceSteps", "rgSourceJaf", "rgSourceTerms",
] as const satisfies readonly MessageKey[];

// Separate from the approved station/price registry. Imported at build time; no runtime fetch.
export const fieldGuideProvenance = provenance;
export const guideLinks = {
  safety: provenance.sources.find((source) => source.id === "fdma-safety")!.publicURL,
  steps: provenance.sources.find((source) => source.id === "fdma-self-service")!.publicURL,
  jaf: provenance.sources.find((source) => source.id === "jaf-label-crosscheck")!.publicURL,
  terms: provenance.sources.find((source) => source.id === "fdma-safety")!.termsURL,
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function isHttps(value: unknown): value is string {
  if (!isText(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
const requiredFields = ["id", "owner", "sourceURL", "publicURL", "purpose", "termsURL", "allowedUseAssessment", "attribution", "refreshPolicy", "reviewDate", "transformationVersion"] as const;
const expectedSources = ["fdma-safety", "fdma-self-service", "jaf-label-crosscheck", "jaf-misfuel-crosscheck"];
const approvedPublicURLs = new Set([
  "https://www.fdma.go.jp/laws/tutatsu/post1258/",
  "https://www.fdma.go.jp/publication/ugoki/items/190507-3.pdf",
  "https://jaf.or.jp/",
]);

export function validateFieldGuideSources(value: unknown): string[] {
  if (!isRecord(value)) return ["加油指引来源记录必须为对象。"];
  const errors: string[] = [];
  if (value.schemaVersion !== 1 || value.id !== "refuel-guide") errors.push("加油指引来源记录版本或标识无效。");
  if (!isDate(value.reviewDate) || !isText(value.transformationVersion) || !isText(value.reviewNote)) errors.push("加油指引缺少有效核对日期、转换版本或核对说明。");
  if (!Array.isArray(value.sources)) return [...errors, "加油指引缺少来源列表。"];
  const ids = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source)) { errors.push("来源条目必须为对象。"); continue; }
    for (const field of requiredFields) if (!isText(source[field])) errors.push(`来源 ${String(source.id)} 缺少字段 ${field}。`);
    if (isText(source.id)) {
      if (ids.has(source.id)) errors.push(`重复来源标识：${source.id}。`);
      ids.add(source.id);
    }
    if (!isDate(source.reviewDate) || source.reviewDate !== value.reviewDate || source.transformationVersion !== value.transformationVersion) errors.push(`来源 ${String(source.id)} 的日期或转换版本不一致。`);
    for (const field of ["sourceURL", "publicURL", "termsURL"] as const) if (!isHttps(source[field])) errors.push(`来源 ${String(source.id)} 的 ${field} 必须为 HTTPS URL。`);
    if (!approvedPublicURLs.has(String(source.publicURL))) errors.push(`来源 ${String(source.id)} 的公开链接不在已核对范围。`);
    if (String(source.id).startsWith("jaf-") && source.publicURL !== "https://jaf.or.jp/") errors.push("JAF 公开链接必须为首页。");
    if (String(source.id).startsWith("fdma-") && (source.publicURL !== source.sourceURL || source.termsURL !== "https://www.fdma.go.jp/about/others/post3.html")) errors.push("消防庁公开链接或条款与核对记录不一致。");
  }
  if (ids.size !== expectedSources.length || expectedSources.some((id) => !ids.has(id))) errors.push("加油指引来源集合不完整或包含未核对条目。");
  return errors;
}

export function validateGuideMessages(dictionaries: Record<string, Record<string, string>>, languages: readonly string[]): string[] {
  return languages.flatMap((locale) => guideMessageKeys.filter((key) => !isText(dictionaries[locale]?.[key])).map((key) => `加油指引缺少 ${locale} 文案：${key}。`));
}
