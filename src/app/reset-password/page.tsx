import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { ResetPasswordForm } from "@/components/AuthForms";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your SMS Stores account.",
  alternates: { canonical: "/reset-password" },
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <ResetPasswordForm />
    </AppShell>
  );
}
