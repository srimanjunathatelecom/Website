"use client";

import Image from "next/image";
import { canOptimizeImage } from "@/lib/imageHosts";

/**
 * A fill-positioned image that picks next/image or a plain <img> based on
 * whether the optimizer is actually allowed to fetch the source.
 *
 * Exists because the header logo, footer logo and search-suggestion thumbnails
 * are all admin-supplied URLs rendered with `fill` inside an already-positioned
 * parent. Since the optimizer is now limited to NEXT_PUBLIC_IMAGE_HOSTS, handing
 * it an off-allowlist host would produce a broken image where there used to be a
 * logo — a bad trade for a bandwidth optimization.
 *
 * Deliberately has no placeholder fallback, unlike SafeImage. Every caller
 * already guards on the URL being present and renders its own branded mark when
 * it isn't, and dropping SafeImage's "SMS" gradient box into a 40px search
 * thumbnail would be a visual regression. This component's only job is choosing
 * the element.
 */
export default function AutoImage({
  src,
  alt,
  sizes,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (!canOptimizeImage(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        // `fill` on next/image is absolute inset-0; this matches it so the
        // surrounding layout behaves the same on either branch.
        className={`absolute inset-0 h-full w-full ${className}`}
      />
    );
  }

  return <Image src={src} alt={alt} fill sizes={sizes} className={className} priority={priority} />;
}
