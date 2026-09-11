"use client";

import { useEffect, useState } from "react";
import Countdown from "@/components/Countdown";

/**
 * Countdown to the next midnight in Asia/Kolkata (the store's clock).
 * The target is computed in an effect on the client, so the server render
 * stays pure and there is no server/client clock mismatch to hydrate over.
 */
export default function IstMidnightCountdown() {
  const [endTime, setEndTime] = useState<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const next = new Date(ist);
    next.setHours(24, 0, 0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEndTime(Date.now() + (next.getTime() - ist.getTime()));
  }, []);

  if (endTime === null) return null;
  return <Countdown endTime={endTime} />;
}
