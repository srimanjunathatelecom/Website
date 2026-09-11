import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";

/**
 * The chrome for the whole repair funnel, hoisted out of the three pages.
 *
 * Each of `/repair`, `/repair/[brand]` and `/repair/[brand]/[model]` used to
 * render `<AppShell>` itself. That cost the funnel twice over:
 *
 *  1. The shell's database reads were repeated on every step. Walking
 *     brand -> model -> service meant fetching the same store settings, the same
 *     outlets, the same categories and the same four config rows three times.
 *     A layout is preserved across navigations inside its segment, so those
 *     reads now happen once for the entire funnel and not at all on the two
 *     steps that follow.
 *
 *  2. More importantly, it made a loading state impossible to show without
 *     losing the header. A `loading.tsx` substitutes for the content *below* the
 *     nearest layout; with the shell living inside each page, any skeleton would
 *     have replaced the header and footer too, and the visitor would have
 *     watched the entire site chrome disappear and reappear on every click.
 *     With the shell in the layout, the header and footer stay painted and only
 *     the grid swaps for a skeleton — which is the whole point.
 *
 * The pages below now render a plain wrapper instead of a second `<main>`;
 * AppShell already provides the real one, and the two were nested.
 */
export default function RepairLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
