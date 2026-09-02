"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  LineChart,
  PieChart,
  Bar,
  Line,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

const PALETTE = ["#4f46e5", "#0ea5e9", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#22c55e", "#ef4444"];
const AXIS = { fontSize: 12, fill: "#64748b" };

function money(v: number) {
  return formatCurrency(v, "USD", { compact: true });
}

const contentStyle = {
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
};

// Recharts' Formatter param is broad (ValueType | undefined); accept unknown.
const moneyFormatter = (v: unknown) => formatCurrency(Number(v), "USD");

const tooltipStyle = { contentStyle, formatter: moneyFormatter };

export function RevenueVsCostChart({
  data,
}: {
  data: { month: string; revenue: number; totalCost: number; netProfit: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money} width={60} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={16} />
        <Bar dataKey="totalCost" name="Total Cost" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={16} />
        <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#16a34a" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TrendChart<T extends { month: string }>({
  data,
  dataKey,
  color = "#4f46e5",
  name,
}: {
  data: T[];
  dataKey: string;
  color?: string;
  name: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money} width={60} />
        <Tooltip {...tooltipStyle} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2.5} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data,
  dataKey = "value",
  color = "#4f46e5",
}: {
  data: { name: string; value: number }[];
  dataKey?: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money} />
        <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={130} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(79,70,229,0.05)" }} />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VerticalBarChart({
  data,
  dataKey = "value",
  color = "#4f46e5",
}: {
  data: { name: string; value: number }[];
  dataKey?: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money} width={60} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(79,70,229,0.05)" }} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={contentStyle}
          formatter={(v: unknown): [string, string] => {
            const num = Number(v);
            const pct = total ? ((num / total) * 100).toFixed(1) : "0";
            return [`${formatCurrency(num)} (${pct}%)`, ""];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MiniSparkline({ data, color = "#4f46e5" }: { data: number[]; color?: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={points} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
