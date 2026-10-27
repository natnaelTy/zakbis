"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMyVerification, VerificationStatus, type Verification } from "@/components/traveler/verification-status";
import { TripForm } from "@/components/trips/trip-form";
import { verificationState } from "@/lib/account";
import { addisToday } from "@/lib/open-requests";
import { postGate } from "@/lib/trip-post";

/** Only travelers with approved verification and a valid passport get the form; everyone else sees their status. */
export function PostTripStatus() {
  const [v, setV] = useState<Verification | undefined>();
  const router = useRouter();
  useEffect(() => void loadMyVerification().then(setV), []);
  if (v === undefined) return null;
  if (postGate(verificationState(v, addisToday(new Date()))) === "form") return <TripForm onDone={(id) => router.push(`/orders/trips/${id}`)} />;
  return (
    <div className="mt-4">
      <VerificationStatus verification={v} />
    </div>
  );
}
