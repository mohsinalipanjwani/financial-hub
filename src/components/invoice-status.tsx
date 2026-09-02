import type { DisplayStatus } from "@/lib/invoice/calc";

const STYLES: Record<DisplayStatus, string> = {
  DRAFT: "background:rgba(100,116,139,0.14);color:#475569",
  ISSUED: "background:rgba(79,70,229,0.12);color:#4338ca",
  SENT: "background:rgba(14,165,233,0.14);color:#0369a1",
  PARTIALLY_PAID: "background:rgba(217,119,6,0.14);color:#b45309",
  PAID: "background:rgba(22,163,74,0.14);color:#15803d",
  OVERDUE: "background:rgba(220,38,38,0.14);color:#b91c1c",
  VOID: "background:rgba(100,116,139,0.14);color:#64748b",
};

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  const style = Object.fromEntries(STYLES[status].split(";").map((s) => s.split(":"))) as React.CSSProperties;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={style}>
      {status.replace("_", " ")}
    </span>
  );
}
