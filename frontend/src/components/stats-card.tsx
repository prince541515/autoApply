import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; direction: "up" | "down" };
  accent?: "violet" | "amber" | "sky" | "emerald";
}

const ACCENT = {
  violet: {
    icon: "bg-violet-500/15 text-violet-400 ring-violet-500/20",
    glow: "from-violet-500/20",
  },
  amber: {
    icon: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
    glow: "from-amber-500/20",
  },
  sky: {
    icon: "bg-sky-500/15 text-sky-400 ring-sky-500/20",
    glow: "from-sky-500/20",
  },
  emerald: {
    icon: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20",
    glow: "from-emerald-500/20",
  },
} as const;

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  accent = "violet",
}: StatsCardProps) {
  const tone = ACCENT[accent];
  return (
    <Card className="relative overflow-hidden border-0 bg-card/70 shadow-none ring-1 ring-white/8 backdrop-blur-sm">
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-gradient-to-br to-transparent blur-2xl",
          tone.glow,
        )}
      />
      <CardContent className="relative flex items-start justify-between pt-1">
        <div className="space-y-2">
          <p className="text-[13px] font-medium tracking-wide text-muted-foreground">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-[1.75rem] font-semibold tracking-tight">{value}</p>
            {trend && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  trend.direction === "up"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400",
                )}
              >
                {trend.direction === "up" ? "+" : "-"}
                {trend.value}%
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground/80">{description}</p>
          )}
        </div>
        <div className={cn("rounded-xl p-2.5 ring-1", tone.icon)}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
