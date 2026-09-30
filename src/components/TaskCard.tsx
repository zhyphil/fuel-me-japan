import { Icon, type IconName } from "./Icon";
import type { Ref } from "react";
export function TaskCard({
  icon,
  title,
  description,
  status,
  primary = false,
  onClick,
  buttonRef,
  expanded,
}: {
  icon: IconName;
  title: string;
  description: string;
  status: string;
  primary?: boolean;
  onClick?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  return (
    <article className={`task-card${primary ? " task-card-primary" : ""}`}>
      <span className="task-icon">
        <Icon name={icon} />
      </span>
      <div className="task-content">
        <h3>{onClick ? <button ref={buttonRef} type="button" className="task-action" onClick={onClick} aria-controls={expanded ? "find-fuel" : undefined} aria-expanded={expanded}>{title}</button> : title}</h3>
        <p>{description}</p>
        <span className="task-status">{status}</span>
      </div>
      <span className="task-number" aria-hidden="true">
        {primary
          ? "01"
          : icon === "return"
            ? "02"
            : icon === "fuel"
              ? "03"
              : "04"}
      </span>
    </article>
  );
}
