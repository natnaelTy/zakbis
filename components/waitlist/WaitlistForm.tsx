"use client";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";

const SUCCESS_TEXT = "Thanks — we'll be in touch with details.";

interface Props {
  onSuccess?: () => void;
  compact?: boolean;
}

export default function WaitlistForm({ onSuccess, compact = false }: Props) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailSchema = z.string().email({ message: "Please enter a valid email address" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      setError(null);

      // Call server API to create traveler and store email
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Failed to register");
        toast.error(payload?.error ?? "Failed to register");
        return;
      }

      toast.success("You're on the waitlist — we'll be in touch.");
      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors?.[0]?.message ?? "Invalid email");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid email");
      }
      return;
    }
  }

  if (submitted) {
    return (
      <div className="text-center p-6 bg-emerald-50 border border-emerald-200 rounded-xl max-w-md mx-auto">
        <div className="text-3xl mb-3">✈️</div>
        <p className="font-serif text-lg font-semibold text-emerald-700 mb-2">
          You&apos;re on the list.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed">{SUCCESS_TEXT}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {/* role removed */}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* name removed */}
        <div>
          <InputGroup className="h-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
            <InputGroupInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              autoComplete="email"
              aria-invalid={!!error}
              className="px-4 py-3.5 "
            />
            <InputGroupAddon align="inline-end">
              <Button type="submit">Join the waitlist</Button>
            </InputGroupAddon>
          </InputGroup>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <p className="text-xs text-gray-400 text-center">Free to join. No spam. Ever.</p>
      </form>
    </div>
  );
}
