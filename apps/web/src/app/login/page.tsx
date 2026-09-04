"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { AuthLayout } from "@/components/landing/auth-layout";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

const inputCls =
  "w-full border border-white/15 bg-[#161616] px-4 py-3 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#007aff] focus:bg-[#1c1c1c] focus:outline-none focus:ring-1 focus:ring-[#007aff] transition-colors";

const labelCls =
  "mb-2 block font-mono text-xs uppercase tracking-wider text-neutral-300 font-medium";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess: () => {
            toast.success("Signed in successfully");
            router.push(redirectTo as Route);
          },
          onError: (ctx) => {
            const msg = ctx.error.message || ctx.error.statusText || "Failed to sign in";
            setError(msg);
            toast.error(msg);
            setLoading(false);
          },
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <>
      {/* Heading */}
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        Welcome back
      </h2>
      <p className="mt-1.5 text-sm text-neutral-400">
        Sign in to your Cartwright shopper & merchant dashboard.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@example.com"
            className={inputCls}
            disabled={loading}
          />
        </div>

        {/* Password */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className={labelCls} style={{ marginBottom: 0 }}>
              Password
            </label>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="••••••••"
            className={inputCls}
            disabled={loading}
          />
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="group relative flex w-full items-center justify-center py-3.5 text-xs font-semibold uppercase tracking-[0.1em] text-white transition shadow-md disabled:opacity-50 cursor-pointer"
        >
          <span className="relative z-[2]">{loading ? "Signing In..." : "Sign In"}</span>
          <span className="absolute inset-0 bg-[#007aff] transition group-hover:bg-[#0066d6]" />
        </button>

        {/* Link to signup */}
        <p className="text-center text-xs text-neutral-400">
          No account?{" "}
          <Link
            href="/signup"
            className="text-white font-medium underline underline-offset-2 transition hover:text-[#007aff]"
          >
            Create one free
          </Link>
        </p>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<div className="font-mono text-sm text-neutral-400">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}

