import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { ForgotPasswordForm } from "@/components/AuthForms";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a password reset link for your SMS Stores account.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <ForgotPasswordForm />
    </AppShell>
  );
}
