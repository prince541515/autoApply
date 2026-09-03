"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Crown,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api, { getApiErrorMessage } from "@/lib/api";
import { useAutoApply } from "@/lib/auto-apply-context";
import type {
  ApplicationWithJob,
  JobPreference,
  MatchedJob,
  MatchedJobListResponse,
  PaginatedApplications,
  ScrapeQuota,
  ScrapeResponse,
} from "@/types";
import { toast } from "@/components/ui/toast";
import { ScrapeIntelligence } from "@/components/scrape-intelligence";
import { UpgradeAutoApplyDialog } from "@/components/upgrade-auto-apply-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE = 20;

const POSTED_WITHIN_OPTIONS = [
  { label: "Past 1 hour", value: "1" },
  { label: "Past 12 hours", value: "12" },
  { label: "Past 24 hours", value: "24" },
  { label: "Past 48 hours", value: "48" },
  { label: "Past 3 days", value: "72" },
  { label: "Past 5 days", value: "120" },
  { label: "Past 7 days", value: "168" },
  { label: "Past month", value: "720" },
] as const;

const MANUAL_STATUSES = [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "rejected",
] as const;

const HIDDEN_AFTER_MARK = new Set([
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "withdrawn",
  "removed",
]);

function scoreBadge(score: number) {
  const pct = Math.round(score * 100);
  if (pct >= 80) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25">
        {pct}%
      </Badge>
    );
  }
  if (pct >= 60) {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25">
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25">
      {pct}%
    </Badge>
  );
}

