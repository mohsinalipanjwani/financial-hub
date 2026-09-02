import { redirect } from "next/navigation";
import { getSession, canManageConfig } from "@/lib/auth";
import { getShellData } from "@/lib/layout-data";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const shell = await getShellData();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar issueCount={shell.issueCount} canManage={canManageConfig(user.role)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar user={user} lastSynced={shell.lastSynced} issueCount={shell.issueCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
