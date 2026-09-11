"use client";

import CardImage from "./CardImage";
import SelectionCard from "./SelectionCard";
import { deviceLabel, GENERIC_DEVICE_IMAGE, type RepairModel } from "@/lib/repair/types";

/**
 * One device in the Select Model grid: phone render on top, name beneath.
 *
 * The name gets two lines. It used to be a single truncated line, on the
 * reasoning that the full name was still reachable from the card's `title`
 * tooltip — but a tooltip needs a hover, and most people choose their phone on a
 * phone, where hover does not exist. That left the step that matters most in the
 * whole flow, "which of these is my exact handset", showing "Galaxy S23 Ult…"
 * with no way to see the rest. Model names differ precisely at the end (Ultra vs
 * Plus, 4G vs 5G), so the truncated part was the part that identifies the phone,
 * and picking the wrong one means turning up at the counter for the wrong repair.
 *
 * Two lines is enough for effectively every real model name. `min-h` reserves
 * both lines whether or not the second is used, which keeps the row heights even
 * — the original reason for truncating — without hiding anything.
 */
export default function ModelCard({
  model,
  href,
  onClick,
  selected = false,
  priority = false,
}: {
  model: RepairModel;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  priority?: boolean;
}) {
  return (
    <SelectionCard
      href={href}
      onClick={onClick}
      selected={selected}
      title={model.name}
      ariaLabel={`${deviceLabel(model.brandName, model.name)} — choose a repair service`}
    >
      <CardImage
        // Falls back to one shared handset outline rather than to SafeImage's
        // generic "no image" tile. A model without its render uploaded yet is
        // the normal state of a 150-model catalogue, so it should look
        // deliberately unfilled, not broken — and a consistent silhouette keeps
        // the grid's rhythm while the owner works through the uploads.
        src={model.image || GENERIC_DEVICE_IMAGE}
        alt={model.imageAlt}
        heightClass="h-[92px] sm:h-[104px]"
        priority={priority}
        sizes="(max-width: 640px) 42vw, (max-width: 1024px) 20vw, 150px"
        className="grid place-items-center pt-3"
      />
      <span className="line-clamp-2 block min-h-[2.15rem] px-2 pb-3 pt-2 text-center text-[12.5px] font-semibold leading-snug text-blue-700 group-hover:text-blue-800 dark:text-blue-300 dark:group-hover:text-blue-200">
        {model.name}
      </span>
    </SelectionCard>
  );
}
