"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  Save,
  Loader2,
  Upload,
  FileText,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { ExperienceForm } from "@/components/experience-form";
import { EducationForm } from "@/components/education-form";
import { MultiTagInput } from "@/components/multi-tag-input";
import api, { getApiErrorMessage } from "@/lib/api";
import { HOT_SKILLS, SKILL_SUGGESTIONS } from "@/lib/suggestions";
import type {
  CandidateProfile,
  ExperienceEntry,
  EducationEntry,
} from "@/types";

interface ProfileFormData {
  full_name: string;
  phone: string;
  location: string;
  bio: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  resume_url: string;
}

function toForm(p: CandidateProfile): ProfileFormData {
  return {
    full_name: p.full_name || "",
    phone: p.phone || "",
    location: p.location || "",
    bio: p.bio || "",
    skills: Array.isArray(p.skills) ? p.skills : [],
    experience: Array.isArray(p.experience) ? p.experience : [],
    education: Array.isArray(p.education) ? p.education : [],
    resume_url: p.resume_url || "",
  };
}

export default function CandidateProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<ProfileFormData>({
    defaultValues: {
      full_name: "",
      phone: "",
      location: "",
      bio: "",
      skills: [],
      experience: [],
      education: [],
      resume_url: "",
    },
  });

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<CandidateProfile>("/candidates/me");
      setProfile(res.data);
      reset(toForm(res.data));
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      const res = await api.put<CandidateProfile>("/candidates/me", {
        full_name: data.full_name.trim() || "Candidate",
        phone: data.phone.trim() || null,
        location: data.location.trim() || null,
        bio: data.bio.trim() || null,
        skills: data.skills,
        experience: data.experience,
        education: data.education,
        resume_url: data.resume_url || null,
      });
      setProfile(res.data);
      reset(toForm(res.data));
      toast.success({ title: "Profile saved successfully" });
    } catch (err: unknown) {
      toast.error({
        title: "Failed to save profile",
        description: getApiErrorMessage(err, "Try again."),
      });
    }
  };

  const uploadResume = async (file: File) => {
    let target = profile;
    if (!target) {
      try {
        const created = await api.post<CandidateProfile>("/candidates/", {
          full_name: getValues("full_name") || "Candidate",
        });
        target = created.data;
        setProfile(target);
      } catch (err: unknown) {
        toast.error({
          title: getApiErrorMessage(err, "Create a profile before uploading"),
        });
        return;
      }
    }
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const okType =
      allowed.includes(file.type) ||
      /\.(pdf|doc|docx)$/i.test(file.name);
    if (!okType) {
      toast.error({ title: "Resume must be a PDF, DOC, or DOCX file" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error({ title: "Resume must be 10MB or smaller" });
      return;
    }

    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const res = await api.post<CandidateProfile>(
        `/candidates/${target.id}/resume`,
        form,
        { timeout: 60000 },
      );
      setProfile(res.data);
      reset(toForm(res.data));
      const filled = [
        res.data.full_name && "name",
        res.data.phone && "phone",
        res.data.location && "location",
        res.data.bio && "bio",
        (res.data.skills?.length ?? 0) > 0 && "skills",
        (res.data.experience?.length ?? 0) > 0 && "experience",
        (res.data.education?.length ?? 0) > 0 && "education",
      ].filter(Boolean);
      toast.success({
        title: `Uploaded ${file.name}`,
        description: filled.length
          ? `Saved ${filled.join(", ")} from your resume. Review below and click Save if you edit anything.`
          : "Resume saved. We could not read extra details — fill them manually and save.",
      });
    } catch (err: unknown) {
      toast.error({
        title: getApiErrorMessage(err, "Failed to upload resume"),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void uploadResume(file);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadProfile}>
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
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">
            Keep your profile up to date for better job matches.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Save Changes
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Resume
            </CardTitle>
            <CardDescription>
              Upload a PDF or DOCX and we will fill name, bio, skills, experience, and education.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <Upload className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drag & drop your resume here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, DOC, or DOCX up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void uploadResume(file);
                  }
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                {uploading ? "Reading resume…" : "Choose File"}
              </Button>
              {profile?.resume_url && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Current file: {profile.resume_url.split(/[/\\]/).pop()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4" />
              Basic Information
            </CardTitle>
            <CardDescription>
              Your personal details used in applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  {...register("full_name")}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  {...register("phone")}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  {...register("location")}
                  placeholder="City, Country"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                {...register("bio")}
                placeholder="A brief summary about yourself and your career goals..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>
              Add professional skills for any field — technical, finance, BPO, or commerce. These help match jobs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="skills"
              control={control}
              render={({ field }) => (
                <MultiTagInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="e.g. MS Excel, SQL, Customer Service"
                  suggestions={SKILL_SUGGESTIONS}
                  hotSuggestions={HOT_SKILLS}
                  hotLabel="Popular skills"
                />
              )}
            />
          </CardContent>
        </Card>

        {/* Experience */}
        <Card>
          <CardHeader>
            <CardTitle>Work Experience</CardTitle>
            <CardDescription>
              Add your professional experience, most recent first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="experience"
              control={control}
              render={({ field }) => (
                <ExperienceForm
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
            <CardDescription>
              Add your educational background.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="education"
              control={control}
              render={({ field }) => (
                <EducationForm
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
