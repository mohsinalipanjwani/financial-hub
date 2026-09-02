import { formatPercent } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  change,
  invertChange = false,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  invertChange?: boolean; // for costs: down is good
  hint?: string;
}) {
  const hasChange = change !== undefined && change !== null;
  const good = hasChange ? (invertChange ? change! < 0 : change! > 0) : false;
  const neutral = hasChange && change === 0;

  return (
    <div className="card p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1.5 tabular-nums">{value}</div>
      {hasChange ? (
        <div
          className="text-xs mt-2 font-medium flex items-center gap-1"
          style={{ color: neutral ? "var(--muted)" : good ? "var(--positive)" : "var(--negative)" }}
        >
          <span>{change! > 0 ? "↑" : change! < 0 ? "↓" : "→"}</span>
          {formatPercent(Math.abs(change!))} vs prev.
        </div>
      ) : (
        <div className="text-xs mt-2 text-muted">{hint ?? " "}</div>
      )}
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold mb-4">{children}</h2>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-3xl mb-2 opacity-40">◔</div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "warning" }) {
  const tones: Record<string, string> = {
    neutral: "background:rgba(100,116,139,0.12);color:#475569",
    positive: "background:rgba(22,163,74,0.12);color:#15803d",
    negative: "background:rgba(220,38,38,0.12);color:#b91c1c",
    warning: "background:rgba(217,119,6,0.12);color:#b45309",
  };
  const style = Object.fromEntries(tones[tone].split(";").map((s) => s.split(":"))) as React.CSSProperties;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={style}>
      {children}
    </span>
  );
}
