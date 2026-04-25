"use client";
import { toast } from "sonner";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, Package, Plane, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";


type Role = "SENDER" | "TRAVELER" | "RECEIVER";

const roles: { value: Role; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: "SENDER",
    label: "Sender",
    description: "I want to send packages",
    icon: Package,
  },
  {
    value: "TRAVELER",
    label: "Traveler",
    description: "I travel and carry items",
    icon: Plane,
  },
  {
    value: "RECEIVER",
    label: "Receiver",
    description: "I receive packages",
    icon: Users,
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("SENDER");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters"); toast.error("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        password,
        role,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Signup failed"); toast.error(payload?.error ?? "Signup failed");
      setLoading(false);
      return;
    }

    router.push("/auth/login");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  }

  return (

    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-black/5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">Z</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-black">Zakbis</span>
        </Link>
        <Link
          href="/auth/login"
          className="text-sm font-medium text-slate-600 hover:text-black transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Form */}
      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-96">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-black" : "bg-slate-200"}`} />
            <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-black" : "bg-slate-200"}`} />
          </div>

          {step === 1 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-black mb-2">Create account</h1>
                <p className="text-slate-500 text-sm">Join the Zakbis logistics network</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fullName && email && password.length >= 6) {
                    setStep(2);
                    setError(null);
                  }
                }}
                className="space-y-4"
              >
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-black" htmlFor="fullName">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Abebe Girma"
                    className="w-full h-11 px-4 rounded-xl border border-black/10 bg-slate-50 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-black" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 px-4 rounded-xl border border-black/10 bg-slate-50 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-black" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full h-11 px-4 pr-11 rounded-xl border border-black/10 bg-slate-50 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full h-11 bg-brand-green text-white shadow-sm ring-1 ring-black/5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-greenLight transition-colors transition-colors mt-2"
                >
                  Continue <ArrowRight size={16} />
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-black/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-slate-500">Or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full h-11 rounded-xl bg-white border border-black/10 text-black shadow-sm text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google
                </button>
              </form>

            </>
          )}

          {step === 2 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-black mb-2">I am a…</h1>
                <p className="text-slate-500 text-sm">Choose your primary role on Zakbis</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                {/* Role selector */}
                <div className="grid grid-cols-1 gap-3">
                  {roles.map(({ value, label, description, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={`w-full flex items-center gap-5 p-6 rounded-2xl border-2 text-left transition-all ${
                        role === value
                          ? "border-black bg-brand-green text-white shadow-sm ring-1 ring-black/5 shadow-lg"
                          : "border-black/10 bg-slate-50 text-black hover:border-black/30 hover:shadow-md"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          role === value ? "bg-white/10" : "bg-black/5"
                        }`}
                      >
                        <Icon size={20} className={role === value ? "text-white" : "text-black"} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{label}</div>
                        <div className={`text-xs mt-0.5 ${role === value ? "text-white/70" : "text-slate-500"}`}>
                          {description}
                        </div>
                      </div>
                      <div
                        className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          role === value ? "border-white bg-white" : "border-black/20"
                        }`}
                      >
                        {role === value && <div className="w-2.5 h-2.5 rounded-full bg-brand-green" />}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 h-11 border border-black/10 text-black rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-11 bg-brand-green text-white shadow-sm ring-1 ring-black/5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-greenLight transition-colors transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Join Zakbis <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold text-black hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}