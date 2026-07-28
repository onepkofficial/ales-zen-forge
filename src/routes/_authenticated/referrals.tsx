import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate, REFERRAL_BONUS } from "@/lib/onepk";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Refer friends — ONEpk" },
      {
        name: "description",
        content: `Share your ONEpk referral link and earn Rs ${REFERRAL_BONUS} for every friend who signs up.`,
      },
      { property: "og:title", content: "Refer friends — ONEpk" },
      { property: "og:description", content: `Earn Rs ${REFERRAL_BONUS} for every successful ONEpk referral.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const { data: profile } = useProfile();

  const { data: referrals } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const link =
    typeof window !== "undefined" && profile?.referral_code
      ? `${window.location.origin}/auth?ref=${profile.referral_code}`
      : "";
  const earned = (referrals ?? []).reduce((a, r) => a + Number(r.bonus_amount ?? 0), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">Refer & earn</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Earn Rs {REFERRAL_BONUS} for every friend who registers with your link.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{referrals?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Friends referred</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{formatPKR(earned)}</p>
            <p className="text-xs text-muted-foreground">Bonus earned</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium">Your referral code</p>
          <p className="font-mono text-lg font-bold">{profile?.referral_code ?? "—"}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs"
            />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Referral link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold">Referral history</h2>
          {!referrals || referrals.length === 0 ? (
            <EmptyState message="No referrals yet." />
          ) : (
            <div className="space-y-2">
              {referrals.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm"
                >
                  <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                  <span className="font-semibold">+{formatPKR(r.bonus_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
