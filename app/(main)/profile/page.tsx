import { toast } from "sonner";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  Loader2,
  User,
  ShieldCheck,
  Star,
  Phone,
  CalendarClock,
  Plane,
  Package,
  ShoppingBag,
  MessageCircle,
  ChevronRight,
  ChevronDown,
  Settings,
  Bell,
} from "lucide-react";
import { MenuLogoutItem } from "@/components/app/menu-logout-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProfileEditForm } from "@/components/app/profile-edit-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: "SENDER" | "TRAVELER" | "RECEIVER";
  rating: number | null;
  verified: boolean | null;
  phone: string | null;
  created_at: string;
};

type TripRow = {
  id: string;
  departure_city: string;
  destination_city: string;
  departure_date: string;
  status: string;
};

type DeliveryRow = {
  id: string;
  pickup_city: string;
  dropoff_city: string;
  status: string;
  created_at: string;
};

function roleDescription(role: Profile["role"]) {
  if (role === "TRAVELER") return "You can list trips and carry deliveries.";
  if (role === "RECEIVER") return "You can receive deliveries and create Buy Me requests.";
  return "You can send packages and find travelers.";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

export default async function ProfilePage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const cookie = headerStore.get("cookie") ?? "";

  if (!host) redirect("/auth/login");

  const response = await fetch(`${protocol}://${host}/api/profile/summary`, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });

  if (!response.ok) redirect("/auth/login");

  const payload = await response.json();
  const profile = payload?.data?.profile as Profile | undefined;
  const chatCount = Number(payload?.data?.chatCount ?? 0);
  const tripCount = Number(payload?.data?.tripCount ?? 0);
  const sentCount = Number(payload?.data?.sentCount ?? 0);
  const receivedCount = Number(payload?.data?.receivedCount ?? 0);
  const buyMeReceiverCount = Number(payload?.data?.buyMeReceiverCount ?? 0);
  const buyMeTravelerCount = Number(payload?.data?.buyMeTravelerCount ?? 0);
  const recentTrips = (payload?.data?.recentTrips as TripRow[] | undefined) ?? [];
  const recentDeliveries = (payload?.data?.recentDeliveries as DeliveryRow[] | undefined) ?? [];

  if (!profile) redirect("/auth/login");

  const rating = Number(profile.rating ?? 0);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-4">
      <Card className="border border-black/5 shadow-sm bg-slate-50 hover:shadow-md transition-all duration-300 rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-full bg-brand-green text-white shadow-sm ring-1 ring-black/5 flex items-center justify-center text-lg font-bold shrink-0">
                {initials(profile.full_name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-black truncate">{profile.full_name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="dark" className="rounded-full text-[10px] px-2 py-0.5">
                    {profile.role}
                  </Badge>
                  {profile.verified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                      <ShieldCheck size={13} className="text-black" />
                      Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="w-9 h-9 rounded-xl overflow-hidden border-black/10">
                    <div className="w-full h-full bg-brand-green text-white shadow-sm ring-1 ring-black/5 flex items-center justify-center text-sm font-bold relative">
                      {initials(profile.full_name)}
                      <ChevronDown size={12} className="absolute bottom-1 right-1 text-black" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <User size={16} />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings size={16} />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <MenuLogoutItem />
                    </DropdownMenuGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3">{roleDescription(profile.role)}</p>

          <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Star size={13} className="text-black" />
              {rating > 0 ? rating.toFixed(1) : "New profile"}
            </span>
            {profile.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={13} className="text-black" />
                {profile.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={13} className="text-black" />
              Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <ProfileEditForm
        initialName={profile.full_name}
        initialPhone={profile.phone}
      />

      <Card className="border border-black/5 shadow-sm bg-slate-50 hover:shadow-md transition-all duration-300 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 grid grid-cols-2 gap-3">
          {profile.role === "TRAVELER" ? (
            <>
              <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
                <div className="text-xl font-bold text-black">{tripCount ?? 0}</div>
                <div className="text-xs text-slate-500">Trips listed</div>
              </div>
              <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
                <div className="text-xl font-bold text-black">{buyMeTravelerCount ?? 0}</div>
                <div className="text-xs text-slate-500">Buy Me accepted</div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
                <div className="text-xl font-bold text-black">{sentCount ?? 0}</div>
                <div className="text-xs text-slate-500">Requests sent</div>
              </div>
              <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
                <div className="text-xl font-bold text-black">{receivedCount ?? 0}</div>
                <div className="text-xs text-slate-500">Requests received</div>
              </div>
            </>
          )}

          <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
            <div className="text-xl font-bold text-black">{buyMeReceiverCount ?? 0}</div>
            <div className="text-xs text-slate-500">Buy Me posts</div>
          </div>
          <div className="rounded-xl border border-black/10 p-3 bg-slate-50">
            <div className="text-xl font-bold text-black">{chatCount ?? 0}</div>
            <div className="text-xs text-slate-500">Active chats</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-black/5 shadow-sm bg-slate-50 hover:shadow-md transition-all duration-300 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {profile.role === "TRAVELER" ? (
            <Link href="/traveler/flight-entry" className="flex items-center justify-between py-2 text-sm text-black">
              <span className="inline-flex items-center gap-2"><Plane size={16} /> List a trip</span>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          ) : (
            <Link href="/triangular/search" className="flex items-center justify-between py-2 text-sm text-black">
              <span className="inline-flex items-center gap-2"><Package size={16} /> Find a traveler</span>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          )}
          <Separator />
          <Link href="/buy-me" className="flex items-center justify-between py-2 text-sm text-black">
            <span className="inline-flex items-center gap-2"><ShoppingBag size={16} /> Buy Me Hub</span>
            <ChevronRight size={16} className="text-slate-400" />
          </Link>
          <Separator />
          <Link href="/chat" className="flex items-center justify-between py-2 text-sm text-black">
            <span className="inline-flex items-center gap-2"><MessageCircle size={16} /> Open chats</span>
            <ChevronRight size={16} className="text-slate-400" />
          </Link>
        </CardContent>
      </Card>

      <Card className="border border-black/5 shadow-sm bg-slate-50 hover:shadow-md transition-all duration-300 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {profile.role === "TRAVELER" ? (
            (recentTrips?.length ?? 0) > 0 ? (
              recentTrips!.map((trip) => (
                <div key={trip.id} className="rounded-xl border border-black/10 p-3">
                  <p className="text-sm font-medium text-black">{trip.departure_city} → {trip.destination_city}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {trip.status}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No trips yet.</p>
            )
          ) : (
            (recentDeliveries?.length ?? 0) > 0 ? (
              recentDeliveries!.map((request) => (
                <div key={request.id} className="rounded-xl border border-black/10 p-3">
                  <p className="text-sm font-medium text-black">{request.pickup_city} → {request.dropoff_city}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(request.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {request.status}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No delivery activity yet.</p>
            )
          )}
        </CardContent>
      </Card>

      <Card className="border border-black/5 shadow-sm bg-slate-50 hover:shadow-md transition-all duration-300 rounded-2xl">
        <CardContent className="p-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:opacity-70 transition-opacity">
            <User size={15} />
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
