import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { replyTicket } from "@/lib/onepk.functions";
import { EmptyState } from "@/components/app-shell";
import { formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  head: () => ({
    meta: [
      { title: "Support tickets — ONEpk admin" },
      { name: "description", content: "Answer ONEpk customer support tickets and close resolved issues." },
      { property: "og:title", content: "Support tickets — ONEpk admin" },
      { property: "og:description", content: "Answer and resolve ONEpk support tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTickets,
});

function AdminTickets() {
  const queryClient = useQueryClient();
  const reply = useServerFn(replyTicket);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: tickets } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, profiles(full_name, username, email), ticket_messages(id, body, is_admin, created_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function send(ticketId: string, status: "pending" | "resolved") {
    const body = (drafts[ticketId] ?? "").trim();
    if (!body) return toast.error("Write a reply first");
    setBusy(ticketId);
    try {
      await reply({ data: { ticketId, body, status } });
      setDrafts((d) => ({ ...d, [ticketId]: "" }));
      toast.success(status === "resolved" ? "Replied and resolved" : "Reply sent");
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setBusy(null);
    }
  }

  if (!tickets || tickets.length === 0) return <EmptyState message="No support tickets yet." />;

  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const p = t.profiles as { full_name?: string; username?: string; email?: string } | null;
        const msgs = ((t.ticket_messages ?? []) as {
          id: string;
          body: string;
          is_admin: boolean;
          created_at: string;
        }[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <div key={t.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {p?.full_name ?? p?.username ?? "User"} · {p?.email ?? "—"} · {t.category} ·{" "}
                  {formatDate(t.created_at)}
                </p>
              </div>
              <Badge variant={t.status === "resolved" ? "default" : "secondary"}>{t.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t.message}</p>
            {msgs.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    className={m.is_admin ? "rounded-md bg-muted p-3 text-sm" : "rounded-md border border-border p-3 text-sm"}
                  >
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {m.is_admin ? "Admin" : "User"} · {formatDate(m.created_at)}
                    </p>
                    {m.body}
                  </div>
                ))}
              </div>
            )}
            <Textarea
              rows={3}
              maxLength={2000}
              placeholder="Write a reply…"
              value={drafts[t.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy === t.id} onClick={() => send(t.id, "pending")}>
                Send reply
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === t.id}
                onClick={() => send(t.id, "resolved")}
              >
                Reply & resolve
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
