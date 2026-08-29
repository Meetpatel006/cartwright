import { Suspense } from "react";
import SignUpForm from "@/components/sign-up-form";

export const metadata = {
  title: "Sign Up — Cartwright",
};

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
