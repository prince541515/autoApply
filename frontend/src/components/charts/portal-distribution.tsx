"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PortalDistribution as PortalDistributionType } from "@/types";

const PORTAL_COLORS: Record<string, string> = {
  linkedin: "#0a66c2",
  naukri: "#a855f7",
  indeed: "#1e3a5f",
  wellfound: "#22c55e",
  glassdoor: "#0caa41",
  dice: "#eb1c26",
};

const DEFAULT_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#06b6d4"];

interface PortalDistributionProps {
  data: PortalDistributionType[];
}

export function PortalDistribution({ data }: PortalDistributionProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No portal data yet
      </div>
    );
  }

  const getColor = (portal: string, index: number) =>
    PORTAL_COLORS[portal.toLowerCase()] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="count"
          nameKey="portal"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((entry, index) => (
            <Cell key={entry.portal} fill={getColor(entry.portal, index)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#e5e5e5",
          }}
          formatter={(value: number, name: string, props: { payload: PortalDistributionType }) => [
            `${value} (${props.payload.percentage}%)`,
            name,
          ]}
        />
        <Legend
          formatter={(value: string) => (
            <span className="text-sm capitalize text-muted-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
