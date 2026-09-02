"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

const FALLBACK_COMPANIES = [
  "Accenture",
  "TCS",
  "Infosys",
  "Amazon",
  "Google",
  "HDFC Bank",
  "Flipkart",
  "Wipro",
  "Deloitte",
  "Microsoft",
  "Capgemini",
  "Cognizant",
];

const FALLBACK_PORTALS = ["LinkedIn", "Naukri", "Indeed"];

type Step = { title: string; detail: string };

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildSteps(companies: string[], roles: string[], portals: string[]): Step[] {
  const role = roles[0] || "your target roles";
  const extraRoles = roles.slice(1, 3);
  const portalList = (portals.length ? portals : FALLBACK_PORTALS).slice(0, 4);
  const viewed = shuffle(companies.length ? companies : FALLBACK_COMPANIES).slice(0, 8);

  const steps: Step[] = [
    {
      title: "Warming up the search agent",
      detail: "Reading your roles, skills, and location filters",
    },
    {
      title: "Connecting to job portals",
      detail: portalList.join(" · "),
    },
    {
      title: `Fetching live ${role} listings`,
      detail: extraRoles.length
        ? `Also scanning ${extraRoles.join(", ")}`
        : "Pulling the newest postings first",
    },
  ];

  for (const company of viewed) {
    steps.push({
      title: `Viewed ${company}`,
      detail: "Checking recent openings against your profile",
    });
  }

  steps.push(
    {
      title: "Filtering noise",
      detail: "Dropping mismatched locations, seniority, and excluded firms",
    },
    {
      title: "Scoring each listing",
      detail: "Ranking titles, skills, and work mode against your preferences",
    },
    {
      title: "Preparing your matched feed",
      detail: "Almost done — assembling the strongest fits",
    },
  );

  return steps;
}

export function ScrapeIntelligence({
  open,
  companies,
  roles,
  portals,
}: {
  open: boolean;
  companies: string[];
  roles: string[];
  portals: string[];
}) {
  const steps = useMemo(
    () => (open ? buildSteps(companies, roles, portals) : []),
    [open, companies, roles, portals],
  );
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setProgress(6);
      return;
    }

    const stepTimer = window.setInterval(() => {
      setIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)));
    }, 1400);

    const progressTimer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 92) return value;
        return Math.min(92, value + 2 + Math.random() * 4);
      });
    }, 700);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(progressTimer);
    };
  }, [open, steps.length]);

  if (!open) return null;

  const current = steps[index] ?? steps[0];
  const log = steps.slice(Math.max(0, index - 3), index);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/90 p-7 shadow-[0_40px_120px_-32px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-64 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto mb-6 flex size-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-2 rounded-full border border-dashed border-white/20" />
          <div className="absolute inset-0 animate-spin rounded-full [animation-duration:3.2s] bg-[conic-gradient(from_90deg,transparent_0%,transparent_70%,rgba(255,255,255,0.85)_88%,transparent_100%)] opacity-80 [mask:radial-gradient(farthest-side,transparent_calc(100%-3px),#000_calc(100%-2px))]" />
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-white text-zinc-950 shadow-[0_0_28px_rgba(255,255,255,0.2)]">
            <Sparkles className="size-5" />
          </div>
        </div>

        <p className="text-center text-[11px] font-medium tracking-[0.22em] text-zinc-500 uppercase">
          Live search
        </p>
        <h2 className="mt-2 text-center text-xl font-semibold tracking-tight text-white">
          {current?.title ?? "Fetching jobs"}
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-300">{current?.detail}</p>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-zinc-500">
          Scanning portals — this can take a little while
        </p>

        <div className="mt-5 space-y-1.5">
          {log.map((step, i) => (
            <p
              key={`${step.title}-${i}`}
              className="truncate text-center text-xs text-zinc-500"
            >
              {step.title}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
