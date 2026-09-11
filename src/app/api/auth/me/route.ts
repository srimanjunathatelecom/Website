import { getCurrentCustomer, getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  const admin = await getCurrentAdmin();
  return Response.json({
    customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
    admin: admin ? { id: admin.id, name: admin.name, email: admin.email, role: admin.role } : null,
  });
}