function statusBadge(status: string | null) {
  if (!status) return null;
  const colors: Record<string, string> = {
    queued: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25",
    applying: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25",
    applied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    viewed: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25",
    shortlisted: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/25",
    interview: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25",
    rejected: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
    failed: "bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/25",
  };
  return (
    <Badge className={colors[status] ?? "bg-muted text-muted-foreground"}>
      {status}
    </Badge>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSalary(min: number | null, max: number | null) {
  if (min == null && max == null) return "—";
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  return `Up to ${fmt(max!)}`;
}

function toAppliedRow(job: MatchedJob): ApplicationWithJob {
  const now = new Date().toISOString();
  return {
    id: `local-${job.id}`,
    candidate_id: "",
    job_id: job.id,
    status: "applied",
    portal: job.portal,
    external_app_id: null,
    apply_response: null,
    applied_at: now,
    status_updated_at: now,
    created_at: now,
    job_title: job.title,
    company: job.company,
    job_url: job.url,
    job_description: job.description,
  };
}

export default function CandidateJobsPage() {
  const { enabled: autoApplyEnabled, allowed: autoApplyAllowed, requestUpgrade } =
    useAutoApply();
  const [section, setSection] = useState<"matched" | "applied">("matched");
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [applied, setApplied] = useState<ApplicationWithJob[]>([]);
  const [appliedTotal, setAppliedTotal] = useState(0);
  const [appliedPage, setAppliedPage] = useState(0);
  const [appliedLoading, setAppliedLoading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [portalFilter, setPortalFilter] = useState("all");
  const [postedWithin, setPostedWithin] = useState("168");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [scraping, setScraping] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<JobPreference | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [quota, setQuota] = useState<ScrapeQuota | null>(null);
  const [quotaUpgradeOpen, setQuotaUpgradeOpen] = useState(false);
  const requestId = useRef(0);

  const fetchJobs = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const id = ++requestId.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (search) params.search = search;
      if (portalFilter && portalFilter !== "all") params.portal = portalFilter;

      const { data } = await api.get<MatchedJobListResponse>("/jobs/matched", {
        params,
      });
      if (id !== requestId.current) return;
      setJobs(data.jobs);
      setTotal(data.total);
    } catch (err: unknown) {
      if (id !== requestId.current) return;
      const msg = getApiErrorMessage(err, "Failed to load jobs");
      setError(msg);
    } finally {
      if (id === requestId.current && !silent) {
        setLoading(false);
      }
    }
  }, [page, search, portalFilter]);

  const fetchApplied = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setAppliedLoading(true);
    try {
      const { data } = await api.get<PaginatedApplications>("/applications/", {
        params: {
          status: "applied",
          page: appliedPage + 1,
          per_page: PAGE_SIZE,
        },
      });
      setApplied(data.items);
      setAppliedTotal(data.total);
    } catch {
      // Applied list is optional on this page
    } finally {
      if (!opts?.silent) setAppliedLoading(false);
    }
  }, [appliedPage]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    void fetchApplied();
  }, [fetchApplied]);

  useEffect(() => {
    void api
      .get<JobPreference[]>("/preferences/")
      .then((res) => setPreferences(res.data[0] ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void api
      .get<ScrapeQuota>("/jobs/scrape-quota")
      .then(({ data }) => setQuota(data))
      .catch(() => undefined);
  }, []);

  const handleScrapeNow = async () => {
    if (quota && quota.remaining <= 0) {
      setQuotaUpgradeOpen(true);
      return;
    }
    setScraping(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        posted_within_hours: postedWithin,
      };
      if (portalFilter && portalFilter !== "all") params.portal = portalFilter;
      const { data } = await api.post<ScrapeResponse>("/jobs/scrape-now", null, {
        params,
        timeout: 20000,
      });
      if (typeof data.remaining === "number" && typeof data.limit === "number") {
        setQuota({
          limit: data.limit,
          used: data.used ?? data.limit - data.remaining,
          remaining: data.remaining,
          resets_at: quota?.resets_at ?? "",
        });
      }
      toast.success({
        title: "Fetching jobs",
        description: data.message || "The list will refresh in a few seconds.",
      });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await fetchJobs({ silent: true });
      }
      await fetchJobs({ silent: false });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setQuotaUpgradeOpen(true);
        void api.get<ScrapeQuota>("/jobs/scrape-quota").then(({ data }) => setQuota(data));
        setScraping(false);
        return;
      }
      const raw = getApiErrorMessage(err, "Failed to scrape jobs");
      const msg = /timeout/i.test(raw)
        ? "Scrape took too long. Try Past 24 hours or a single portal."
        : raw;
      setError(msg);
      toast.error({ title: "Scrape failed", description: msg });
    } finally {
      setScraping(false);
    }
  };

  const moveJobToApplied = (job: MatchedJob) => {
    setJobs((list) => list.filter((item) => item.id !== job.id));
    setTotal((count) => Math.max(0, count - 1));
    setApplied((list) => [
      toAppliedRow(job),
      ...list.filter((item) => item.job_id !== job.id),
    ]);
    setAppliedTotal((count) => count + 1);
  };

  const handleApply = async (job: MatchedJob) => {
    if (!autoApplyEnabled) {
      window.open(job.url, "_blank", "noopener,noreferrer");
    }

    const previousJobs = jobs;
    const previousTotal = total;
    const previousApplied = applied;
    const previousAppliedTotal = appliedTotal;
    moveJobToApplied(job);

    setApplying(job.id);
    setError(null);
    try {
      if (autoApplyEnabled) {
        const { data } = await api.post<{
          message: string;
          status: string;
        }>("/applications/", { job_id: job.id }, { timeout: 120000 });
        if (data.status === "failed") {
          throw new Error(data.message || "The portal rejected this application.");
        }
        if (data.status !== "applied") {
          await api.post("/applications/mark", {
            job_id: job.id,
            status: "applied",
          });
        }
        toast.success({
          title: "Applied",
          description: "Saved in the Applied section.",
        });
      } else {
        await api.post("/applications/mark", {
          job_id: job.id,
          status: "applied",
        });
        toast.success({
          title: "Applied",
          description: "Opened the posting and saved it in Applied.",
        });
      }
      void fetchApplied({ silent: true });
    } catch (err: unknown) {
      setJobs(previousJobs);
      setTotal(previousTotal);
      setApplied(previousApplied);
      setAppliedTotal(previousAppliedTotal);
      setSection("matched");
      const msg = getApiErrorMessage(err, "Failed to apply to this job");
      setError(msg);
      toast.error({ title: "Apply failed", description: msg });
    } finally {
      setApplying(null);
    }
  };

  const handleMarkStatus = async (jobId: string, newStatus: string) => {
    const previousJobs = jobs;
    const previousTotal = total;
    if (HIDDEN_AFTER_MARK.has(newStatus)) {
      const job = previousJobs.find((item) => item.id === jobId);
      setJobs((list) => list.filter((item) => item.id !== jobId));
      setTotal((count) => Math.max(0, count - 1));
      if (newStatus === "applied" && job) {
        setApplied((list) => [
          toAppliedRow(job),
          ...list.filter((item) => item.job_id !== jobId),
        ]);
        setAppliedTotal((count) => count + 1);
      }
    } else {
      setJobs((list) =>
        list.map((job) =>
          job.id === jobId ? { ...job, application_status: newStatus } : job
        )
      );
    }
    try {
      await api.post("/applications/mark", { job_id: jobId, status: newStatus });
      toast.success({
        title:
          newStatus === "removed"
            ? "Job removed"
            : newStatus === "applied"
              ? "Applied"
              : `Marked as ${newStatus}`,
        description:
          newStatus === "removed"
            ? "It will stay off your matched list."
            : newStatus === "applied"
              ? "Saved in the Applied section."
              : "Track it in the Applications section.",
      });
      if (newStatus === "applied") void fetchApplied({ silent: true });
    } catch (err: unknown) {
      setJobs(previousJobs);
      setTotal(previousTotal);
      toast.error({
        title: "Status update failed",
        description: getApiErrorMessage(err, "Could not update the status"),
      });
    }
  };

  const toggleSelected = (jobId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const pageIds = jobs.map((job) => job.id);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(pageIds);
    });
  };

  const handleBulkStatus = async (newStatus: string) => {
    const ids = pageIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;
    const previousJobs = jobs;
    const previousTotal = total;
    const selectedJobs = previousJobs.filter((job) => ids.includes(job.id));
    if (HIDDEN_AFTER_MARK.has(newStatus)) {
      setJobs((list) => list.filter((job) => !ids.includes(job.id)));
      setTotal((count) => Math.max(0, count - ids.length));
      if (newStatus === "applied") {
        setApplied((list) => [
          ...selectedJobs.map(toAppliedRow),
          ...list.filter((item) => !ids.includes(item.job_id)),
        ]);
        setAppliedTotal((count) => count + selectedJobs.length);
      }
    } else {
      setJobs((list) =>
        list.map((job) =>
          ids.includes(job.id) ? { ...job, application_status: newStatus } : job
        )
      );
    }
    setSelectedIds(new Set());
    setBulkUpdating(true);
    try {
      const { data } = await api.post<{ affected: number; message: string }>(
        "/applications/mark-bulk",
        { job_ids: ids, status: newStatus }
      );
      toast.success({
        title: data.message,
        description:
          newStatus === "applied"
            ? "Moved to the Applied section."
            : undefined,
      });
      if (newStatus === "applied") void fetchApplied({ silent: true });
    } catch (err: unknown) {
      setJobs(previousJobs);
      setTotal(previousTotal);
      toast.error({
        title: "Bulk update failed",
        description: getApiErrorMessage(err, "Could not update selected jobs"),
      });
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleExpand = async (job: MatchedJob) => {
    const nextId = expandedId === job.id ? null : job.id;
    setExpandedId(nextId);
    if (!nextId || job.description || descriptions[job.id]) return;
    try {
      const { data } = await api.get<{ description?: string | null }>(
        `/jobs/${job.id}`
      );
      if (data.description) {
        setDescriptions((prev) => ({ ...prev, [job.id]: data.description! }));
      }
    } catch {
      // Description is optional
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const portals = Array.from(new Set(jobs.map((j) => j.portal))).sort();
  const scrapeCompanies = Array.from(
    new Set([...jobs.map((job) => job.company), ...applied.map((row) => row.company)].filter(Boolean)),
  );

  return (
    <div className="space-y-6">
      <ScrapeIntelligence
        open={scraping}
        companies={scrapeCompanies}
        roles={preferences?.roles ?? []}
        portals={portals}
      />
      <UpgradeAutoApplyDialog
        open={quotaUpgradeOpen}
        onOpenChange={setQuotaUpgradeOpen}
        title="Daily scrape limit reached"
        description="You’ve used today’s scrapes for this account. Contact an admin to upgrade your plan and raise the daily limit."
        mailSubject="Upgrade scrape limit"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Match jobs to your preferences, apply, and track what you submitted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={postedWithin} onValueChange={(v) => v != null && setPostedWithin(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Posted within">
                {POSTED_WITHIN_OPTIONS.find((opt) => opt.value === postedWithin)
                  ?.label ?? "Posted within"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent side="bottom" align="end">
              {POSTED_WITHIN_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleScrapeNow}
            disabled={scraping}
            variant="outline"
            className="w-fit"
          >
            {scraping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Scrape Now
            {quota != null && (
              <span className="ml-1 text-muted-foreground">
                ({quota.remaining} left)
              </span>
            )}
          </Button>
        </div>
      </div>

      {!autoApplyAllowed && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
              <Crown className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Auto-Apply is off for your account
              </p>
              <p className="text-sm text-muted-foreground">
                An admin must allow it before you can turn it on. Upgrade your plan
                to apply automatically from this page.
              </p>
            </div>
          </div>
          <Button className="shrink-0" onClick={requestUpgrade}>
            Upgrade plan
          </Button>
        </div>
      )}

      <Tabs
        value={section}
        onValueChange={(value) =>
          setSection(value === "applied" ? "applied" : "matched")
        }
      >
        <TabsList>
          <TabsTrigger value="matched">Matched ({total})</TabsTrigger>
          <TabsTrigger value="applied">Applied ({appliedTotal})</TabsTrigger>
        </TabsList>

      {section === "matched" && (
      <>
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by title or company..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Select
              value={portalFilter}
              onValueChange={(v) => {
                if (v == null) return;
                setPortalFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Portals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Portals</SelectItem>
                {portals.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Briefcase className="mr-2 inline-block h-4 w-4" />
            {total} job{total !== 1 ? "s" : ""} found
          </CardTitle>
          {total > 0 && (
            <CardDescription>
              Page {page + 1} of {totalPages}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error && jobs.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchJobs()}>
                Retry
              </Button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Briefcase className="h-8 w-8" />
              <p className="text-sm">No matched jobs yet.</p>
              <p className="text-xs">
                Connect a portal and set your preferences, then scrape for jobs.
              </p>
            </div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected
                  </span>
                  <Select
                    onValueChange={(value) => {
                      if (typeof value === "string" && value) {
                        void handleBulkStatus(value);
                      }
                    }}
                    disabled={bulkUpdating}
                  >
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue placeholder="Set status" />
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                      <SelectItem value="removed">Remove</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all jobs"
                        />
                      </TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Location
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Salary
                      </TableHead>
                      <TableHead>Portal</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Status
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Scraped
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => {
                      const isExpanded = expandedId === job.id;
                      return (
                        <Fragment key={job.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleExpand(job)}
                          >
                            <TableCell className="px-2">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell
                              className="w-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={selectedIds.has(job.id)}
                                onCheckedChange={() => toggleSelected(job.id)}
                                aria-label={`Select ${job.title}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {job.title}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {job.company}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {job.location ?? "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground whitespace-nowrap">
                              {formatSalary(job.salary_min, job.salary_max)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {job.portal}
                              </Badge>
                            </TableCell>
                            <TableCell>{scoreBadge(job.match_score)}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {statusBadge(job.application_status)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground whitespace-nowrap">
                              {formatDateTime(job.scraped_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div
                                className="flex items-center justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  render={
                                    <a
                                      href={job.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    />
                                  }
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                {(!job.application_status ||
                                  job.application_status === "queued") && (
                                  <Button
                                    size="sm"
                                    className="h-7 px-2"
                                    disabled={applying === job.id}
                                    title={
                                      autoApplyEnabled
                                        ? "Auto-apply to this job"
                                        : "Open the job portal to apply manually"
                                    }
                                    onClick={() => handleApply(job)}
                                  >
                                    {applying === job.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : autoApplyEnabled ? (
                                      <Zap className="h-3.5 w-3.5" />
                                    ) : (
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    )}
                                    <span className="ml-1 hidden sm:inline">
                                      Apply
                                    </span>
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2"
                                        title="Mark status manually"
                                      />
                                    }
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                      <DropdownMenuLabel>
                                        Mark status
                                      </DropdownMenuLabel>
                                      {MANUAL_STATUSES.map((s) => (
                                        <DropdownMenuItem
                                          key={s}
                                          className="capitalize"
                                          onClick={() =>
                                            handleMarkStatus(job.id, s)
                                          }
                                        >
                                          {s}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() =>
                                        handleMarkStatus(job.id, "removed")
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Remove
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${job.id}-detail`}>
                              <TableCell colSpan={11} className="bg-muted/30 p-4">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-4 text-sm">
                                    <div>
                                      <span className="font-medium text-muted-foreground">
                                        Location:{" "}
                                      </span>
                                      {job.location ?? "Not specified"}
                                    </div>
                                    <div>
                                      <span className="font-medium text-muted-foreground">
                                        Salary:{" "}
                                      </span>
                                      {formatSalary(
                                        job.salary_min,
                                        job.salary_max
                                      )}
                                    </div>
                                    <div>
                                      <span className="font-medium text-muted-foreground">
                                        Posted:{" "}
                                      </span>
                                      {formatDate(job.posted_at)}
                                    </div>
                                    <div>
                                      <span className="font-medium text-muted-foreground">
                                        Scraped:{" "}
                                      </span>
                                      {formatDateTime(job.scraped_at)}
                                    </div>
                                  </div>
                                  {(job.description || descriptions[job.id]) && (
                                    <div className="max-h-60 overflow-y-auto rounded-md border bg-background p-3 text-sm leading-relaxed whitespace-pre-wrap">
                                      {job.description || descriptions[job.id]}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      render={
                                        <a
                                          href={job.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        />
                                      }
                                    >
                                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                      View on {job.portal}
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page + 1 >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {section === "applied" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {appliedTotal} applied job{appliedTotal !== 1 ? "s" : ""}
            </CardTitle>
            <CardDescription>
              Jobs you applied to, ready to track.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appliedLoading && applied.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : applied.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8" />
                <p className="text-sm">No applied jobs yet.</p>
                <p className="text-xs">
                  Click Apply on a matched job and it will show up here.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Portal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Applied
                        </TableHead>
                        <TableHead className="text-right">Posting</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {applied.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium max-w-[220px] truncate">
                            {app.job_title}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">
                            {app.company}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {app.portal}
                            </Badge>
                          </TableCell>
                          <TableCell>{statusBadge(app.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                            {formatDate(app.applied_at || app.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {app.job_url ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                render={
                                  <a
                                    href={app.job_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  />
                                }
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {Math.ceil(appliedTotal / PAGE_SIZE) > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Page {appliedPage + 1} of{" "}
                      {Math.ceil(appliedTotal / PAGE_SIZE)}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={appliedPage === 0}
                        onClick={() =>
                          setAppliedPage((p) => Math.max(0, p - 1))
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          appliedPage + 1 >=
                          Math.ceil(appliedTotal / PAGE_SIZE)
                        }
                        onClick={() => setAppliedPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      </Tabs>
    </div>
  );
}
