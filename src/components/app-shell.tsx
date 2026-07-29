import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Home,
  Wallet,
  Trophy,
  User,
  Bell,
  Shield,
  LogOut,
  Users,
  LifeBuoy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useProfile } from "@/hooks/use-onepk";
import { formatPKR } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CompleteProfileDialog } from "@/components/complete-profile-dialog";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/winners", label: "Winners", icon: Trophy },
  { to: "/referrals", label: "Refer", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Real-time toast for admins when a new deposit request arrives.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-deposits")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deposits" },
        (payload) => {
          const amount = (payload.new as { amount?: number })?.amount;
          toast.info("New deposit request", {
            description: `${formatPKR(amount ?? 0)} is awaiting verification.`,
          });
          queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              1
            </span>
            <span className="text-base font-bold tracking-tight">ONEpk</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  pathname === item.to && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/support"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname === "/support" && "bg-muted text-foreground",
              )}
            >
              Support
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  pathname.startsWith("/admin") && "bg-muted text-foreground",
                )}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/deposit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold tabular-nums"
            >
              {formatPKR(profile?.wallet_balance ?? 0)}
            </Link>
            <Link
              to="/support"
              aria-label="Support"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <LifeBuoy className="h-4 w-4" />
            </Link>
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                aria-label="Admin portal"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              >
                <Shield className="h-4 w-4" />
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

      <CompleteProfileDialog profile={profile ?? null} />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
        <div className="mx-auto flex max-w-5xl">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
