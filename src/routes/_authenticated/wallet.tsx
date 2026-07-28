import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate, methodLabel } from "@/lib/onepk";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet & transactions — ONEpk" },
      {
        name: "description",
        content: "Track your ONEpk wallet balance, deposit history and every entry you have purchased.",
      },
      { property: "og:title", content: "Wallet & transactions — ONEpk" },
      { property: "og:description", content: "Your ONEpk wallet balance, deposits and entries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  approved: "default",
  pending: "secondary",
  declined: "destructive",
};

function WalletPage() {
  const { data: profile } = useProfile();

  const { data: deposits } = useQuery({
    queryKey: ["my-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["my-entries"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("entries")
        .select("*, products(title)")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mb-5 rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Wallet balance</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatPKR(profile?.wallet_balance ?? 0)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Withdrawals are disabled. Balance increases only through admin-verified deposits.
        </p>
        <Link
          to="/deposit"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add funds
        </Link>
      </div>

      <Tabs defaultValue="deposits">
        <TabsList>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="deposits" className="mt-4 space-y-3">
          {!deposits || deposits.length === 0 ? (
            <EmptyState message="No deposit history." />
          ) : (
            deposits.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="text-sm font-semibold">{formatPKR(d.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {methodLabel(d.method)} · {formatDate(d.created_at)} · TXN {d.transaction_id ?? "—"}
                  </p>
                  {d.admin_note && <p className="mt-1 text-xs text-muted-foreground">{d.admin_note}</p>}
                </div>
                <Badge variant={STATUS_VARIANT[d.status] ?? "secondary"}>{d.status}</Badge>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="entries" className="mt-4 space-y-3">
          {!entries || entries.length === 0 ? (
            <EmptyState message="No transactions found." />
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {(e.products as { title?: string } | null)?.title ?? "Product"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.quantity} entry(s) · {formatDate(e.created_at)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">-{formatPKR(e.amount_paid)}</span>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
