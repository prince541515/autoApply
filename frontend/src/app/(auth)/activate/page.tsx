"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api, { getApiErrorMessage } from "@/lib/api";
import { getAccessToken, getUserRole, setTokens } from "@/lib/auth";
import type { AuthTokens } from "@/types";
import { AdminContactNote } from "@/components/admin-contact";
import { toast } from "@/components/ui/toast";

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const schema = z.object({
  email: z.string().email("Enter your signup email").or(z.literal("")),
  password: z.string(),
  code: z.string().min(4, "Enter the invite code from your admin"),
});

type FormValues = z.infer<typeof schema>;

export default function ActivatePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(!getAccessToken() || getUserRole() !== "candidate");
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", code: "" },
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token || getUserRole() !== "candidate") {
      setNeedsSignIn(true);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => {
        const pending = res.data?.account_status === "pending";
        const candidate = res.data?.role === "candidate";
        setNeedsSignIn(!candidate);
        if (candidate && !pending) {
          router.replace("/candidate/dashboard");
        }
      })
      .catch(() => setNeedsSignIn(true));
  }, [router]);

  const onSubmit = async (data: FormValues) => {
    setError("");
    const code = normalizeCode(data.code);
    if (needsSignIn && (!data.email || !data.password)) {
      const msg = "Enter the candidate email and password from signup, plus the invite code.";
      setError(msg);
      toast.error({ title: "Sign in required", description: msg });
      return;
    }
    try {
      const payload: { code: string; email?: string; password?: string } = { code };
      if (needsSignIn) {
        payload.email = data.email;
        payload.password = data.password;
      }
      const res = await api.post<AuthTokens>("/auth/activate", payload);
      setTokens(
        res.data.access_token,
        res.data.refresh_token,
        res.data.account_status,
      );
      toast.success({ title: "Account activated" });
      router.push("/candidate/dashboard");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = getApiErrorMessage(
        err,
        "Incorrect invite code. Contact admin for a valid code.",
      );
      if (status === 401) {
        setNeedsSignIn(true);
      }
      setError(msg);
      toast.error({ title: "Activation failed", description: msg });
    }
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_60%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-white/20 via-white/8 to-white/5 p-px shadow-[0_30px_80px_-24px_rgba(0,0,0,0.8)]">
        <div className="rounded-[1.7rem] bg-zinc-950/85 px-7 py-8 backdrop-blur-xl sm:px-9 sm:py-10">
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-white text-zinc-950 shadow-[0_0_32px_rgba(255,255,255,0.18)]">
              <KeyRound className="size-5" />
            </div>
            <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-400 uppercase">
              Invite access
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
              Activate your account
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-300">
              Enter the unused admin invite code to unlock premium features
              (job fetch, apply, Auto-Apply). Your email is already verified.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-center text-sm text-red-300">
                {error}
              </div>
            )}
            {needsSignIn && (
              <>
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-xs text-zinc-400">
                    Candidate email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="h-11 rounded-xl border-white/15 bg-white/[0.04] text-white"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-300">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-xs text-zinc-400">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="h-11 rounded-xl border-white/15 bg-white/[0.04] text-white"
                    {...register("password")}
                  />
                </div>
              </>
            )}
            <div className="space-y-2.5">
              <label
                htmlFor="code"
                className="block text-center text-[11px] font-medium tracking-[0.18em] text-zinc-400 uppercase"
              >
                Invite code
              </label>
              <Input
                id="code"
                placeholder="H7C2KL2O"
                autoComplete="off"
                spellCheck={false}
                className="h-12 rounded-2xl border-white/15 bg-white/[0.04] text-center text-lg font-medium tracking-[0.2em] text-white placeholder:text-zinc-600 focus-visible:border-white/40 focus-visible:ring-white/15 dark:bg-white/[0.04]"
                {...register("code", {
                  onChange: (event) => {
                    setValue("code", normalizeCode(event.target.value), {
                      shouldValidate: true,
                    });
                  },
                })}
              />
              {errors.code && (
                <p className="text-center text-xs text-red-300">
                  {errors.code.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-full text-sm font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Activating…" : "Activate account"}
            </Button>
            <div className="border-t border-white/10 pt-6">
              <AdminContactNote />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
