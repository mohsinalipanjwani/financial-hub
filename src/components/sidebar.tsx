"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "▦" },
  { href: "/clients", label: "Clients", icon: "◍" },
  { href: "/revenue", label: "Revenue", icon: "▲" },
  { href: "/team", label: "Team", icon: "♦" },
  { href: "/subscriptions", label: "Subscriptions", icon: "◇" },
  { href: "/expenses", label: "Expenses", icon: "▽" },
  { href: "/payments", label: "Payments", icon: "≡" },
  { href: "/pnl", label: "P&L", icon: "∑" },
  { href: "/data-quality", label: "Data Quality", icon: "⚠" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ issueCount }: { issueCount: number }) {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 shrink-0 flex flex-col"
      style={{ background: "var(--sidebar)", color: "var(--sidebar-fg)" }}
    >
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: "var(--primary)" }}>
          FH
        </div>
        <div>
          <div className="font-semibold text-sm">Financial Hub</div>
          <div className="text-xs" style={{ color: "var(--sidebar-muted)" }}>Internal</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                background: active ? "var(--sidebar-active)" : "transparent",
                color: active ? "#fff" : "var(--sidebar-fg)",
              }}
            >
              <span className="w-4 text-center opacity-80">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/data-quality" && issueCount > 0 && (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--warning)", color: "#fff" }}>
                  {issueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs border-t border-white/10" style={{ color: "var(--sidebar-muted)" }}>
        Phase 1 · Seeded data
      </div>
    </aside>
  );
}
