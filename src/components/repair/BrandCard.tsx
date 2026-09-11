"use client";

import CardImage from "./CardImage";
import SelectionCard from "./SelectionCard";
import type { RepairBrand } from "@/lib/repair/types";

/**
 * One brand in the Select Brand grid.
 *
 * The logo stands alone, with no caption, exactly as in the reference. A brand
 * logo is already its own label, so printing "SAMSUNG" under the Samsung
 * wordmark only costs a row of height.
 *
 * An earlier version captioned the brands whose logo is a bare glyph rather
 * than a wordmark (Apple, Google, LG, Asus). It read as an improvement in the
 * abstract and was clearly worse on screen: only four of twenty cards grew the
 * extra text row, so those four became taller than the rest and every grid row
 * containing one sat ragged against the others. Uniform cards matter more here
 * than labelling the four glyphs, and the name is still carried for anyone who
 * needs it — as the image's alt text, the card's aria-label, and the native
 * tooltip on hover.
 */
export default function BrandCard({
  brand,
  href,
  onClick,
  selected = false,
  priority = false,
}: {
  brand: RepairBrand;
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
      title={brand.name}
      ariaLabel={`${brand.name} — choose your model`}
    >
      <CardImage
        src={brand.image}
        alt={brand.imageAlt}
        // Squarer than it looks: at 9 columns the card is ~130px wide, so a
        // 74px frame plus padding lands on the reference's wide-ish plate.
        heightClass="h-[64px] sm:h-[74px]"
        priority={priority}
        sizes="(max-width: 640px) 40vw, (max-width: 1024px) 18vw, 130px"
        className="grid place-items-center px-3"
      />
    </SelectionCard>
  );
}
