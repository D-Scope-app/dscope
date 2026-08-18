import { formatCompact } from "../model";

export function ChipGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="chip-group">
      <h3>{title}</h3>
      <div className="chip-grid">
        {values.map((value) => (
          <button
            key={value}
            className={selected.includes(value) ? "selected" : ""}
            type="button"
            onClick={() => onToggle(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatCompact(value)}</strong>
    </div>
  );
}

export function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{formatCompact(value)}</strong>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "blue" | "red";
  children: string | number | null | undefined;
}) {
  return <span className={`pill pill-${tone}`}>{formatCompact(children)}</span>;
}
