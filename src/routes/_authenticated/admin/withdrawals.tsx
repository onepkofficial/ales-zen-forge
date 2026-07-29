import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { reviewWithdrawal } from "@/lib/onepk.functions";
import { EmptyState } from "@/components/app-shell";
import { formatPKR, formatDate, methodLabel } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  head: () => ({
    meta: [
      { title: "Withdrawal approvals — ONEpk admin" },
      { name: "description", content: "Review and approve ONEpk wallet payout requests." },
      { property: "og:title", content: "Withdrawal approvals — ONEpk admin" },
      { property: "og:description", content: "Approve or decline ONEpk payout requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminWithdrawals,
});

function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const review = useServerFn(reviewWithdrawal);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profiles(full_name, username, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function act(id: string, action: "approved" | "declined") {
    setBusy(id);
    try {
      await review({ data: { withdrawalId: id, action, note: notes[id] || undefined } });
      toast.success(`Withdrawal ${action}`);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!rows || rows.length === 0) return <EmptyState message="No withdrawal requests." />;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const p = r.profiles as { full_name?: string; username?: string; phone?: string } | null;
        return (
          <div key={r.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {formatPKR(r.amount)} · {methodLabel(r.method)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p?.full_name ?? p?.username ?? "User"} · {r.account_name} · {r.account_number}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
              </div>
              <Badge
                variant={
                  r.status === "approved" ? "default" : r.status === "declined" ? "destructive" : "secondary"
                }
              >
                {r.status}
              </Badge>
            </div>
            {r.status === "pending" && (
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[200px] flex-1"
                  placeholder="Admin note (optional)"
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, "approved")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, "declined")}
                >
                  Decline
                </Button>
              </div>
            )}
            {r.admin_note && <p className="text-xs text-muted-foreground">Note: {r.admin_note}</p>}
          </div>
        );
      })}
    </div>
  );
}
