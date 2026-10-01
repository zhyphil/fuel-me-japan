import { useLayoutEffect, useRef, type ReactNode } from "react";

// Use the same boundary as the full-screen CSS, including touch-phone landscape.
const mobilePanel = "(max-width: 650px), (max-height: 500px) and (pointer: coarse)";

function lockPageScroll() {
  const { scrollX, scrollY } = window;
  const body = document.body;
  const html = document.documentElement;
  const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: html.style.overflow };
  // A fixed body also prevents iOS rubber-banding from moving the underlying map.
  Object.assign(body.style, { position: "fixed", top: `${-scrollY}px`, left: `${-scrollX}px`, width: "100%" });
  html.style.overflow = "hidden";
  return () => {
    Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left, width: previous.width });
    html.style.overflow = previous.overflow;
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
  };
}

export function MapDetailPanel({ children, labelledBy, onClose }: { children: ReactNode; labelledBy: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const panel = dialog.current!;
    const media = window.matchMedia(mobilePanel);
    let unlock: (() => void) | undefined;
    function present() {
      const focused = panel.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      if (panel.open) panel.close();
      unlock?.(); unlock = undefined;
      if (media.matches) { unlock = lockPageScroll(); panel.showModal(); }
      else panel.show();
      focused?.focus({ preventScroll: true });
    }
    present();
    media.addEventListener("change", present);
    return () => { media.removeEventListener("change", present); panel.close(); unlock?.(); };
  }, []);
  return <dialog ref={dialog} className="map-detail-panel" aria-labelledby={labelledBy}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    {children}
  </dialog>;
}
