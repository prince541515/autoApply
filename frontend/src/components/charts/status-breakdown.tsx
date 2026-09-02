"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { StatusBreakdown as StatusBreakdownType } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  queued: "#6b7280",
  applying: "#3b82f6",
  applied: "#22c55e",
  viewed: "#eab308",
  shortlisted: "#a855f7",
  rejected: "#ef4444",
  interview: "#10b981",
  cancelled: "#9ca3af",
};

interface StatusBreakdownProps {
  data: StatusBreakdownType[];
}

export function StatusBreakdownChart({ data }: StatusBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No status data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis
          dataKey="status"
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
        />
        <YAxis
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#e5e5e5",
          }}
          formatter={(value) => [Number(value ?? 0), "Applications"]}
          labelFormatter={(label) => {
            const text = String(label ?? "");
            return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={STATUS_COLORS[entry.status] || "#6b7280"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
