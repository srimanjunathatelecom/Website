export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function discountPercent(mrp: number | string, mop: number | string): number {
  const m = typeof mrp === "string" ? parseFloat(mrp) : mrp;
  const p = typeof mop === "string" ? parseFloat(mop) : mop;
  if (!m || m <= 0) return 0;
  const d = Math.round(((m - p) / m) * 100);
  return Math.max(0, d);
}

export function youSave(mrp: number | string, mop: number | string): number {
  const m = typeof mrp === "string" ? parseFloat(mrp) : mrp;
  const p = typeof mop === "string" ? parseFloat(mop) : mop;
  return Math.max(0, (isNaN(m) ? 0 : m) - (isNaN(p) ? 0 : p));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stockStatus(stock: number, threshold: number): {
  label: string;
  tone: "in" | "low" | "out";
} {
  if (stock <= 0) return { label: "Out of Stock", tone: "out" };
  if (stock <= threshold) return { label: "Low Stock", tone: "low" };
  return { label: "In Stock", tone: "in" };
}

export function orderTimeline(status: string): { label: string; key: string }[] {
  const steps = [
    { key: "Placed", label: "Order Placed" },
    { key: "Packed", label: "Packed" },
    { key: "Shipped", label: "Shipped" },
    { key: "Out for Delivery", label: "Out for Delivery" },
    { key: "Delivered", label: "Delivered" },
  ];
  const idx = steps.findIndex((s) => s.key === status);
  return steps.map((s, i) => ({ ...s, done: i <= idx || status === "Delivered" }));
}

export function bookingTimeline(status: string): { label: string; key: string }[] {
  const steps = [
    { key: "Booked", label: "Booked" },
    { key: "In Progress", label: "In Progress" },
    { key: "Ready", label: "Ready" },
    { key: "Delivered", label: "Delivered" },
  ];
  const idx = steps.findIndex((s) => s.key === status);
  return steps.map((s, i) => ({ ...s, done: i <= idx || status === "Delivered" }));
}
