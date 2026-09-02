"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Link2,
  Briefcase,
  Search,
  Rocket,
  Globe,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api, { getApiErrorMessage } from "@/lib/api";
import type { PortalConnection } from "@/types";
import { PortalCard } from "@/components/portal-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PORTALS: {
  name: string;
  key: string;
  icon: LucideIcon;
  description: string;
  fields: { key: string; label: string; type: string; placeholder: string }[];
}[] = [
  {
    name: "LinkedIn",
    key: "linkedin",
    icon: Link2,
    description: "Roles across tech, finance, BPO, and commerce",
    fields: [
      { key: "email", label: "Email", type: "email", placeholder: "you@example.com" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
      { key: "session_cookie", label: "Session Cookie (optional)", type: "text", placeholder: "li_at=…" },
    ],
  },
  {
    name: "Naukri",
    key: "naukri",
    icon: Briefcase,
    description: "India jobs including non-tech and BPO",
    fields: [
      { key: "email", label: "Email", type: "email", placeholder: "you@example.com" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
      { key: "session_cookie", label: "Session Cookie (optional)", type: "text", placeholder: "nauk_at=…" },
    ],
  },
  {
    name: "Indeed",
    key: "indeed",
    icon: Search,
    description: "Broad listings for any background",
    fields: [
      { key: "email", label: "Email", type: "email", placeholder: "you@example.com" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
    ],
  },
  {
    name: "Wellfound",
    key: "wellfound",
    icon: Rocket,
    description: "Startup and software roles only",
    fields: [
      { key: "email", label: "Email", type: "email", placeholder: "you@example.com" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
    ],
  },
];

function portalIcon(key: string): LucideIcon {
  return PORTALS.find((p) => p.key === key)?.icon ?? Globe;
}

function portalLabel(key: string): string {
  return PORTALS.find((p) => p.key === key)?.name ?? key;
}

export default function PortalsPage() {
  const [connections, setConnections] = useState<PortalConnection[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState(PORTALS[0].key);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const { data } = await api.get<PortalConnection[]>("/portals/");
      setConnections(data);
    } catch {
      /* empty — API may not be running */
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const selectedDef = PORTALS.find((p) => p.key === selectedPortal)!;

  const resetForm = () => {
    setCredentials({});
    setTestResult(null);
    setSelectedPortal(PORTALS[0].key);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/portals/", {
        portal: selectedPortal,
        credentials,
      });
      const res = await api.post<{ status: string; message: string }>(
        `/portals/${data.id}/test`,
        {},
        { timeout: 90000 },
      );
      setTestResult(res.data.message ?? "Connection OK");
      await fetchConnections();
    } catch (err: unknown) {
      setTestResult(getApiErrorMessage(err, "Connection test failed"));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const existing = connections.find((c) => c.portal === selectedPortal);
      if (existing) {
        await api.put(`/portals/${existing.id}`, { credentials });
      } else {
        await api.post("/portals/", {
          portal: selectedPortal,
          credentials,
        });
      }
      await fetchConnections();
      setDialogOpen(false);
      resetForm();
    } catch (err: unknown) {
      setTestResult(getApiErrorMessage(err, "Failed to save portal"));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.delete(`/portals/${id}`);
      await fetchConnections();
    } catch {
      /* empty */
    }
  };

  const handleReauth = (portalKey: string) => {
    setSelectedPortal(portalKey);
    setCredentials({});
    setTestResult(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portal Connections</h1>
          <p className="text-muted-foreground">
            Connect LinkedIn, Naukri, or Indeed for most backgrounds. Wellfound is for startup/software roles.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Globe className="mr-2 size-4" />
                Connect Portal
              </Button>
            }
          />

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Connect a Portal</DialogTitle>
              <DialogDescription>
                Enter your credentials for the selected job portal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Portal</Label>
                <select
                  value={selectedPortal}
                  onChange={(e) => {
                    setSelectedPortal(e.target.value);
                    setCredentials({});
                    setTestResult(null);
                  }}
                  className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {PORTALS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} — {p.description}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDef.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={credentials[field.key] ?? ""}
                    onChange={(e) =>
                      setCredentials((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}

              {testResult && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {testResult}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing}
              >
                {testing && <Loader2 className="mr-2 size-4 animate-spin" />}
                Test Connection
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PORTALS.map((p) => {
          const conn = connections.find((c) => c.portal === p.key);
          return (
            <PortalCard
              key={p.key}
              name={p.name}
              icon={p.icon}
              description={p.description}
              isConnected={conn?.is_active ?? false}
              lastSynced={conn?.last_synced ?? null}
              onConnect={() => handleReauth(p.key)}
              onDisconnect={() => conn && handleDisconnect(conn.id)}
              onReauth={() => handleReauth(p.key)}
            />
          );
        })}
      </div>
    </div>
  );
}
