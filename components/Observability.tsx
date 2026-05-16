"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

function scheduleObservabilityLoad(callback: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 1);
  return () => globalThis.clearTimeout(id);
}

export function Observability() {
  const [observability, setObservability] = useState<ReactNode>(null);

  useEffect(() => {
    let active = true;

    const cancelLoad = scheduleObservabilityLoad(() => {
      void Promise.all([import("@vercel/analytics/react"), import("@vercel/speed-insights/next")]).then(([analyticsModule, speedInsightsModule]) => {
        if (!active) return;

        const Analytics = analyticsModule.Analytics;
        const SpeedInsights = speedInsightsModule.SpeedInsights;
        setObservability(
          <>
            <Analytics />
            <SpeedInsights />
          </>,
        );
      });
    });

    return () => {
      active = false;
      cancelLoad();
    };
  }, []);

  return observability;
}
