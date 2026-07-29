import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requestWithdrawal } from "@/lib/onepk.functions";
import { AppShell, EmptyState } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate, methodLabel, PAYMENT_METHODS } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw funds — ONEpk" },
      {
        name: "description",
        content:
          "Request a JazzCash or EasyPaisa payout from your ONEpk wallet and track the approval status of every request.",
      },
      { property: "og:title", content: "Withdraw funds — ONEpk" },
      { property: "og:description", content: "Request a payout from your ONEpk wallet balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WithdrawPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  approved: "default",
  pending: "secondary",
  declined: "destructive",
};

function WithdrawPage() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const submit = useServerFn(requestWithdrawal);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].id);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: requests } = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await submit({
        data: {
          amount: Number(amount),
          method: method as "jazzcash" | "easypaisa",
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
        },
      });
      setAmount("");
      toast.success("Withdrawal request submitted for review");
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Available for withdrawal</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{formatPKR(profile?.wallet_balance ?? 0)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Your wallet is debited only after an admin approves the payout.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h1 className="text-base font-semibold">Request a withdrawal</h1>
          <div className="space-y-1.5">
            <Label htmlFor="wd-amount">Amount (PKR)</Label>
            <Input
              id="wd-amount"
              type="number"
              min={100}
              step={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
            />
          </div>
          <div className="space-y-2">
            <Label>Payout method</Label>
            <RadioGroup value={method} onValueChange={setMethod} className="space-y-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <RadioGroupItem value={m.id} id={`wd-${m.id}`} />
                  <span>{m.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wd-name">Account title</Label>
              <Input
                id="wd-name"
                required
                maxLength={100}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-number">Account number</Label>
              <Input
                id="wd-number"
                required
                inputMode="numeric"
                pattern="03[0-9]{9}"
                maxLength={11}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="03001234567"
              />
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Submitting…" : "Submit request"}
          </Button>
        </form>

        <div className="space-y-3">
          <h2 className="text-base font-semibold">Request history</h2>
          {!requests || requests.length === 0 ? (
            <EmptyState message="No withdrawal requests yet." />
          ) : (
            requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="text-sm font-semibold">{formatPKR(r.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {methodLabel(r.method)} · {r.account_number} · {formatDate(r.created_at)}
                  </p>
                  {r.admin_note && <p className="mt-1 text-xs text-muted-foreground">{r.admin_note}</p>}
                </div>
                <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
