import Link from "next/link";
import {
  Zap,
  Globe,
  Brain,
  ShieldCheck,
  BarChart3,
  Users,
  ArrowRight,
  Check,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { SceneBackground } from "@/components/scene-background";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Zap,
    title: "Auto-Apply",
    description:
      "Admins unlock Auto-Apply per candidate. Once allowed, matching jobs are submitted around the clock.",
  },
  {
    icon: Globe,
    title: "Multi-portal",
    description:
      "LinkedIn, Naukri, and Indeed for every background. Wellfound for startup and software roles.",
  },
  {
    icon: Brain,
    title: "Smart matching",
    description:
      "Rank openings against your roles and skills — software, finance, commerce, or BPO.",
  },
  {
    icon: ShieldCheck,
    title: "Invite-only access",
    description:
      "Accounts activate with an admin code. Pause or suspend anytime to prevent abuse.",
  },
  {
    icon: BarChart3,
    title: "Usage visibility",
    description:
      "See how often candidates fetch jobs and click Apply, so you can price fairly.",
  },
  {
    icon: Users,
    title: "Any background",
    description:
      "Built for developers first, and equally ready for commerce, finance, and customer support.",
  },
];

const steps = [
  {
    step: "01",
    title: "Create your account",
    body: "Sign up with email. An admin sends a one-time code to activate you.",
  },
  {
    step: "02",
    title: "Set roles and portals",
    body: "Add target titles, skills, and connect LinkedIn, Naukri, or Indeed.",
  },
  {
    step: "03",
    title: "Fetch and apply",
    body: "Scrape matching jobs. Apply manually, or use Auto-Apply when your admin allows it.",
  },
];

const audiences = [
  "Software & AI",
  "Full stack",
  "Finance & accounts",
  "Commerce & retail",
  "BPO & support",
  "Sales",
];

const checks = [
  "Preference-based scraping, not a fixed tech list",
  "Admin-controlled Auto-Apply",
  "Pause and suspend without deleting data",
];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <SceneBackground mode="viewport" count={120} />
      <div className="pointer-events-none fixed inset-0 z-0 bg-glow" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />

      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="relative">
            <BrandLogo />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/90 md:flex">
            <a href="#features" className="transition-colors hover:text-white">
              Product
            </a>
            <a href="#how" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="#access" className="transition-colors hover:text-white">
              Access
            </a>
          </nav>
          <div className="relative flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-white/90 hover:text-white")}>
              Log in
            </Link>
            <Link href="/register" className={cn(buttonVariants({ size: "sm" }), "rounded-full px-4")}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pb-20 pt-20 text-center sm:pt-28">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)] sm:text-6xl sm:leading-[1.05]">
            Apply to hundreds of jobs automatically
          </h1>
          <p className="mt-5 max-w-xl text-base text-zinc-100 sm:text-lg drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">
            Connect your portals, set preferences for any career path, and let
            AutoApply fetch and apply. You prepare for interviews — we handle the forms.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-7")}>
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-full px-7")}>
              Log in
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {audiences.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/25 bg-black/50 px-3 py-1 text-xs text-zinc-100"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-16 w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-2xl shadow-black/20 ring-1 ring-white/5">
            <div className="flex items-center gap-1.5 border-b border-border/50 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="ml-3 text-xs text-zinc-300">Dashboard</span>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              {[
                { label: "Matched jobs", value: "128" },
                { label: "Applied", value: "42" },
                { label: "Interviews", value: "6" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border/50 bg-background/40 px-4 py-4 text-left"
                >
                  <p className="text-xs text-zinc-300">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-6 pb-24">
          <p className="text-center text-sm font-medium text-zinc-300">
            Built like a product, not a script
          </p>
          <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight">
            Everything you need to run job search as a service
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-border hover:bg-card/70"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-foreground/5 ring-1 ring-foreground/10">
                  <f.icon className="size-5 text-foreground" />
                </div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-border/50 bg-card/30">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step}>
                <p className="text-xs font-medium tracking-widest text-zinc-400">
                  {item.step}
                </p>
                <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="access" className="mx-auto w-full max-w-6xl px-6 py-24">
          <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/50 p-8 sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Access is gated. Usage is visible.
                </h2>
                <p className="mt-3 max-w-lg text-zinc-300">
                  This is a paid candidate platform. Admins issue codes, allow Auto-Apply,
                  and can pause or suspend accounts. Candidates from software, commerce,
                  finance, and BPO all scrape from their own preferences.
                </p>
                <ul className="mt-6 space-y-3">
                  {checks.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 p-6">
                <p className="text-sm font-medium">Ready to join?</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Create an account, then enter the invite code from your admin.
                </p>
                <Link href="/register" className={cn(buttonVariants(), "mt-5 w-full rounded-full")}>
                  Create account
                </Link>
                <p className="mt-3 text-center text-xs text-zinc-400">
                  Already activated?{" "}
                  <Link href="/login" className="text-white underline-offset-4 hover:underline">
                    Log in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-zinc-400 sm:flex-row">
          <BrandLogo className="opacity-80" markClassName="size-7 rounded-lg" />
          <p>© {new Date().getFullYear()} AutoApply. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
