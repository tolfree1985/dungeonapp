"use client";

import { useEffect, useState } from "react";
import type { LandingIdleStep } from "./deriveLandingIdleState";

const STEP_INTERVAL_MS = 7000;

export function useLandingIdleStep(): LandingIdleStep {
  const [step, setStep] = useState<LandingIdleStep>(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((current) => (current < 3 ? ((current + 1) as LandingIdleStep) : current));
    }, STEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  return step;
}
