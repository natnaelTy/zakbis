"use client";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, invalidProps } from "@/components/request/item-fields";
import type { Payout } from "@/lib/account";

/** Telebirr or bank details; used by verification and by Account → Payout method. */
export function PayoutFields({ value, onChange, errors }: { value: Payout; onChange: (p: Payout) => void; errors: Partial<Record<string, string>> }) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p id="payout-method-label" className="text-base font-semibold">
          Get paid with
        </p>
        <ToggleGroup value={[value.method]} onValueChange={(v) => v[0] && onChange({ ...value, method: v[0] as Payout["method"] })} aria-labelledby="payout-method-label">
          {(["telebirr", "bank"] as const).map((m) => (
            <ToggleGroupItem key={m} value={m} variant="outline" className="h-auto rounded-full bg-card px-4 py-2 text-base font-medium aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground">
              {m === "telebirr" ? "Telebirr" : "Bank account"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {value.method === "bank" && (
        <Field id="bankName" label="Bank" error={errors.bankName}>
          <Input id="bankName" placeholder="Commercial Bank of Ethiopia" value={value.bank_name} onChange={(e) => onChange({ ...value, bank_name: e.target.value })} {...invalidProps(errors.bankName, "bankName")} />
        </Field>
      )}
      <Field id="accountName" label="Account holder's name" hint="Should match your passport name." error={errors.accountName}>
        <Input id="accountName" value={value.account_name} onChange={(e) => onChange({ ...value, account_name: e.target.value })} {...invalidProps(errors.accountName, "accountName")} />
      </Field>
      <Field id="accountNumber" label={value.method === "telebirr" ? "Telebirr number" : "Account number"} error={errors.accountNumber}>
        <Input id="accountNumber" inputMode="numeric" value={value.account_number} onChange={(e) => onChange({ ...value, account_number: e.target.value })} {...invalidProps(errors.accountNumber, "accountNumber")} />
      </Field>
    </section>
  );
}
