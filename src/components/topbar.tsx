import Link from "next/link";
import { relativeTime } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { SyncButton } from "./sync-button";
import { canManageConfig, type SessionUser } from "@/lib/auth";

export function Topbar({
  user,
  lastSynced,
  issueCount,
}: {
  user: SessionUser;
  lastSynced: Date | null;
  issueCount: number;
}) {
  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b bg-surface">
      <div className="text-sm text-muted">
        Last synced: <span className="font-medium text-foreground">{relativeTime(lastSynced)}</span>
      </div>

      <div className="flex items-center gap-4">
        {canManageConfig(user.role) && <SyncButton />}

        {issueCount > 0 && (
          <Link
            href="/data-quality"
            className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 font-medium"
            style={{ background: "rgba(217,119,6,0.12)", color: "var(--warning)" }}
          >
            <span>⚠</span>
            {issueCount} data quality {issueCount === 1 ? "issue" : "issues"}
          </Link>
        )}

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium leading-tight">{user.name}</div>
            <div className="text-xs text-muted">{user.role}</div>
          </div>
          <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: "var(--primary)" }}>
            {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
