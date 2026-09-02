"use client";

import Link from "next/link";
import {
  Zap,
  Globe,
  Brain,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Lock,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminContactNote } from "@/components/admin-contact";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const features = [
  {
    icon: Globe,
    title: "Multi-portal fetch",
    body: "Pull matching roles from LinkedIn, Naukri, Indeed, and Wellfound from one preference set.",
  },
  {
    icon: Brain,
    title: "Smart matching",
    body: "Rank openings against your titles, skills, location, and industry — tech, commerce, finance, or BPO.",
  },
  {
    icon: Zap,
    title: "Auto-Apply",
    body: "When an admin allows it, matching jobs are submitted around the clock while you prep for interviews.",
  },
  {
    icon: BarChart3,
    title: "Application tracking",
    body: "See fetches, apply clicks, and pipeline status so nothing disappears into a portal form.",
  },
];

export default function CandidateHomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent p-8 sm:p-12">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-400 uppercase">
          Account created
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Your job search, on autopilot — after Premium
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-300">
          Email is verified. Fetching, applying, and Auto-Apply stay locked until
          an admin issues your invite code. Upgrade to Premium to unlock the
          full product.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/activate"
            className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-7")}
          >
            Unlock Premium
            <ArrowRight className="size-4" />
          </Link>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 rounded-full px-7"
                >
                  Ask admin for a code
                </Button>
              }
            />
            <DialogContent className="border-white/10 bg-zinc-950 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Contact admin</DialogTitle>
                <DialogDescription className="text-zinc-300">
                  Email or WhatsApp to request your Premium invite code.
                </DialogDescription>
              </DialogHeader>
              <AdminContactNote />
              <p className="text-center text-xs text-zinc-500">
                <a
                  href="mailto:princeprasad1104@gmail.com"
                  className="text-white underline underline-offset-4"
                >
                  princeprasad1104@gmail.com
                </a>
                {" · "}
                <a
                  href="https://wa.me/919875407603"
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline underline-offset-4"
                >
                  WhatsApp 9875407603
                </a>
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">What Premium unlocks</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {features.map((item) => (
            <div
              key={item.title}
              className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                  <item.icon className="size-5" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-wide text-zinc-400 uppercase">
                  <Lock className="size-3" /> Locked
                </span>
              </div>
              <h3 className="font-medium text-white">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/40 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <ShieldCheck className="size-4 text-emerald-400" />
            Invite-only Premium
          </p>
          <p className="mt-1 max-w-lg text-sm text-zinc-400">
            Admins generate a one-time code. Enter it once to unlock scraping,
            applications, and Auto-Apply for your account.
          </p>
        </div>
        <Link
          href="/activate"
          className={cn(buttonVariants(), "mt-4 rounded-full sm:mt-0")}
        >
          Enter invite code
        </Link>
      </section>
    </div>
  );
}
