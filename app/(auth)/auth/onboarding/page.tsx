"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Package, Plane, User } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const roles = [
    {
      id: "SENDER",
      title: "Sender",
      description: "I want to send packages to Ethiopia",
      icon: Package,
      color: "bg-blue-50 text-blue-600",
    },
    {
      id: "TRAVELER",
      title: "Traveler",
      description: "I'm traveling and can carry items",
      icon: Plane,
      color: "bg-green-50 text-green-600",
    },
    {
      id: "RECEIVER",
      title: "Receiver",
      description: "I'm receiving items in Ethiopia",
      icon: User,
      color: "bg-purple-50 text-purple-600",
    },
  ];

  async function handleCompleteOnboarding() {
    if (!selectedRole) {
      toast.error("Please select a role to continue");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      data: { role: selectedRole },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Profile setup complete!");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-xl mx-auto py-12 px-4">
      <div className="bg-white rounded-3xl border border-black/10 p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Welcome to Zakbis</h1>
          <p className="text-slate-500">How would you like to use the platform?</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={`relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all text-center ${
                selectedRole === role.id
                  ? "border-brand-green bg-brand-green/5 ring-1 ring-brand-green"
                  : "border-black/5 hover:border-black/10 bg-white"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${role.color}`}>
                <role.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-black mb-1">{role.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{role.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-10">
          <button
            onClick={handleCompleteOnboarding}
            disabled={loading || !selectedRole}
            className="w-full h-12 rounded-xl bg-brand-green text-white font-bold hover:bg-brand-greenLight transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-brand-green/20"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
