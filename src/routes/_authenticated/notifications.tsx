import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — ONEpk" },
      {
        name: "description",
        content: "Deposit approvals, entry confirmations, winner announcements and ONEpk platform alerts.",
      },
      { property: "og:title", content: "Notifications — ONEpk" },
      { property: "og:description", content: "Your ONEpk alerts and announcements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  async function markAllRead() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", auth.user.id).eq("read", false);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Notifications</h1>
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
        {!items || items.length === 0 ? (
          <EmptyState message="No notifications yet." />
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border border-border bg-card p-4 ${n.read ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
