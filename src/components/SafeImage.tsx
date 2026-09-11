"use client";

import { useState } from "react";
import Image from "next/image";
import { canOptimizeImage } from "@/lib/imageHosts";

export default function SafeImage({
  src,
  alt,
  className = "",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority = false,
  fill = true,
  width,
  height,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Set false for intrinsic sizing (e.g. auto-width logos) instead of filling a positioned parent. */
  fill?: boolean;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;

  if (!showImg) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 dark:from-slate-800 dark:to-slate-700 dark:text-slate-400 ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="text-xl font-black tracking-tight text-blue-600/80 dark:text-blue-400/80">
          SMS
        </span>
        <span className="mt-1 px-2 text-center text-[10px] uppercase tracking-wide opacity-70">
          {alt || "Image"}
        </span>
      </div>
    );
  }

  // Sources the optimizer can't or shouldn't fetch (data:/blob:, or a host not
  // in NEXT_PUBLIC_IMAGE_HOSTS) still have to display. next/image would reject
  // them, so they go out as a plain <img> the browser fetches itself. Keeps the
  // same className/onError contract as the optimized branches below, so callers
  // don't need to know which path they got.
  if (!canOptimizeImage(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src as string}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onError={() => setFailed(true)}
        className={fill ? `h-full w-full ${className}` : className}
        width={fill ? undefined : (width ?? 200)}
        height={fill ? undefined : (height ?? 200)}
      />
    );
  }

  if (fill) {
    // className (sizing, object-fit, hover/blend effects) applies directly to
    // the image, matching prior <img className=...> behavior. The immediate
    // parent at each call site is already positioned/sized to contain it.
    return (
      <Image
        src={src as string}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <Image
      src={src as string}
      alt={alt}
      width={width ?? 200}
      height={height ?? 200}
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}