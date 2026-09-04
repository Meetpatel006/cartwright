"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/landing/auth-layout";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

const inputCls =
  "w-full border border-white/15 bg-[#161616] px-4 py-3 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#007aff] focus:bg-[#1c1c1c] focus:outline-none focus:ring-1 focus:ring-[#007aff] transition-colors";

const labelCls =
  "mb-2 block font-mono text-xs uppercase tracking-wider text-neutral-300 font-medium";

function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Full name is required."); return; }
    if (!validateEmail(email)) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!agreed) { setError("You must agree to the terms."); return; }
    setError("");
    setLoading(true);

    try {
      await authClient.signUp.email(
        {
          email,
          password,
          name,
        },
        {
          onSuccess: () => {
            toast.success("Account created successfully");
            router.push("/dashboard");
          },
          onError: (ctx) => {
            const msg = ctx.error.message || ctx.error.statusText || "Failed to sign up";
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
        Get started with Cartwright
      </h2>
      <p className="mt-1.5 text-sm text-neutral-400">
        Start shopping with autonomous agents and tracking AI buyers.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
        {/* Full name */}
        <div>
          <label htmlFor="name" className={labelCls}>Full name</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="Jane Smith"
            className={inputCls}
            disabled={loading}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className={labelCls}>Email address</label>
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
          <label htmlFor="password" className={labelCls}>Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Min. 8 characters"
            className={inputCls}
            disabled={loading}
          />
        </div>

        {/* Confirm */}
        <div>
          <label htmlFor="confirm" className={labelCls}>Confirm password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(""); }}
            placeholder="••••••••"
            className={inputCls}
            disabled={loading}
          />
        </div>

        {/* Privacy checkbox */}
        <label className="flex cursor-pointer items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setError(""); }}
            className="mt-0.5 size-3.5 shrink-0 accent-[#007aff]"
            disabled={loading}
          />
          <span className="text-xs leading-relaxed text-neutral-400">
            I agree to the Terms of Service and Privacy Policy
          </span>
        </label>

        {/* Error */}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="group relative flex w-full items-center justify-center py-3.5 text-xs font-semibold uppercase tracking-[0.1em] text-white transition shadow-md disabled:opacity-50 cursor-pointer"
        >
          <span className="relative z-[2]">{loading ? "Creating Account..." : "Create Account"}</span>
          <span className="absolute inset-0 bg-[#007aff] transition group-hover:bg-[#0066d6]" />
        </button>

        {/* Link to login */}
        <p className="text-center text-xs text-neutral-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-white font-medium underline underline-offset-2 transition hover:text-[#007aff]"
          >
            Log in
          </Link>
        </p>
      </form>
    </>
  );
}

export default function SignUpPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<div className="font-mono text-sm text-neutral-400">Loading...</div>}>
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  );
}

