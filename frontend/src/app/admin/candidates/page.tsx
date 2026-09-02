"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown,
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Zap,
  ZapOff,
  Loader2,
  Users,
  Pause,
  Play,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import api from "@/lib/api";
import type { AdminCandidate } from "@/types";

const PAGE_SIZE = 10;

function candidatePlan(c: AdminCandidate): "premium" | "basic" {
  return c.plan ?? (c.account_status === "pending" ? "basic" : "premium");
}

export default function AdminCandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCandidate, setNewCandidate] = useState({
    user_id: "",
    full_name: "",
    phone: "",
    location: "",
  });

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const res = await api.get<AdminCandidate[]>("/admin/candidates");
      setCandidates(res.data);
    } catch {
      setError("Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const filtered = useMemo(() => {
    let result = candidates;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.location && c.location.toLowerCase().includes(q))
      );
    }
    if (planFilter !== "all") {
      result = result.filter((c) => candidatePlan(c) === planFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.account_status === statusFilter);
    }
    return result;
  }, [candidates, search, statusFilter, planFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const premiumCount = candidates.filter((c) => candidatePlan(c) === "premium").length;
  const basicCount = candidates.length - premiumCount;

  const handleCreate = async () => {
    if (!newCandidate.user_id || !newCandidate.full_name) return;
    try {
      setCreating(true);
      await api.post("/admin/candidates", newCandidate);
      toast.success({ title: "Candidate created successfully" });
      setDialogOpen(false);
      setNewCandidate({ user_id: "", full_name: "", phone: "", location: "" });
      fetchCandidates();
    } catch {
      toast.error({ title: "Failed to create candidate" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAllowed = async (id: string, allowed: boolean) => {
    try {
      const res = await api.put<{
        auto_apply_allowed: boolean;
        auto_apply_enabled: boolean;
      }>(`/admin/candidates/${id}/auto-apply-allowed`, { allowed });
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                auto_apply_allowed: res.data.auto_apply_allowed,
                auto_apply_enabled: res.data.auto_apply_enabled,
              }
            : c
        )
      );
      toast.success({
        title: allowed ? "Auto-Apply allowed" : "Auto-Apply revoked",
      });
    } catch {
      toast.error({ title: "Failed to update Auto-Apply permission" });
    }
  };

  const handleSetStatus = async (
    id: string,
    next: "active" | "paused" | "suspended",
  ) => {
    try {
      const res = await api.put<{ account_status: string }>(
        `/admin/candidates/${id}/status`,
        { status: next },
      );
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, account_status: res.data.account_status as AdminCandidate["account_status"] } : c
        )
      );
      toast.success({ title: `Account ${next}` });
    } catch {
      toast.error({ title: "Failed to update account status" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/candidates/${id}`);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      toast.success({ title: "Candidate deleted" });
    } catch {
      toast.error({ title: "Failed to delete candidate" });
    }
  };

  if (error && !loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchCandidates}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground">
            All registered candidates — Premium (invite unlocked) or Basic (pending).
            Click a row to open their profile.
          </p>
          {!loading && candidates.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {candidates.length} total · {premiumCount} Premium · {basicCount} Basic
            </p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 size-4" />
            Add Candidate
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Candidate</DialogTitle>
              <DialogDescription>
                Create a new candidate profile linked to an existing user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input
                  value={newCandidate.user_id}
                  onChange={(e) =>
                    setNewCandidate((p) => ({
                      ...p,
                      user_id: e.target.value,
                    }))
                  }
                  placeholder="UUID of existing user"
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={newCandidate.full_name}
                  onChange={(e) =>
                    setNewCandidate((p) => ({
                      ...p,
                      full_name: e.target.value,
                    }))
                  }
                  placeholder="Candidate's full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newCandidate.phone}
                  onChange={(e) =>
                    setNewCandidate((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={newCandidate.location}
                  onChange={(e) =>
                    setNewCandidate((p) => ({
                      ...p,
                      location: e.target.value,
                    }))
                  }
                  placeholder="City, Country"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by name, email, or location..."
                className="pl-9"
              />
            </div>
            <Select
              value={planFilter}
              onValueChange={(v) => {
                if (v == null) return;
                setPlanFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                if (v == null) return;
                setStatusFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Account status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Users className="size-10 opacity-40" />
                <p>No candidates found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto-Apply</TableHead>
                    <TableHead className="hidden md:table-cell">Fetches</TableHead>
                    <TableHead className="hidden lg:table-cell">Applies</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/candidates/${c.id}`)}
                    >
                      <TableCell>
                        <Link
                          href={`/admin/candidates/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.full_name || "Unnamed"}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {c.email}
                      </TableCell>
                      <TableCell>
                        {candidatePlan(c) === "premium" ? (
                          <Badge className="bg-amber-400/15 text-amber-300 border-amber-400/30">
                            <Crown className="mr-1 size-3" />
                            Premium
                          </Badge>
                        ) : (
                          <Badge variant="outline">Basic</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.account_status === "active"
                              ? "default"
                              : c.account_status === "paused"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {c.account_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.auto_apply_allowed ? "default" : "outline"}
                        >
                          {c.auto_apply_allowed ? (
                            <>
                              <Zap className="mr-1 size-3" /> Allowed
                            </>
                          ) : (
                            "Locked"
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {c.fetch_times}× / {c.jobs_fetched} jobs
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {c.apply_clicks} clicks · {c.application_count} apps
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              render={
                                <Link
                                  href={`/admin/candidates/${c.id}`}
                                />
                              }
                            >
                              <Eye className="mr-2 size-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              render={
                                <Link
                                  href={`/admin/candidates/${c.id}?edit=true`}
                                />
                              }
                            >
                              <Pencil className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleToggleAllowed(c.id, !c.auto_apply_allowed)
                              }
                            >
                              {c.auto_apply_allowed ? (
                                <>
                                  <ZapOff className="mr-2 size-4" />
                                  Revoke Auto-Apply
                                </>
                              ) : (
                                <>
                                  <Zap className="mr-2 size-4" />
                                  Allow Auto-Apply
                                </>
                              )}
                            </DropdownMenuItem>
                            {c.account_status !== "paused" &&
                              c.account_status !== "pending" && (
                                <DropdownMenuItem
                                  onClick={() => handleSetStatus(c.id, "paused")}
                                >
                                  <Pause className="mr-2 size-4" />
                                  Pause account
                                </DropdownMenuItem>
                              )}
                            {c.account_status === "paused" && (
                              <DropdownMenuItem
                                onClick={() => handleSetStatus(c.id, "active")}
                              >
                                <Play className="mr-2 size-4" />
                                Resume account
                              </DropdownMenuItem>
                            )}
                            {c.account_status !== "suspended" && (
                              <DropdownMenuItem
                                onClick={() => handleSetStatus(c.id, "suspended")}
                              >
                                <Ban className="mr-2 size-4" />
                                Suspend account
                              </DropdownMenuItem>
                            )}
                            {c.account_status === "suspended" && (
                              <DropdownMenuItem
                                onClick={() => handleSetStatus(c.id, "active")}
                              >
                                <Play className="mr-2 size-4" />
                                Unsuspend
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(c.id)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
