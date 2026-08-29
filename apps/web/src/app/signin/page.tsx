import { Suspense } from "react";
import SignInForm from "@/components/sign-in-form";

export const metadata = {
  title: "Sign In — Cartwright",
};

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
