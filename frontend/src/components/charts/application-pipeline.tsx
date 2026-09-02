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
import type { PipelineStage } from "@/types";

const STAGE_COLORS: Record<string, string> = {
  queued: "#6b7280",
  applying: "#3b82f6",
  applied: "#22c55e",
  viewed: "#eab308",
  shortlisted: "#a855f7",
  interview: "#10b981",
};

interface ApplicationPipelineProps {
  data: PipelineStage[];
}

export function ApplicationPipeline({ data }: ApplicationPipelineProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No pipeline data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
        <XAxis
          type="number"
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stage"
          stroke="#525252"
          tick={{ fill: "#a3a3a3", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={90}
          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#e5e5e5",
          }}
          formatter={(value, _name, item) => {
            const pct = Number(
              (item?.payload as PipelineStage | undefined)?.percentage ?? 0,
            );
            return [`${Number(value ?? 0)} (${pct}%)`, "Applications"];
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
          {data.map((entry) => (
            <Cell
              key={entry.stage}
              fill={STAGE_COLORS[entry.stage] || "#6b7280"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
