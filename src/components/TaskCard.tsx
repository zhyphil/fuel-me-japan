import { Icon, type IconName } from "./Icon";
export function TaskCard({
  icon,
  title,
  description,
  status,
  primary = false,
}: {
  icon: IconName;
  title: string;
  description: string;
  status: string;
  primary?: boolean;
}) {
  return (
    <article className={`task-card${primary ? " task-card-primary" : ""}`}>
      <span className="task-icon">
        <Icon name={icon} />
      </span>
      <div className="task-content">
        <h3>{title}</h3>
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
