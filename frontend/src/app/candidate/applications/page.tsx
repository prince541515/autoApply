"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Ban,
  Loader2,
  ArrowUpDown,
  Calendar,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api, { getApiErrorMessage } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { PaginatedApplications, ApplicationWithJob } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUSES = [
  "queued",
  "applying",
  "applied",
  "viewed",
  "shortlisted",
  "rejected",
  "interview",
  "cancelled",
] as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  queued: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  applying: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  applied: "bg-green-500/20 text-green-400 border-green-500/30",
  viewed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  shortlisted: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  interview: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  withdrawn: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const PORTALS = ["linkedin", "naukri", "indeed", "wellfound", "glassdoor"];

const MANUAL_STATUSES = [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "rejected",
  "withdrawn",
] as const;

export default function CandidateApplicationsPage() {
  const [data, setData] = useState<PaginatedApplications | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [portalFilter, setPortalFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchApplications = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "20");
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      if (search) params.set("search", search);
      if (portalFilter) params.set("portal", portalFilter);
      if (fromDate) params.set("from_date", new Date(fromDate).toISOString());
      if (toDate) params.set("to_date", new Date(toDate).toISOString());
      statusFilter.forEach((s) => params.append("status", s));

      const res = await api.get<PaginatedApplications>(`/applications/?${params.toString()}`);
      setData(res.data);
    } catch {
      // Silently handle fetch errors
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [page, search, statusFilter, portalFilter, fromDate, toDate, sortBy, sortDir]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchApplications({ silent: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchApplications]);

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(1);
  };

  const toggleStatusFilter = (s: string) => {
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
  };

  const handleExport = async () => {
    try {
      const res = await api.get("/applications/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "applications.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export error
    }
  };

  const handleBulkRetry = async () => {
    setBulkLoading(true);
    try {
      await api.post("/applications/bulk-retry");
      await fetchApplications();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkCancel = async () => {
    setBulkLoading(true);
    try {
      await api.post("/applications/bulk-cancel");
      await fetchApplications();
    } finally {
      setBulkLoading(false);
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.per_page) : 1;

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 inline size-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline size-3" />
    ) : (
      <ChevronDown className="ml-1 inline size-3" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground">
            Track and manage all your job applications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 size-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRetry}
            disabled={bulkLoading}
          >
            <RotateCcw className="mr-1.5 size-4" />
            Retry Failed
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkCancel}
            disabled={bulkLoading}
          >
            <Ban className="mr-1.5 size-4" />
            Cancel Queued
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search company or title..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={portalFilter || "all"}
              onValueChange={(v) => {
                setPortalFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Portal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Portals</SelectItem>
                {PORTALS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Calendar className="size-4 text-muted-foreground" />
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-[130px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="w-[130px]"
              />
            </div>

            {(search || portalFilter || fromDate || toDate || statusFilter.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setPortalFilter("");
                  setFromDate("");
                  setToDate("");
                  setStatusFilter([]);
                  setPage(1);
                }}
              >
                <X className="mr-1 size-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Status filter chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Filter className="mr-1 size-4 self-center text-muted-foreground" />
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatusFilter(s)}
                className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
                  statusFilter.includes(s)
                    ? STATUS_BADGE_CLASSES[s]
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              {data?.total ?? 0} application{(data?.total ?? 0) !== 1 ? "s" : ""}
            </span>
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>
                  <button onClick={() => toggleSort("job_title")} className="flex items-center hover:text-foreground">
                    Job Title <SortIcon column="job_title" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("company")} className="flex items-center hover:text-foreground">
                    Company <SortIcon column="company" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("portal")} className="flex items-center hover:text-foreground">
                    Portal <SortIcon column="portal" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("status")} className="flex items-center hover:text-foreground">
                    Status <SortIcon column="status" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("applied_at")} className="flex items-center hover:text-foreground">
                    Applied <SortIcon column="applied_at" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("status_updated_at")} className="flex items-center hover:text-foreground">
                    Updated <SortIcon column="status_updated_at" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.items.length === 0) && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No applications found
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((app) => (
                  <ApplicationRow
                    key={app.id}
                    app={app}
                    expanded={expandedId === app.id}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === app.id ? null : app.id))
                    }
                    onStatusChange={async (status) => {
                      const previous = data;
                      setData((curr) =>
                        curr
                          ? {
                              ...curr,
                              items: curr.items.map((item) =>
                                item.id === app.id ? { ...item, status } : item
                              ),
                            }
                          : curr
                      );
                      try {
                        await api.patch(`/applications/${app.id}`, { status });
                        toast.success({
                          title: `Status updated to ${status}`,
                        });
                      } catch (err: unknown) {
                        setData(previous);
                        toast.error({
                          title: "Status update failed",
                          description: getApiErrorMessage(
                            err,
                            "Could not update the status"
                          ),
                        });
                      }
                    }}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data && data.total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} ({data.total} total)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationRow({
  app,
  expanded,
  onToggle,
  onStatusChange,
}: {
  app: ApplicationWithJob;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: string) => Promise<void>;
}) {
  const badgeClass = STATUS_BADGE_CLASSES[app.status] || STATUS_BADGE_CLASSES.queued;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8 pr-0">
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="max-w-[200px] truncate font-medium">
          {app.job_title}
        </TableCell>
        <TableCell className="text-muted-foreground">{app.company}</TableCell>
        <TableCell className="capitalize text-muted-foreground">{app.portal}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex"
                  title="Change status"
                />
              }
            >
              <Badge variant="outline" className={`capitalize ${badgeClass}`}>
                {app.status}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Update status</DropdownMenuLabel>
                {MANUAL_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    className="capitalize"
                    onClick={() => {
                      void onStatusChange(s);
                    }}
                  >
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {app.applied_at
            ? new Date(app.applied_at).toLocaleDateString()
            : new Date(app.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(app.status_updated_at).toLocaleDateString()}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 px-8 py-4">
            <div className="space-y-3">
              {app.job_description && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Job Description
                  </h4>
                  <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">
                    {app.job_description}
                  </p>
                </div>
              )}
              {app.apply_response && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Application Notes
                  </h4>
                  <p className="text-sm">{app.apply_response}</p>
                </div>
              )}
              {app.job_url && (
                <a
                  href={app.job_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  View original posting &rarr;
                </a>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
