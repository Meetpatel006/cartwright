"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const searchParams = useSearchParams();
  // Only allow same-app relative paths as redirect targets.
  const rawRedirect = searchParams.get("redirect") ?? "";
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/dashboard";

  const [showSignIn, setShowSignIn] = useState(false);

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} redirectTo={redirectTo} />
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} redirectTo={redirectTo} />
  );
}
