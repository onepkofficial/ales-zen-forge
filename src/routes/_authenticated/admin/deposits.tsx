import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app-shell";
import { reviewDeposit } from "@/lib/onepk.functions";
import { formatPKR, formatDate, methodLabel, downloadCsv } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  head: () => ({
    meta: [
      { title: "Deposit requests — ONEpk admin" },
      { name: "description", content: "Review, approve or decline JazzCash and EasyPaisa deposit requests." },
      { property: "og:title", content: "Deposit requests — ONEpk admin" },
      { property: "og:description", content: "Approve or decline user deposit requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDeposits,
});

const FILTERS = ["pending", "approved", "declined"] as const;

function AdminDeposits() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const review = useServerFn(reviewDeposit);

  const { data: deposits } = useQuery({
    queryKey: ["admin-deposits", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("*, profiles(full_name, username, email)")
        .eq("status", filter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function act(id: string, action: "approved" | "declined") {
    setBusy(id);
    try {
      await review({ data: { depositId: id, action, note: notes[id]?.slice(0, 500) || undefined } });
      toast.success(action === "approved" ? "Deposit approved and wallet credited" : "Deposit declined");
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not review deposit");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "secondary"} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCsv(
              `onepk-deposits-${filter}.csv`,
              (deposits ?? []).map((d) => ({
                id: d.id,
                amount: d.amount,
                method: d.method,
                sender_number: d.sender_number,
                transaction_id: d.transaction_id,
                status: d.status,
                created_at: d.created_at,
              })),
            )
          }
        >
          Export CSV
        </Button>
      </div>

      {!deposits || deposits.length === 0 ? (
        <EmptyState message={`No ${filter} deposits.`} />
      ) : (
        <div className="space-y-3">
          {deposits.map((d) => {
            const p = d.profiles as { full_name?: string; username?: string; email?: string } | null;
            return (
              <div key={d.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {formatPKR(d.amount)} · {methodLabel(d.method)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p?.full_name ?? p?.username ?? "User"} · {p?.email ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      From {d.sender_number} · TXN {d.transaction_id} · {formatDate(d.created_at)}
                    </p>
                  </div>
                  {d.screenshot_url && (
                    <a href={d.screenshot_url} target="_blank" rel="noreferrer">
                      <img
                        src={d.screenshot_url}
                        alt="Payment screenshot"
                        loading="lazy"
                        className="h-20 w-20 rounded border border-border object-cover"
                      />
                    </a>
                  )}
                </div>

                {d.status === "pending" ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Optional note for the user"
                      maxLength={500}
                      value={notes[d.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === d.id} onClick={() => act(d.id, "approved")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === d.id}
                        onClick={() => act(d.id, "declined")}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.status} {d.admin_note ? `· ${d.admin_note}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
