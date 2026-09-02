"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import api, { getApiErrorMessage } from "@/lib/api";
import type { JobPreference } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MultiTagInput } from "@/components/multi-tag-input";
import {
  INDUSTRY_OPTIONS,
  hotRolesForIndustries,
  hotSkillsForIndustries,
  rolesForIndustries,
  skillsForIndustries,
} from "@/lib/suggestions";
import {
  COUNTRIES,
  STATES_BY_COUNTRY,
  parseStoredLocations,
  toStoredLocations,
} from "@/lib/locations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const JOB_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
  "Temporary",
  "Night Shift",
] as const;
const WORK_MODES = ["Remote", "On-site", "Hybrid", "Any"] as const;
const CURRENCY_OPTIONS = ["INR", "USD"] as const;

export default function PreferencesPage() {
  const [prefId, setPrefId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [country, setCountry] = useState<string>("India");
  const [states, setStates] = useState<string[]>([]);
  const [remoteToggle, setRemoteToggle] = useState(false);
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCY_OPTIONS)[number]>("INR");
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<string>("Any");
  const [minExp, setMinExp] = useState("");
  const [maxExp, setMaxExp] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>(["Any"]);
  const [excludedCompanies, setExcludedCompanies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const { data } = await api.get<JobPreference[]>("/preferences/");
      if (data.length > 0) {
        const pref = data[0];
        setPrefId(String(pref.id));
        setRoles(pref.roles ?? []);
        const parsed = parseStoredLocations(pref.locations);
        setCountry(parsed.country);
        setStates(parsed.states);
        setRemoteToggle(parsed.remote);
        setMinSalary(pref.min_salary?.toString() ?? "");
        setMaxSalary(pref.max_salary?.toString() ?? "");
        setJobTypes(pref.job_type ? pref.job_type.split(",") : []);
        setWorkMode(pref.work_mode ?? "Any");
        setMinExp(pref.min_experience_years?.toString() ?? "");
        setMaxExp(pref.max_experience_years?.toString() ?? "");
        setRequiredSkills(pref.required_skills ?? []);
        setIndustries(
          pref.industry
            ? pref.industry.split(",").map((item) => item.trim()).filter(Boolean)
            : ["Any"],
        );
        setExcludedCompanies(pref.excluded_companies ?? []);
      }
    } catch {
      /* API may not be running */
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    const payload = {
      roles,
      locations: toStoredLocations(country, states, remoteToggle),
      min_salary: minSalary ? Number(minSalary) : null,
      max_salary: maxSalary ? Number(maxSalary) : null,
      job_type: jobTypes.join(",") || null,
      work_mode: workMode,
      excluded_companies: excludedCompanies,
      required_skills: requiredSkills,
      industry: industries,
      min_experience_years: minExp ? Number(minExp) : null,
      max_experience_years: maxExp ? Number(maxExp) : null,
    };

    try {
      if (prefId) {
        await api.put(`/preferences/${prefId}`, payload);
      } else {
        const { data } = await api.post("/preferences/", payload);
        setPrefId(String(data.id));
      }
      setSaved(true);
      toast.success({ title: "Preferences saved" });
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      toast.error({
        title: "Could not save preferences",
        description: getApiErrorMessage(err, "Try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleIndustry = (item: string) => {
    setIndustries((prev) => {
      if (item === "Any") return ["Any"];
      const withoutAny = prev.filter((value) => value !== "Any");
      const next = withoutAny.includes(item)
        ? withoutAny.filter((value) => value !== item)
        : [...withoutAny, item];
      return next.length ? next : ["Any"];
    });
  };

  const toggleJobType = (type: string) => {
    setJobTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Preferences</h1>
        <p className="text-muted-foreground">
          Set target roles for your background — software, finance, commerce,
          BPO, or anything else. Scraping uses these titles, not a fixed tech list.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Industry / background</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-3">
              {INDUSTRY_OPTIONS.map((item) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={industries.includes(item)}
                    onCheckedChange={() => toggleIndustry(item)}
                  />
                  {item}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pick one or more backgrounds. Fetch and matched jobs use these
              plus the titles you add below.
            </p>
          </CardContent>
        </Card>

        {/* Target Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiTagInput
              value={roles}
              onChange={setRoles}
              placeholder="e.g. Software Engineer, Accountant, Customer Support"
              suggestions={rolesForIndustries(industries)}
              hotSuggestions={hotRolesForIndustries(industries)}
              hotLabel="Popular titles"
            />
          </CardContent>
        </Card>

        {/* Locations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Locations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Select
                value={country}
                onValueChange={(value) => {
                  if (value == null) return;
                  setCountry(value);
                  setStates([]);
                }}
              >
                <SelectTrigger id="country" className="w-full">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>State / region</Label>
              <MultiTagInput
                value={states}
                onChange={setStates}
                placeholder="e.g. Karnataka, Maharashtra"
                suggestions={STATES_BY_COUNTRY[country] ?? []}
              />
              <p className="text-xs text-muted-foreground">
                Leave states empty to scrape the whole country. Scraping uses
                only these locations and your target roles.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="remote-toggle"
                checked={remoteToggle}
                onCheckedChange={setRemoteToggle}
              />
              <Label htmlFor="remote-toggle" className="text-sm">
                Include Remote
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Salary Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salary Range</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {CURRENCY_OPTIONS.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={currency === c ? "default" : "outline"}
                  onClick={() => setCurrency(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-salary">Minimum</Label>
                <Input
                  id="min-salary"
                  type="number"
                  placeholder="e.g. 500000"
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-salary">Maximum</Label>
                <Input
                  id="max-salary"
                  type="number"
                  placeholder="e.g. 2500000"
                  value={maxSalary}
                  onChange={(e) => setMaxSalary(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Type & Work Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job Type & Work Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Job Type</Label>
              <div className="flex flex-wrap gap-3">
                {JOB_TYPES.map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={jobTypes.includes(type)}
                      onCheckedChange={() => toggleJobType(type)}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Work Mode</Label>
              <div className="flex flex-wrap gap-3">
                {WORK_MODES.map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="work-mode"
                      value={mode}
                      checked={workMode === mode}
                      onChange={() => setWorkMode(mode)}
                      className="size-4 accent-primary"
                    />
                    {mode}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Experience Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Experience Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-exp">Min Years</Label>
                <Input
                  id="min-exp"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={minExp}
                  onChange={(e) => setMinExp(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-exp">Max Years</Label>
                <Input
                  id="max-exp"
                  type="number"
                  min={0}
                  placeholder="5"
                  value={maxExp}
                  onChange={(e) => setMaxExp(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Required Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiTagInput
              value={requiredSkills}
              onChange={setRequiredSkills}
              placeholder="e.g. MS Excel, SQL, Customer Service"
              suggestions={skillsForIndustries(industries)}
              hotSuggestions={hotSkillsForIndustries(industries)}
              hotLabel="Popular skills"
            />
          </CardContent>
        </Card>

        {/* Excluded Companies */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Excluded Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiTagInput
              value={excludedCompanies}
              onChange={setExcludedCompanies}
              placeholder="Companies to skip…"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Save Preferences
        </Button>
        {saved && (
          <span className="text-sm text-emerald-500">Preferences saved!</span>
        )}
      </div>
    </div>
  );
}
