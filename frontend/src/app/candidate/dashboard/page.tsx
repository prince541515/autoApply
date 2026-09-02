"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Send,
  Star,
  CalendarCheck,
  TrendingUp,
  Zap,
  Loader2,
  Clock,
  ArrowRight,
  Briefcase,
  Globe,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats-card";
import { ApplicationPipeline } from "@/components/charts/application-pipeline";
import { ApplicationsOverTime } from "@/components/charts/applications-over-time";
import { PortalDistribution } from "@/components/charts/portal-distribution";
import { StatusBreakdownChart } from "@/components/charts/status-breakdown";
import { ActivityFeed } from "@/components/activity-feed";
import api from "@/lib/api";
import { useAutoApply } from "@/lib/auto-apply-context";
import type {
  DashboardStatsWithTrends,
  ChartDataPoint,
  PipelineStage,
  PortalDistribution as PortalDistType,
  StatusBreakdown,
  ActivityItem,
  CandidateProfile,
} from "@/types";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function CandidateDashboardPage() {
  const { enabled: autoApplyOn } = useAutoApply();
  const [stats, setStats] = useState<DashboardStatsWithTrends | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [portalDist, setPortalDist] = useState<PortalDistType[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusBreakdown[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const profileRes = await api.get<CandidateProfile[]>("/candidates/");
        if (profileRes.data.length > 0) {
          setProfile(profileRes.data[0]);
        }

        const [statsRes, chartRes, pipelineRes, portalRes, statusRes, activityRes] =
          await Promise.all([
            api.get<DashboardStatsWithTrends>("/dashboard/stats"),
            api.get<ChartDataPoint[]>("/dashboard/chart-data"),
            api.get<PipelineStage[]>("/dashboard/pipeline"),
            api.get<PortalDistType[]>("/dashboard/portal-distribution"),
            api.get<StatusBreakdown[]>("/dashboard/status-breakdown"),
            api.get<ActivityItem[]>("/dashboard/activity?limit=10"),
          ]);

        setStats(statsRes.data);
        setChartData(chartRes.data);
        setPipeline(pipelineRes.data);
        setPortalDist(portalRes.data);
        setStatusBreakdown(statusRes.data);
        setActivity(activityRes.data);
      } catch {
        // New user or empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const successRate =
    stats && stats.total_applications > 0
      ? (
          ((stats.shortlisted_count + stats.interview_count) /
            stats.total_applications) *
          100
        ).toFixed(1) + "%"
      : "0%";

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const queued = pipeline.find((s) => s.stage === "queued")?.count ?? 0;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative space-y-8">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

      <section className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.06] via-card/80 to-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.14),transparent_55%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {today}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {greeting()}, {firstName}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Your application command center. Track pipeline health, portal mix,
              and what moved since last time.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge
                variant="outline"
                className={
                  autoApplyOn
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 bg-white/5 text-muted-foreground"
                }
              >
                <Zap className="mr-1 size-3" />
                Auto-Apply {autoApplyOn ? "running" : "idle"}
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/5">
                <Clock className="mr-1 size-3" />
                {queued} in queue
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/5">
                <Globe className="mr-1 size-3" />
                {stats?.active_portals ?? 0} portals
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="shadow-lg shadow-violet-500/10"
              render={<Link href="/candidate/jobs" />}
            >
              <Briefcase className="mr-2 size-4" />
              Browse jobs
              <ArrowRight className="ml-1 size-4" />
            </Button>
            <Button variant="outline" render={<Link href="/candidate/portals" />}>
              Connect a portal
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Applied"
          value={stats?.total_applications ?? 0}
          description="Jobs applied to"
          icon={Send}
          accent="violet"
          trend={
            stats?.total_applications_trend !== undefined &&
            stats.total_applications_trend !== 0
              ? {
                  value: Math.abs(stats.total_applications_trend),
                  direction: stats.total_applications_trend >= 0 ? "up" : "down",
                }
              : undefined
          }
        />
        <StatsCard
          title="Shortlisted"
          value={stats?.shortlisted_count ?? 0}
          description="Positive responses"
          icon={Star}
          accent="amber"
          trend={
            stats?.shortlisted_trend !== undefined && stats.shortlisted_trend !== 0
              ? {
                  value: Math.abs(stats.shortlisted_trend),
                  direction: stats.shortlisted_trend >= 0 ? "up" : "down",
                }
              : undefined
          }
        />
        <StatsCard
          title="Interviews"
          value={stats?.interview_count ?? 0}
          description="Scheduled interviews"
          icon={CalendarCheck}
          accent="sky"
          trend={
            stats?.interview_trend !== undefined && stats.interview_trend !== 0
              ? {
                  value: Math.abs(stats.interview_trend),
                  direction: stats.interview_trend >= 0 ? "up" : "down",
                }
              : undefined
          }
        />
        <StatsCard
          title="Success Rate"
          value={successRate}
          description="Shortlisted + interview / total"
          icon={TrendingUp}
          accent="emerald"
          trend={
            stats?.success_rate_trend !== undefined &&
            stats.success_rate_trend !== 0
              ? {
                  value: Math.abs(stats.success_rate_trend),
                  direction: stats.success_rate_trend >= 0 ? "up" : "down",
                }
              : undefined
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {pipeline.slice(0, 6).map((stage) => (
          <div
            key={stage.stage}
            className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
          >
            <p className="text-xs capitalize text-muted-foreground">{stage.stage}</p>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-xl font-semibold">{stage.count}</p>
              <p className="text-xs text-muted-foreground">{stage.percentage}%</p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-400"
                style={{ width: `${Math.min(100, stage.percentage)}%` }}
              />
            </div>
          </div>
        ))}
        {pipeline.length === 0 &&
          ["queued", "applied", "interview"].map((stage) => (
            <div
              key={stage}
              className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <p className="text-xs capitalize text-muted-foreground">{stage}</p>
              <p className="mt-1 text-xl font-semibold">0</p>
            </div>
          ))}
      </div>

      <Card className="border-0 bg-card/70 ring-1 ring-white/8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-400" />
            Application pipeline
          </CardTitle>
          <CardDescription>How applications move through each stage</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationPipeline data={pipeline} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 bg-card/70 ring-1 ring-white/8">
          <CardHeader>
            <CardTitle>Applications over time</CardTitle>
            <CardDescription>Daily volume — last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationsOverTime data={chartData} />
          </CardContent>
        </Card>

        <Card className="border-0 bg-card/70 ring-1 ring-white/8">
          <CardHeader>
            <CardTitle>Portal mix</CardTitle>
            <CardDescription>Where your applications originate</CardDescription>
          </CardHeader>
          <CardContent>
            <PortalDistribution data={portalDist} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 bg-card/70 ring-1 ring-white/8">
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>Count by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusBreakdownChart data={statusBreakdown} />
          </CardContent>
        </Card>

        <Card className="border-0 bg-card/70 ring-1 ring-white/8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest status changes</CardDescription>
            </div>
            <Link href="/candidate/applications">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <ActivityFeed items={activity} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
