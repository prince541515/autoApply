"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Zap,
  FileText,
  TrendingUp,
  Server,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatsCard } from "@/components/stats-card";
import { ApplicationsOverTime } from "@/components/charts/applications-over-time";
import api from "@/lib/api";
import type { AdminDashboardData } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  queued: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  applying: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  applied: "bg-green-500/20 text-green-400 border-green-500/30",
  viewed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  shortlisted: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  interview: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const PORTAL_COLORS: Record<string, string> = {
  linkedin: "#0a66c2",
  naukri: "#a855f7",
  indeed: "#1e3a5f",
  wellfound: "#22c55e",
  glassdoor: "#0caa41",
};

const DEFAULT_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444"];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<AdminDashboardData>("/dashboard/admin-stats");
        setData(res.data);
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Failed to load dashboard data
      </div>
    );
  }

  const { stats, activity_over_time, top_candidates, portal_performance, recent_applications, system_status } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform-wide overview and analytics.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/candidates" className="block">
          <StatsCard
            title="Total Candidates"
            value={stats.total_candidates}
            description="Registered candidates — click to view"
            icon={Users}
          />
        </Link>
        <StatsCard
          title="Active Auto-Apply"
          value={stats.active_auto_apply}
          description="Candidates with auto-apply on"
          icon={Zap}
        />
        <StatsCard
          title="Applications Today"
          value={stats.total_applications_today}
          description="Submitted today"
          icon={FileText}
        />
        <StatsCard
          title="Overall Success Rate"
          value={`${stats.overall_success_rate}%`}
          description="Shortlisted + interview / total"
          icon={TrendingUp}
        />
      </div>

      {/* Platform Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Activity</CardTitle>
          <CardDescription>
            Total applications across all candidates — last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationsOverTime data={activity_over_time} />
        </CardContent>
      </Card>

      {/* Top Candidates + Portal Performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Candidates</CardTitle>
            <CardDescription>Ranked by application count</CardDescription>
          </CardHeader>
          <CardContent>
            {top_candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No candidates yet
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Applications</TableHead>
                    <TableHead className="text-right">Success Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_candidates.map((c, i) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/candidates/${c.id}`)}
                    >
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/candidates/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.application_count}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            c.success_rate >= 20
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : c.success_rate >= 10
                                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                : ""
                          }
                        >
                          {c.success_rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portal Performance</CardTitle>
            <CardDescription>Success rate by portal</CardDescription>
          </CardHeader>
          <CardContent>
            {portal_performance.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No portal data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={portal_performance}
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <XAxis
                    dataKey="portal"
                    stroke="#525252"
                    tick={{ fill: "#a3a3a3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) =>
                      v.charAt(0).toUpperCase() + v.slice(1)
                    }
                  />
                  <YAxis
                    stroke="#525252"
                    tick={{ fill: "#a3a3a3", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c1c1c",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#e5e5e5",
                    }}
                    formatter={(value: number, _name: string, props: { payload: { total: number } }) => [
                      `${value}% (${props.payload.total} total)`,
                      "Success Rate",
                    ]}
                    labelFormatter={(label: string) =>
                      label.charAt(0).toUpperCase() + label.slice(1)
                    }
                  />
                  <Bar
                    dataKey="success_rate"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  >
                    {portal_performance.map((entry, index) => (
                      <Cell
                        key={entry.portal}
                        fill={
                          PORTAL_COLORS[entry.portal.toLowerCase()] ||
                          DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Applications + System Status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>Last 20 applications across all candidates</CardDescription>
          </CardHeader>
          <CardContent>
            {recent_applications.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No applications yet
              </p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Portal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent_applications.map((app) => {
                      const badgeClass =
                        STATUS_BADGE_CLASSES[app.status] || "";
                      return (
                        <TableRow key={app.id}>
                          <TableCell className="max-w-[180px] truncate font-medium">
                            {app.job_title}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {app.company}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {app.candidate_name}
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {app.portal}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`capitalize ${badgeClass}`}
                            >
                              {app.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(app.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Workers</span>
              <span className="font-medium">{system_status.active_workers}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Queue Depth</span>
              <Badge
                variant="outline"
                className={
                  system_status.queue_depth > 50
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : ""
                }
              >
                {system_status.queue_depth}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Last Scrape</span>
              <span className="font-medium">
                {system_status.last_scrape_time
                  ? new Date(system_status.last_scrape_time).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Candidates</span>
                <span className="font-medium">{stats.total_candidates}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Auto-Apply Active</span>
                <Badge
                  variant={stats.active_auto_apply > 0 ? "default" : "outline"}
                  className={
                    stats.active_auto_apply > 0
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : ""
                  }
                >
                  {stats.active_auto_apply}
                </Badge>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Apps Today</span>
                <span className="font-medium">{stats.total_applications_today}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
