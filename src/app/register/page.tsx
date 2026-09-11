import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { RegisterForm } from "@/components/AuthForms";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an Account",
  description: "Create an account to track orders and save your favourites.",
  alternates: { canonical: "/register" },
};

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <RegisterForm />
    </AppShell>
  );
}
