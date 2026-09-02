"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import api, { getApiErrorMessage } from "@/lib/api";

interface PlatformSettings {
  beat_scrape_interval_minutes: number;
  min_minutes: number;
  max_minutes: number;
  daily_scrape_limit: number;
  min_daily_scrapes: number;
  max_daily_scrapes: number;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [dailyLimit, setDailyLimit] = useState("10");
  const [bounds, setBounds] = useState({ min: 5, max: 1440 });
  const [dailyBounds, setDailyBounds] = useState({ min: 1, max: 200 });

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<PlatformSettings>("/admin/settings");
        setMinutes(String(data.beat_scrape_interval_minutes));
        setDailyLimit(String(data.daily_scrape_limit));
        setBounds({ min: data.min_minutes, max: data.max_minutes });
        setDailyBounds({
          min: data.min_daily_scrapes,
          max: data.max_daily_scrapes,
        });
      } catch (err: unknown) {
        toast.error({
          title: "Could not load settings",
          description: getApiErrorMessage(err, "Try again."),
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put<PlatformSettings>("/admin/settings", {
        beat_scrape_interval_minutes: Number(minutes),
        daily_scrape_limit: Number(dailyLimit),
      });
      setMinutes(String(data.beat_scrape_interval_minutes));
      setDailyLimit(String(data.daily_scrape_limit));
      toast.success({ title: "Settings saved" });
    } catch (err: unknown) {
      toast.error({
        title: "Could not save settings",
        description: getApiErrorMessage(err, "Try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Background scrape only runs for candidates with Auto-Apply allowed and turned on.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Beat scrape interval</CardTitle>
          <CardDescription>
            Default minutes between automatic fetches for Auto-Apply candidates.
            Candidates without Auto-Apply are never beat-scraped — they fetch only when they click Fetch.
            You can override this per candidate on their profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="beat-minutes">Minutes ({bounds.min}–{bounds.max})</Label>
              <Input
                id="beat-minutes"
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily scrape limit</CardTitle>
          <CardDescription>
            Default scrapes per UTC day per candidate (manual Scrape Now and beat).
            Override on any candidate profile. This stops one account from spiking infrastructure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="daily-scrapes">
                Scrapes per day ({dailyBounds.min}–{dailyBounds.max})
              </Label>
              <Input
                id="daily-scrapes"
                type="number"
                min={dailyBounds.min}
                max={dailyBounds.max}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || loading}>
        {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
        Save settings
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/invites">
          <Card className="h-full hover:bg-muted/40">
            <CardHeader>
              <CardTitle>Invite codes</CardTitle>
              <CardDescription>
                Generate one-time codes required to activate new candidate accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Open invite codes
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/candidates">
          <Card className="h-full hover:bg-muted/40">
            <CardHeader>
              <CardTitle>Candidates</CardTitle>
              <CardDescription>
                Allow Auto-Apply and set a custom beat interval or scrape cap per candidate.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Open candidates
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
