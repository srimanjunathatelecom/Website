import AdminLogin from "@/components/AdminLogin";

export const dynamic = "force-dynamic";

export const metadata = {
  // Just "Sign in" - the layout's template appends "· SMS Stores Admin", and
  // the old "Admin Console · Sign in" read as "Admin Console · Sign in · SMS
  // Stores Admin" once that was in place.
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLogin />;
}
