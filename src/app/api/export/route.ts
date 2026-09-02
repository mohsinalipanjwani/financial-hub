import { NextRequest, NextResponse } from "next/server";
import { getSession, canViewFinancials } from "@/lib/auth";
import { resolvePeriod } from "@/lib/finance/period";
import { revenueCsv, paymentsCsv, clientsCsv, pnlCsv, reportFilename, type ReportType } from "@/lib/export/reports";

const BUILDERS: Record<ReportType, (p: ReturnType<typeof resolvePeriod>, f: { clientId?: string; source?: string }) => Promise<string>> = {
  revenue: revenueCsv,
  payments: paymentsCsv,
  clients: clientsCsv,
  pnl: pnlCsv,
};

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canViewFinancials(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const type = sp.type as ReportType;
  const builder = BUILDERS[type];
  if (!builder) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });

  const period = resolvePeriod(sp);
  const csv = await builder(period, { clientId: sp.clientId, source: sp.source });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFilename(type, period)}"`,
    },
  });
}
