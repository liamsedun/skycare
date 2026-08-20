"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ngn } from "@/lib/auth";
import { emptyState } from "@/lib/ui-constants";

export interface RevenuePoint {
  month: string;
  revenue: number;
}

export default function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.length === 0) {
    return (
      <p className={emptyState}>
        No revenue data yet.
      </p>
    );
  }

  const points = data.map((point) => ({
    ...point,
    month: new Intl.DateTimeFormat("en-NG", {
      month: "short",
    }).format(new Date(`${point.month}-01T00:00:00Z`)),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ecfc" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={{ stroke: "#e4ecfc" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value: number) => `₦${(value / 1000).toFixed(0)}k`}
          width={56}
        />
        <Tooltip
          formatter={(value) => [ngn(Number(value)), "Revenue"]}
          cursor={{ fill: "#eff6ff" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e4ecfc",
            fontSize: 13,
            boxShadow: "0 10px 15px rgb(0 0 0 / 0.08)",
          }}
        />
        <Bar dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
