import type { Side } from "@/lib/sides";
import { cn } from "@/lib/utils";

const options = [
  { side: "receiver", label: "Receiving" },
  { side: "traveler", label: "Traveling" },
] as const;

/** Receiving | Traveling. Tapping the other side asks the parent to switch (it runs the guards). */
export function SideToggle({ side, onPick, busy }: { side: Side | null; onPick: (s: Side) => void; busy: boolean }) {
  return (
    <div role="group" aria-label="Use Zakbis as" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.side}
          type="button"
          aria-pressed={side === o.side}
          disabled={busy}
          onClick={() => side !== o.side && onPick(o.side)}
          className={cn(
            "h-11 rounded-lg text-base font-semibold transition-colors",
            side === o.side ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
