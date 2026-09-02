"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UserCircle,
  SlidersHorizontal,
  Globe,
  FileText,
  Briefcase,
} from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { BrandLogo } from "@/components/brand-logo";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getUserRole, getAccountStatus, isAuthenticated } from "@/lib/auth";
import api, { getApiErrorMessage } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { AutoApplyProvider } from "@/lib/auto-apply-context";
import { UpgradeAutoApplyDialog } from "@/components/upgrade-auto-apply-dialog";

const navItems: SidebarItem[] = [
  { label: "Dashboard", href: "/candidate/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/candidate/profile", icon: UserCircle },
  {
    label: "Preferences",
    href: "/candidate/preferences",
    icon: SlidersHorizontal,
  },
  { label: "Jobs", href: "/candidate/jobs", icon: Briefcase },
  { label: "Portals", href: "/candidate/portals", icon: Globe },
  { label: "Applications", href: "/candidate/applications", icon: FileText },
];

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [autoApplyAllowed, setAutoApplyAllowed] = useState(false);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() || getUserRole() !== "candidate") {
      router.replace("/login");
      return;
    }
    const status = getAccountStatus();
    setAccountStatus(status);
    if (status === "pending") {
      if (pathname !== "/candidate/home") {
        router.replace("/candidate/home");
        return;
      }
      setReady(true);
      return;
    }
    setReady(true);
    api
      .get<{ auto_apply_enabled: boolean; auto_apply_allowed: boolean }>(
        "/auto-apply/status",
      )
      .then(({ data }) => {
        setAutoApply(data.auto_apply_enabled);
        setAutoApplyAllowed(data.auto_apply_allowed);
      })
      .catch(() => {});
  }, [router, pathname]);

  const handleAutoApplyToggle = async (enabled: boolean) => {
    if (!autoApplyAllowed) {
      setUpgradeOpen(true);
      return;
    }
    if (accountStatus === "paused") {
      toast.error({
        title: "Account paused",
        description: "Job fetching and applications are disabled until an admin resumes your account.",
      });
      return;
    }
    setAutoApply(enabled);
    setToggling(true);
    try {
      if (enabled) {
        await api.post("/auto-apply/resume");
        const { data } = await api.post<{
          message: string;
          queued_count: number;
        }>("/auto-apply/trigger", null, { timeout: 60000 });
        toast.success({
          title: "Auto-Apply is on",
          description:
            data.queued_count > 0
              ? `${data.queued_count} matched job${data.queued_count === 1 ? "" : "s"} queued — applying now.`
              : data.message,
        });
      } else {
        await api.post("/auto-apply/pause");
        toast.info({
          title: "Auto-Apply is off",
          description: "Queued applications are paused.",
        });
      }
    } catch (err: unknown) {
      setAutoApply(!enabled);
      toast.error({
        title: "Auto-Apply update failed",
        description: getApiErrorMessage(err, "Could not change Auto-Apply"),
      });
    } finally {
      setToggling(false);
    }
  };

  const sidebarItems = accountStatus === "pending"
    ? [{ label: "Home", href: "/candidate/home", icon: LayoutDashboard }]
    : navItems;

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={sidebarItems}
        header={
          <Link href="/candidate/home" className="hover:opacity-90">
            <BrandLogo markClassName="size-7 rounded-lg" />
          </Link>
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          email="user@autoapply.io"
          sidebarItems={sidebarItems}
          actions={
            accountStatus === "pending" ? undefined : (
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-apply-toggle" className="text-xs text-muted-foreground hidden sm:inline-block">
                Auto-Apply
              </Label>
              <Switch
                id="auto-apply-toggle"
                checked={autoApply && autoApplyAllowed}
                disabled={toggling || accountStatus === "paused"}
                title={
                  !autoApplyAllowed
                    ? "Upgrade required — contact admin"
                    : undefined
                }
                onCheckedChange={handleAutoApplyToggle}
              />
            </div>
            )
          }
        />
        <main className="flex-1 overflow-y-auto bg-background/80 p-6 lg:p-8">
          {accountStatus === "paused" && (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Your account is paused. You can update your profile, but job fetching and applications are disabled.
            </div>
          )}
          <UpgradeAutoApplyDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
          <AutoApplyProvider
            value={{
              enabled: autoApply && autoApplyAllowed,
              allowed: autoApplyAllowed,
              requestUpgrade: () => setUpgradeOpen(true),
            }}
          >
            {children}
          </AutoApplyProvider>
        </main>
      </div>
    </div>
  );
}
