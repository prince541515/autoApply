"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import api, { getApiErrorMessage } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import type { AuthTokens } from "@/types";
import { toast } from "@/components/ui/toast";

const schema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError("");
    try {
      await api.post("/auth/register", {
        email: data.email,
        password: data.password,
      });
      setEmail(data.email.trim().toLowerCase());
      setStep("otp");
      toast.success({
        title: "Check your email",
        description: "We sent a 6-digit verification code.",
      });
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Registration failed. Please try again.");
      setError(msg);
      toast.error({ title: "Sign up failed", description: msg });
    }
  };

  const onVerify = async () => {
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      const res = await api.post<AuthTokens>("/auth/verify-email", {
        email,
        code,
      });
      setTokens(
        res.data.access_token,
        res.data.refresh_token,
        res.data.account_status,
      );
      toast.success({
        title: "Account created",
        description: "Ask admin for an invite code to unlock premium features.",
      });
      router.push("/candidate/home");
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Incorrect verification code.");
      setError(msg);
      toast.error({ title: "Verification failed", description: msg });
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    setError("");
    try {
      await api.post("/auth/resend-otp", { email });
      toast.success({ title: "Code sent", description: "Check your inbox again." });
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Could not resend the code.");
      setError(msg);
      toast.error({ title: "Resend failed", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/60 shadow-xl shadow-black/10">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {step === "details" ? "Create an account" : "Verify your email"}
        </CardTitle>
        <CardDescription>
          {step === "details"
            ? "We’ll email a 6-digit code. Your account is created in AutoApply immediately; an admin invite later unlocks Premium."
            : `Enter the 6-digit code sent to ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "details" ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending code…" : "Send verification code"}
            </Button>

            <p className="text-center text-sm text-zinc-300">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-white hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="otp">6-digit code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 text-center text-2xl tracking-[0.4em]"
              />
            </div>
            <Button className="w-full" onClick={onVerify} disabled={verifying}>
              {verifying ? "Verifying…" : "Create account"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-zinc-300 underline-offset-4 hover:underline"
              onClick={onResend}
              disabled={resending}
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
            <button
              type="button"
              className="w-full text-center text-xs text-zinc-500"
              onClick={() => {
                setStep("details");
                setOtp("");
                setError("");
              }}
            >
              Use a different email
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
