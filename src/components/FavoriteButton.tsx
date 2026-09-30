import { messages, type Locale } from "../i18n";
import { Icon } from "./Icon";

export function FavoriteButton({ saved, name, locale, onClick }: { saved: boolean; name: string; locale: Locale; onClick: () => void }) {
  const label = messages[locale][saved ? "lmRemoveFavorite" : "lmAddFavorite"].replace("{name}", name);
  return <button type="button" className="button favorite-button" aria-label={label} title={label} aria-pressed={saved} onClick={onClick}><Icon name="star" /></button>;
}
