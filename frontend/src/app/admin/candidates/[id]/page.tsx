"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Zap,
  ZapOff,
  Globe,
  FileText,
  Loader2,
  MapPin,
  Phone,
  Calendar,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { SkillInput } from "@/components/skill-input";
import { ExperienceForm } from "@/components/experience-form";
import { EducationForm } from "@/components/education-form";
import api from "@/lib/api";
import type { CandidateProfile, CandidateActivity } from "@/types";

export default function AdminCandidateDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;

  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [activity, setActivity] = useState<CandidateActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<CandidateProfile>>({});
  const [beatMinutes, setBeatMinutes] = useState("");
  const [savingBeat, setSavingBeat] = useState(false);
  const [scrapeLimit, setScrapeLimit] = useState("");
  const [savingScrapeLimit, setSavingScrapeLimit] = useState(false);
  const [eventFilter, setEventFilter] = useState<
    "all" | "job_fetch" | "apply_click" | "auto_apply"
  >("all");

  const filteredEvents = useMemo(() => {
    const events = activity?.events ?? [];
    if (eventFilter === "all") return events;
    return events.filter((event) => event.event_type === eventFilter);
  }, [activity, eventFilter]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [candidateRes, activityRes] = await Promise.all([
          api.get<CandidateProfile>(`/candidates/${id}`),
          api.get<CandidateActivity>(`/admin/candidates/${id}/activity`),
        ]);
        setCandidate({
          ...candidateRes.data,
          auto_apply_allowed: activityRes.data.auto_apply_allowed,
        });
        setActivity(activityRes.data);
        setBeatMinutes(
          activityRes.data.beat_scrape_interval_minutes != null
            ? String(activityRes.data.beat_scrape_interval_minutes)
            : "",
        );
        setScrapeLimit(
          activityRes.data.daily_scrape_limit != null
            ? String(activityRes.data.daily_scrape_limit)
            : "",
        );
        setForm(candidateRes.data);
      } catch {
        setError("Failed to load candidate");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSave = async () => {
    if (!candidate) return;
    try {
      setSaving(true);
      const res = await api.put<CandidateProfile>(`/candidates/${id}`, {
        full_name: form.full_name,
        phone: form.phone,
        location: form.location,
        skills: form.skills,
        experience: form.experience,
        education: form.education,
        bio: form.bio,
      });
      setCandidate(res.data);
      setForm(res.data);
      setEditing(false);
      toast.success({ title: "Candidate updated" });
    } catch {
      toast.error({ title: "Failed to update candidate" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBeat = async () => {
    try {
      setSavingBeat(true);
      const payload =
        beatMinutes.trim() === ""
          ? { interval_minutes: null }
          : { interval_minutes: Number(beatMinutes) };
      const res = await api.put<{
        beat_scrape_interval_minutes: number | null;
        last_beat_scrape_at: string | null;
      }>(`/admin/candidates/${id}/beat-scrape`, payload);
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              beat_scrape_interval_minutes: res.data.beat_scrape_interval_minutes,
              last_beat_scrape_at: res.data.last_beat_scrape_at,
            }
          : prev
      );
      toast.success({
        title: beatMinutes.trim() === "" ? "Using default beat interval" : "Beat interval saved",
      });
    } catch {
      toast.error({ title: "Failed to save beat interval" });
    } finally {
      setSavingBeat(false);
    }
  };

  const handleSaveScrapeLimit = async () => {
    try {
      setSavingScrapeLimit(true);
      const payload =
        scrapeLimit.trim() === ""
          ? { daily_limit: null }
          : { daily_limit: Number(scrapeLimit) };
      const res = await api.put<{
        daily_scrape_limit: number | null;
        limit: number;
        used: number;
        remaining: number;
        resets_at: string;
      }>(`/admin/candidates/${id}/scrape-limit`, payload);
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              daily_scrape_limit: res.data.daily_scrape_limit,
              scrape_quota: {
                limit: res.data.limit,
                used: res.data.used,
                remaining: res.data.remaining,
                resets_at: res.data.resets_at,
              },
            }
          : prev
      );
      toast.success({
        title:
          scrapeLimit.trim() === ""
            ? "Using default daily scrape limit"
            : "Daily scrape limit saved",
      });
    } catch {
      toast.error({ title: "Failed to save scrape limit" });
    } finally {
      setSavingScrapeLimit(false);
    }
  };

  const handleToggleAllowed = async () => {
    if (!candidate) return;
    const next = !candidate.auto_apply_allowed;
    try {
      const res = await api.put<{
        auto_apply_allowed: boolean;
        auto_apply_enabled: boolean;
      }>(`/admin/candidates/${id}/auto-apply-allowed`, { allowed: next });
      setCandidate((prev) =>
        prev
          ? {
              ...prev,
              auto_apply_allowed: res.data.auto_apply_allowed,
              auto_apply_enabled: res.data.auto_apply_enabled,
            }
          : prev
      );
      toast.success({
        title: next ? "Auto-Apply allowed" : "Auto-Apply revoked",
      });
    } catch {
      toast.error({ title: "Failed to update Auto-Apply permission" });
    }
  };

  const handleSetStatus = async (next: "active" | "paused" | "suspended") => {
    try {
      await api.put(`/admin/candidates/${id}/status`, { status: next });
      setActivity((prev) =>
        prev ? { ...prev, account_status: next } : prev
      );
      toast.success({ title: `Account ${next}` });
    } catch {
      toast.error({ title: "Failed to update account status" });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error || "Candidate not found"}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.back()}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const when = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString() : "Never";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/candidates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {candidate.full_name || "Unnamed Candidate"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activity?.email ?? `ID: ${candidate.id}`}
            {activity?.plan
              ? ` · ${activity.plan === "premium" ? "Premium" : "Basic"}`
              : activity?.account_status === "pending"
                ? " · Basic"
                : activity?.account_status
                  ? " · Premium"
                  : ""}
            {activity?.account_status ? ` · ${activity.account_status}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleAllowed}>
            {candidate.auto_apply_allowed ? (
              <>
                <ZapOff className="mr-2 size-4" /> Revoke Auto-Apply
              </>
            ) : (
              <>
                <Zap className="mr-2 size-4" /> Allow Auto-Apply
              </>
            )}
          </Button>
          {activity?.account_status === "paused" ? (
            <Button variant="outline" size="sm" onClick={() => handleSetStatus("active")}>
              Resume
            </Button>
          ) : activity?.account_status !== "pending" ? (
            <Button variant="outline" size="sm" onClick={() => handleSetStatus("paused")}>
              Pause
            </Button>
          ) : null}
          {activity?.account_status === "suspended" ? (
            <Button variant="outline" size="sm" onClick={() => handleSetStatus("active")}>
              Unsuspend
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => handleSetStatus("suspended")}>
              Suspend
            </Button>
          )}
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setForm(candidate);
                }}
              >
                <X className="mr-2 size-4" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      {activity && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Job fetches</CardDescription>
              <CardTitle>{activity.fetch_times}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              Last: {when(activity.last_fetch_at)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Jobs fetched</CardDescription>
              <CardTitle>{activity.jobs_fetched}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              New listings stored
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Apply clicks</CardDescription>
              <CardTitle>{activity.apply_clicks}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              Last: {when(activity.last_apply_click_at)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Applied</CardDescription>
              <CardTitle>{activity.applied_count}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              Submitted to a portal
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>All applications</CardDescription>
              <CardTitle>{activity.application_count}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              Auto-applies: {activity.auto_applies}
            </CardContent>
          </Card>
        </div>
      )}

      {activity && (
        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
            <CardDescription>
              Every fetch, apply click, and auto-apply, with time
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {(
                [
                  ["all", "All"],
                  ["job_fetch", "Fetches"],
                  ["apply_click", "Apply clicks"],
                  ["auto_apply", "Auto-apply"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={eventFilter === key ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setEventFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-zinc-400">No activity recorded yet.</p>
            ) : (
              <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-white/5 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        {event.summary || event.event_type}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-zinc-500">
                        {event.event_type.replace("_", " ")}
                        {typeof event.metadata?.jobs_found === "number"
                          ? ` · ${event.metadata.jobs_found} jobs`
                          : ""}
                        {typeof event.metadata?.portal === "string"
                          ? ` · ${event.metadata.portal}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {when(event.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activity && (
        <Card>
          <CardHeader>
            <CardTitle>Applications</CardTitle>
            <CardDescription>
              Clicked or submitted jobs, with status and time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activity.applications.length === 0 ? (
              <p className="text-sm text-zinc-400">No applications yet.</p>
            ) : (
              <div className="max-h-[24rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr className="border-b border-white/10">
                      <th className="pb-2 pr-3 font-medium">Job</th>
                      <th className="pb-2 pr-3 font-medium">Portal</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.applications.map((app) => (
                      <tr key={app.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-zinc-100">
                            {app.job?.title || "Unknown role"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {app.job?.company || "—"}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 capitalize text-zinc-300">
                          {app.portal}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="secondary" className="capitalize">
                            {app.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-xs text-zinc-400">
                          {when(app.applied_at || app.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main profile */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input
                        value={form.full_name || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, full_name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={form.phone || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input
                        value={form.location || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, location: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Bio</Label>
                    <Textarea
                      value={form.bio || ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, bio: e.target.value }))
                      }
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Skills</Label>
                    <SkillInput
                      value={form.skills || []}
                      onChange={(skills) => setForm((p) => ({ ...p, skills }))}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Experience</Label>
                    <ExperienceForm
                      value={form.experience || []}
                      onChange={(experience) =>
                        setForm((p) => ({ ...p, experience }))
                      }
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Education</Label>
                    <EducationForm
                      value={form.education || []}
                      onChange={(education) =>
                        setForm((p) => ({ ...p, education }))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-sm">
                      <UserIcon className="size-4 text-muted-foreground" />
                      <span>{candidate.full_name || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="size-4 text-muted-foreground" />
                      <span>{candidate.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="size-4 text-muted-foreground" />
                      <span>{candidate.location || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="size-4 text-muted-foreground" />
                      <span>
                        Joined{" "}
                        {new Date(candidate.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {candidate.bio && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Bio
                        </p>
                        <p className="text-sm leading-relaxed">
                          {candidate.bio}
                        </p>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills && candidate.skills.length > 0 ? (
                        candidate.skills.map((skill, i) => (
                          <Badge key={i} variant="secondary">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No skills listed
                        </span>
                      )}
                    </div>
                  </div>
                  {candidate.experience &&
                    candidate.experience.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Experience
                          </p>
                          <div className="space-y-3">
                            {candidate.experience.map((exp, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-border/40 p-3"
                              >
                                <p className="font-medium">{exp.title}</p>
                                <p className="text-sm text-muted-foreground">
                                  {exp.company}
                                  {exp.start_date &&
                                    ` · ${exp.start_date} – ${exp.end_date || "Present"}`}
                                </p>
                                {exp.description && (
                                  <p className="mt-1 text-sm">
                                    {exp.description}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  {candidate.education &&
                    candidate.education.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Education
                          </p>
                          <div className="space-y-3">
                            {candidate.education.map((edu, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-border/40 p-3"
                              >
                                <p className="font-medium">
                                  {edu.degree} in {edu.field}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {edu.institution}
                                  {edu.year && ` · ${edu.year}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Application stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activity || activity.application_count === 0 ? (
                <p className="text-sm text-zinc-400">No applications yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total</span>
                    <span className="font-medium">{activity.application_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Applied</span>
                    <span className="font-medium">{activity.applied_count}</span>
                  </div>
                  {Object.entries(activity.applications_by_status).map(([status, count]) => (
                    <div key={status} className="flex justify-between text-sm">
                      <span className="capitalize text-zinc-400">{status}</span>
                      <Badge variant="secondary" className="text-xs">
                        {count}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="size-4" />
                Connected portals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activity || activity.portals.length === 0 ? (
                <p className="text-sm text-zinc-400">No portals connected</p>
              ) : (
                <div className="space-y-2">
                  {activity.portals.map((portal) => (
                    <div
                      key={portal.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="capitalize">{portal.portal}</p>
                        <p className="text-xs text-zinc-500">
                          Synced {when(portal.last_synced)}
                        </p>
                      </div>
                      <Badge variant={portal.is_active ? "default" : "outline"}>
                        {portal.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily scrape limit</CardTitle>
              <CardDescription>
                Caps how many times this candidate can scrape per UTC day
                (manual Fetch and Auto-Apply beat). Leave blank for the Settings default.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="daily-scrape-limit">Scrapes per day</Label>
                <Input
                  id="daily-scrape-limit"
                  type="number"
                  min={1}
                  max={200}
                  placeholder="Default from Settings"
                  value={scrapeLimit}
                  onChange={(e) => setScrapeLimit(e.target.value)}
                />
              </div>
              {activity?.scrape_quota && (
                <p className="text-xs text-muted-foreground">
                  Today: {activity.scrape_quota.used} used · {activity.scrape_quota.remaining} left
                  (cap {activity.scrape_quota.limit})
                </p>
              )}
              <Button size="sm" onClick={handleSaveScrapeLimit} disabled={savingScrapeLimit}>
                {savingScrapeLimit ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save limit
              </Button>
            </CardContent>
          </Card>

          {candidate.auto_apply_allowed && (
            <Card>
              <CardHeader>
                <CardTitle>Beat scrape</CardTitle>
                <CardDescription>
                  Background fetch runs only while Auto-Apply is allowed and the candidate has it on.
                  Leave blank to use the default from Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="beat-interval">Interval (minutes)</Label>
                  <Input
                    id="beat-interval"
                    type="number"
                    min={5}
                    max={1440}
                    placeholder="Default from Settings"
                    value={beatMinutes}
                    onChange={(e) => setBeatMinutes(e.target.value)}
                  />
                </div>
                {activity?.last_beat_scrape_at && (
                  <p className="text-xs text-muted-foreground">
                    Last beat scrape: {new Date(activity.last_beat_scrape_at).toLocaleString()}
                  </p>
                )}
                <Button size="sm" onClick={handleSaveBeat} disabled={savingBeat}>
                  {savingBeat ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Save interval
                </Button>
              </CardContent>
            </Card>
          )}

          {activity?.preferences && (
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-zinc-300">
                  {Array.isArray(activity.preferences.roles)
                    ? activity.preferences.roles.join(", ") || "—"
                    : "—"}
                </p>
                <p className="text-zinc-400">
                  {activity.preferences.industry || "Any industry"}
                  {activity.preferences.work_mode ? ` · ${activity.preferences.work_mode}` : ""}
                  {activity.preferences.job_type ? ` · ${activity.preferences.job_type}` : ""}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              <Badge
                variant={candidate.auto_apply_enabled ? "default" : "outline"}
                className="w-full justify-center py-1.5"
              >
                {candidate.auto_apply_enabled ? (
                  <>
                    <Zap className="mr-1 size-3" /> Auto-Apply Enabled
                  </>
                ) : (
                  <>
                    <ZapOff className="mr-1 size-3" /> Auto-Apply Disabled
                  </>
                )}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
