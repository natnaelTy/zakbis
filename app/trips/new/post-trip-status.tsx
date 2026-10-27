"use client";

import { useEffect, useState } from "react";
import { loadMyVerification, VerificationStatus, type Verification } from "@/components/traveler/verification-status";
import { addisToday } from "@/lib/open-requests";

/** Until Post a trip ships: the verification status, or a coming-soon note once verified. */
export function PostTripStatus() {
  const [v, setV] = useState<Verification | undefined>();
  useEffect(() => void loadMyVerification().then(setV), []);
  if (v === undefined) return null;
  if (v?.status === "approved" && v.passport_expiry >= addisToday(new Date()))
    return <p className="mt-2 text-base text-muted-foreground">Post a trip is coming soon.</p>;
  return (
    <div className="mt-4">
      <VerificationStatus verification={v} />
    </div>
  );
}
