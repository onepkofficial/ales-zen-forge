import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/deposits", label: "Deposits" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/winners", label: "Winners" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/broadcast", label: "Broadcast" },
] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Admin portal</h1>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              pathname === t.to && "bg-muted text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </AppShell>
  );
}
