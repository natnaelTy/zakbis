"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProfileEditFormProps {
  initialName: string;
  initialPhone: string | null;
  onSaved?: () => void;
}

export function ProfileEditForm({ initialName, initialPhone, onSaved }: ProfileEditFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (success) {
      const timeout = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [success]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName.trim(), phone: phone.trim() }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Failed to save changes");
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    setSuccess(true);
    router.refresh();
    onSaved?.();
  }

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        className="h-8 rounded-lg border-black/10 text-xs font-medium"
      >
        <Pencil size={12} />
        Edit Profile
      </Button>
    );
  }

  return (
    <Card className="border border-black/5 shadow-none rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          Edit Profile
          <button
            onClick={() => {
              setEditing(false);
              setFullName(initialName);
              setPhone(initialPhone ?? "");
              setError(null);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Full name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Phone</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            className="h-10 rounded-xl"
          />
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !fullName.trim()}
          className="w-full h-10 rounded-xl bg-black text-white hover:bg-black/80"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
