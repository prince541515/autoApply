"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, Ticket, Settings } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { BrandLogo } from "@/components/brand-logo";
import { getUserRole, isAuthenticated } from "@/lib/auth";

const navItems: SidebarItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Candidates", href: "/admin/candidates", icon: Users },
  { label: "Invite codes", href: "/admin/invites", icon: Ticket },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() || getUserRole() !== "admin") {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={navItems}
        header={
          <Link href="/admin/dashboard" className="hover:opacity-90">
            <BrandLogo markClassName="size-7 rounded-lg" />
          </Link>
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar email="admin@autoapply.io" sidebarItems={navItems} />
        <main className="flex-1 overflow-y-auto bg-background/80 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
