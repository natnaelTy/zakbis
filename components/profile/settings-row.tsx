import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = { muted: "text-muted-foreground", good: "text-brand-text", bad: "text-destructive" } as const;

/** One Account row: icon, label, optional status, chevron. A link, or a button when onClick is given. */
export function SettingsRow({
  href,
  onClick,
  icon: Icon,
  label,
  status,
  tone = "muted",
  destructive = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  status?: string;
  tone?: keyof typeof tones;
  destructive?: boolean;
}) {
  const body = (
    <>
      <Icon aria-hidden className={cn("size-6 shrink-0", destructive ? "text-destructive" : "text-brand-text")} strokeWidth={1.75} />
      <span className={cn("flex-1 text-base", destructive && "font-semibold text-destructive")}>{label}</span>
      {status && <span className={cn("text-sm font-medium", tones[tone])}>{status}</span>}
      {!destructive && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
    </>
  );
  const className = "flex min-h-14 w-full items-center gap-4 border-b py-3 text-left transition-colors hover:bg-muted/50";
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <Link href={href!} className={className}>
      {body}
    </Link>
  );
}
