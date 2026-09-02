"use client";

import {
  Send,
  Eye,
  Star,
  CalendarCheck,
  XCircle,
  Clock,
  Loader2,
  Ban,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ActivityItem } from "@/types";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; badgeClass: string }> = {
  queued: { icon: Clock, color: "text-gray-400", badgeClass: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  applying: { icon: Loader2, color: "text-blue-400", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  applied: { icon: Send, color: "text-green-400", badgeClass: "bg-green-500/20 text-green-400 border-green-500/30" },
  viewed: { icon: Eye, color: "text-yellow-400", badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  shortlisted: { icon: Star, color: "text-purple-400", badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  rejected: { icon: XCircle, color: "text-red-400", badgeClass: "bg-red-500/20 text-red-400 border-red-500/30" },
  interview: { icon: CalendarCheck, color: "text-emerald-400", badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  cancelled: { icon: Ban, color: "text-gray-400", badgeClass: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const config = STATUS_CONFIG[item.new_status] || STATUS_CONFIG.queued;
        const Icon = config.icon;

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
          >
            <div className={`shrink-0 ${config.color}`}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.job_title}{" "}
                <span className="font-normal text-muted-foreground">
                  at {item.company}
                </span>
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 capitalize ${config.badgeClass}`}
                >
                  {item.new_status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(item.timestamp)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
