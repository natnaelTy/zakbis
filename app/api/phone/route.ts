import { NextResponse } from "next/server";
import { smsMode } from "@/lib/sms";

export const dynamic = "force-dynamic";

/** Whether the phone check can send codes yet (AfroMessage set up, or test mode). */
export function GET() {
  return NextResponse.json({ available: smsMode(process.env) !== "off" });
}
