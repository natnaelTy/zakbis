import { tripStatusLabel, type TripStatus } from "@/lib/trip-post";
import { cn } from "@/lib/utils";

const tones = { muted: "bg-muted text-muted-foreground", good: "bg-accent text-brand-text", bad: "bg-destructive/10 text-destructive" } as const;

export function StatusPill({ status }: { status: TripStatus }) {
  const { text, tone } = tripStatusLabel(status);
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold", tones[tone])}>{text}</span>;
}
