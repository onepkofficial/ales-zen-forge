import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { PAYMENT_METHODS, formatPKR } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const searchSchema = z.object({
  method: z.string().optional(),
  amount: z.number().optional(),
  product: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/deposit")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Add funds — ONEpk Deposit" },
      {
        name: "description",
        content:
          "Submit a JazzCash or EasyPaisa deposit request. Funds are credited to your ONEpk wallet after admin verification.",
      },
      { property: "og:title", content: "Add funds — ONEpk Deposit" },
      {
        property: "og:description",
        content: "Submit a JazzCash or EasyPaisa deposit for admin verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepositPage,
});

function DepositPage() {
  const search = useSearch({ from: "/_authenticated/deposit" });
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<string>(
    PAYMENT_METHODS.some((m) => m.id === search.method) ? search.method! : "jazzcash",
  );
  const [amount, setAmount] = useState(String(search.amount ?? ""));
  const [senderName, setSenderName] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [txnId, setTxnId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = PAYMENT_METHODS.find((m) => m.id === method)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a valid amount");
    if (!senderName.trim() || !senderNumber.trim() || !txnId.trim()) {
      return toast.error("Sender name, number and transaction ID are required");
    }
    if (!profile) return;

    setLoading(true);
    try {
      let screenshotUrl: string | null = null;
      if (file) {
        const path = `${profile.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "")}`;
        const { error: upErr } = await supabase.storage.from("logos").upload(path, file);
        if (upErr) throw upErr;
        screenshotUrl = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("deposits").insert({
        user_id: profile.id,
        method,
        amount: value,
        sender_name: senderName.trim().slice(0, 100),
        sender_number: senderNumber.trim().slice(0, 20),
        transaction_id: txnId.trim().slice(0, 60),
        screenshot_url: screenshotUrl,
        status: "pending",
      });
      if (error) throw error;

      toast.success("Deposit request submitted", {
        description: "An admin will verify it shortly.",
      });
      setAmount("");
      setSenderName("");
      setSenderNumber("");
      setTxnId("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["my-deposits"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit deposit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">Add funds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send the amount to one of the accounts below, then submit the details for verification.
          </p>
          {search.product && (
            <p className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
              For: <span className="font-medium">{search.product}</span>
              {search.amount ? ` · ${formatPKR(search.amount)}` : ""}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <Label className="mb-2 block">Payment method</Label>
          <RadioGroup value={method} onValueChange={setMethod} className="space-y-2">
            {PAYMENT_METHODS.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm"
              >
                <RadioGroupItem value={m.id} id={`d-${m.id}`} />
                <span>{m.label}</span>
              </label>
            ))}
          </RadioGroup>

          <div className="mt-4 space-y-2 rounded-md border border-border bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account title</span>
              <span className="font-medium">{selected.accountTitle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Account number</span>
              <button
                type="button"
                className="flex items-center gap-1.5 font-mono font-medium hover:text-primary"
                onClick={() => {
                  navigator.clipboard.writeText(selected.accountNumber);
                  toast.success("Number copied");
                }}
              >
                {selected.accountNumber}
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Submit deposit details</h2>
          <div className="space-y-1.5">
            <Label htmlFor="dep-amount">Amount (Rs)</Label>
            <Input
              id="dep-amount"
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-name">Sender name</Label>
              <Input
                id="dep-name"
                required
                maxLength={100}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-number">Sender number</Label>
              <Input
                id="dep-number"
                required
                maxLength={20}
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-txn">Transaction ID</Label>
            <Input
              id="dep-txn"
              required
              maxLength={60}
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-file">Payment screenshot (optional)</Label>
            <Input
              id="dep-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Submit for verification
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
