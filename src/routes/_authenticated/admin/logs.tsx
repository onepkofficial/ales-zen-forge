import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app-shell";
import { formatDate } from "@/lib/onepk";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({
    meta: [
      { title: "Audit logs — ONEpk admin" },
      { name: "description", content: "Full audit trail of ONEpk admin actions on payouts, promos and tickets." },
      { property: "og:title", content: "Audit logs — ONEpk admin" },
      { property: "og:description", content: "Audit trail of every ONEpk admin action." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLogs,
});

function AdminLogs() {
  const { data: logs } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_logs")
        .select("*, profiles(full_name, username)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  if (!logs || logs.length === 0) return <EmptyState message="No admin activity recorded yet." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Admin</th>
            <th className="px-4 py-2 font-medium">Action</th>
            <th className="px-4 py-2 font-medium">Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => {
            const p = l.profiles as { full_name?: string; username?: string } | null;
            return (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(l.created_at)}</td>
                <td className="px-4 py-2">{p?.full_name ?? p?.username ?? "—"}</td>
                <td className="px-4 py-2 font-medium">{l.action}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {l.target_type ?? "—"} {l.target_id ? `· ${String(l.target_id).slice(0, 8)}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
