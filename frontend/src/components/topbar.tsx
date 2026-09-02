"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { clearTokens } from "@/lib/auth";
import type { SidebarItem } from "@/components/sidebar";
import { MobileSidebarContent } from "@/components/sidebar";
import { BrandLogo } from "@/components/brand-logo";

interface TopbarProps {
  email?: string;
  sidebarItems?: SidebarItem[];
  actions?: React.ReactNode;
}

export function Topbar({ email, sidebarItems, actions }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    clearTokens();
    router.push("/login");
  };

  const initials = email
    ? email
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase()
    : "U";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        {sidebarItems && (
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden" />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>
                  <BrandLogo />
                </SheetTitle>
              </SheetHeader>
              <MobileSidebarContent items={sidebarItems} />
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {email && (
          <div className="flex items-center gap-2 border-l border-border pl-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm text-muted-foreground sm:inline-block">
              {email}
            </span>
          </div>
        )}

        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="size-4" />
          <span className="sr-only">Logout</span>
        </Button>
      </div>
    </header>
  );
}
