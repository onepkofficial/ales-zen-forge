import { useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { purchaseEntries } from "@/lib/onepk.functions";
import { AppShell } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate, PAYMENT_METHODS } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  head: () => ({
    meta: [
      { title: "Product draw — ONEpk" },
      {
        name: "description",
        content: "Review the product, check remaining entries and confirm your purchase from your ONEpk wallet.",
      },
      { property: "og:title", content: "Product draw — ONEpk" },
      { property: "og:description", content: "Check remaining entries and buy from your ONEpk wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { productId } = useParams({ from: "/_authenticated/products/$productId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const buy = useServerFn(purchaseEntries);

  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<string>("wallet");
  const [submitting, setSubmitting] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", productId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: sold = 0 } = useQuery({
    queryKey: ["product-sold", productId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("product_entry_counts") as any)
        .select("sold")
        .eq("product_id", productId)
        .maybeSingle();
      if (error) throw error;
      return Number((data as { sold?: number } | null)?.sold ?? 0);
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">This product is no longer available.</p>
      </AppShell>
    );
  }

  const remaining = Math.max(product.total_entries - sold, 0);
  const cost = Number(product.entry_price) * quantity;
  const balance = Number(profile?.wallet_balance ?? 0);

  async function handleConfirm() {
    if (!product) return;
    // Instant methods always route to the deposit page with pre-filled context.
    if (method !== "wallet") {
      navigate({
        to: "/deposit",
        search: { method, amount: cost, product: product.title },
      });
      return;
    }
    setSubmitting(true);
    try {
      await buy({ data: { productId, quantity } });
      toast.success("Entry confirmed");
      queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purchase failed";
      if (message.includes("INSUFFICIENT_BALANCE")) {
        toast.error("Not enough wallet balance", { description: "Add funds to continue." });
        navigate({ to: "/deposit", search: { amount: cost, product: product.title } });
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {product.image_url ? (
            <img src={product.image_url} alt={product.title} className="h-72 w-full object-cover" />
          ) : (
            <div className="flex h-72 items-center justify-center bg-muted text-xs text-muted-foreground">
              No image
            </div>
          )}
          <div className="space-y-2 p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold">{product.title}</h1>
              <Badge variant={product.status === "active" ? "default" : "secondary"}>{product.status}</Badge>
            </div>
            {product.description && (
              <p className="text-sm text-muted-foreground">{product.description}</p>
            )}
            <Progress
              value={product.total_entries ? (sold / product.total_entries) * 100 : 0}
              className="h-1.5"
            />
            <p className="text-xs text-muted-foreground">
              {sold} of {product.total_entries} entries filled · {remaining} remaining · Draw{" "}
              {formatDate(product.draw_date)}
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Buy entries</h2>

          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantity</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              max={Math.max(remaining, 1)}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            <RadioGroup value={method} onValueChange={setMethod} className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm">
                <RadioGroupItem value="wallet" id="pm-wallet" />
                <span className="flex-1">
                  Wallet balance
                  <span className="ml-2 text-xs text-muted-foreground">{formatPKR(balance)} available</span>
                </span>
              </label>
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <RadioGroupItem value={m.id} id={`pm-${m.id}`} />
                  <span className="flex-1">
                    {m.label} Instant
                    <span className="ml-2 text-xs text-muted-foreground">Goes to deposit page</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{formatPKR(cost)}</span>
          </div>

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={submitting || product.status !== "active" || remaining < quantity}
          >
            {product.status !== "active"
              ? "Draw closed"
              : remaining < quantity
                ? "Not enough entries left"
                : "Confirm purchase"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
