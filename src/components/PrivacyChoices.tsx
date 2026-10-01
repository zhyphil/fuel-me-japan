import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "../i18n";
import { openPrivacyChoices, type PrivacyResult } from "../lib/ad-privacy";

export function PrivacyChoices({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const [status, setStatus] = useState<PrivacyResult | "idle" | "opening">("idle");
  const cancel = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancel.current?.(), []);
  return <div className="privacy-choices">
    <button className="text-button" type="button" disabled={status === "opening"} aria-busy={status === "opening"} onClick={() => {
      cancel.current?.(); setStatus("opening"); cancel.current = openPrivacyChoices(setStatus);
    }}>{t.adPrivacyChoices}</button>
    {status === "opening" && <p role="status">{t.adPrivacyOpening}</p>}
    {status === "unavailable" && <p role="status">{t.adPrivacyUnavailable}</p>}
    {status === "not-applicable" && <p role="status">{t.adPrivacyNotApplicable}</p>}
  </div>;
}
