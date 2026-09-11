"use client";

import SafeImage from "@/components/SafeImage";

/**
 * The fixed-size image frame every repair card uses.
 *
 * Its whole job is making cards line up when the source images don't. Brand
 * logos arrive as wide wordmarks (NOKIA) and square glyphs (Apple); phone
 * renders are tall portraits; service photos are landscape. Left alone, each
 * card would size itself to its own image and the grid would look ragged.
 *
 * So the frame owns the height and `object-contain` letterboxes whatever lands
 * in it. Nothing is ever cropped or stretched — a distorted brand logo reads as
 * a broken site, and `object-cover` would slice the ends off a wordmark.
 *
 * `SafeImage` underneath already handles the missing-image fallback, lazy
 * loading, and hosts the Next optimizer can't fetch, so this does not
 * re-implement any of that.
 */
export default function CardImage({
  src,
  alt,
  /** Tailwind height classes for the frame, e.g. "h-16 sm:h-20". */
  heightClass,
  /** Optional plate colour behind the image (brand cards use the brand tint). */
  bgColor,
  padded = true,
  priority = false,
  sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 160px",
  className = "",
}: {
  src?: string | null;
  alt: string;
  heightClass: string;
  bgColor?: string;
  padded?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${heightClass} ${padded ? "p-2" : ""} ${className}`}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      <SafeImage
        src={src || undefined}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain"
      />
    </div>
  );
}
