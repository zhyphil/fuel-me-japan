export type PrivacyResult = "opened" | "unavailable" | "not-applicable";
type TcData = { gdprApplies?: boolean; listenerId?: number; eventStatus?: string };
type ConsentWindow = Window & {
  googlefc?: {
    callbackQueue?: { push(item: { CONSENT_API_READY(): void }): unknown };
    showRevocationMessage?: () => void;
  };
  __tcfapi?: (command: string, version: number, callback: (data: TcData, success: boolean) => void, parameter?: number) => void;
};

// Use Google's certified consent UI. Never interpret API readiness as consent,
// write a consent string ourselves, or resume advertising from this action.
export function openPrivacyChoices(onResult: (result: PrivacyResult) => void): () => void {
  const target = window as ConsentWindow;
  let active = true;
  let requested = false;
  let listenerId: number | undefined;
  const removeListener = () => {
    if (listenerId === undefined) return;
    const id = listenerId; listenerId = undefined;
    try { target.__tcfapi?.("removeEventListener", 0, () => undefined, id); } catch { /* Optional provider cleanup. */ }
  };
  const finish = (result: PrivacyResult) => {
    if (!active) return;
    active = false; clearTimeout(timer); removeListener(); onResult(result);
  };
  const timer = window.setTimeout(() => finish("unavailable"), 5000);
  try {
    target.googlefc ??= {};
    target.googlefc.callbackQueue ??= [];
    target.googlefc.callbackQueue.push({ CONSENT_API_READY: () => {
      if (!active) return;
      if (!target.__tcfapi || !target.googlefc?.showRevocationMessage) { finish("unavailable"); return; }
      try {
        target.__tcfapi("addEventListener", 0, (data, success) => {
          if (data?.listenerId !== undefined) listenerId = data.listenerId;
          if (!active) { removeListener(); return; }
          if (!success) { finish("unavailable"); return; }
          if (data?.gdprApplies === false) { finish("not-applicable"); return; }
          if (data?.gdprApplies !== true) return;
          // API readiness is not proof that Google actually displayed its UI.
          if (data.eventStatus === "cmpuishown") { finish("opened"); return; }
          // Revocation can synchronously emit TCF events; request only once and
          // keep listening until the UI appears or the existing timeout expires.
          if (requested) return;
          requested = true;
          try { target.googlefc!.showRevocationMessage!(); }
          catch { finish("unavailable"); }
        });
      } catch { finish("unavailable"); }
    } });
  } catch { finish("unavailable"); }
  return () => { active = false; clearTimeout(timer); removeListener(); };
}
