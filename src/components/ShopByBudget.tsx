import Link from "next/link";
import { DEFAULT_HOME_CONFIG, type BudgetCardConfig } from "@/lib/homepageConfig";

export default function ShopByBudget({
  eyebrow = DEFAULT_HOME_CONFIG.budgetsEyebrow,
  title = DEFAULT_HOME_CONFIG.budgetsTitle,
  budgets = DEFAULT_HOME_CONFIG.budgets,
}: {
  eyebrow?: string;
  title?: string;
  budgets?: BudgetCardConfig[];
}) {
  return (
    <section className="shell band-tight">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-700">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {budgets.map((b) => (
          <Link
            key={`${b.label}-${b.max ?? "premium"}`}
            href={typeof b.max === "number" ? `/products?maxPrice=${b.max}` : "/products?minPrice=50000"}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${b.tone} p-4 text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-5`}
          >
            <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10 blur-md transition-transform duration-500 group-hover:scale-150" />
            <span className="relative text-2xl sm:text-3xl">{b.emoji}</span>
            <p className="relative mt-3 text-sm font-black leading-tight sm:text-base">{b.label}</p>
            <p className="relative mt-1 text-[11px] font-semibold text-white/80">Shop now →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}