import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { LoginForm } from "@/components/AuthForms";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to track orders, save products and check out faster.",
  alternates: { canonical: "/login" },
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <LoginForm />
    </AppShell>
  );
}
