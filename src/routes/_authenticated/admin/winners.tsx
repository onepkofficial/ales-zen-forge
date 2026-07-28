import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app-shell";
import { declareWinner } from "@/lib/onepk.functions";
import { formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/winners")({
  head: () => ({
    meta: [
      { title: "Declare winners — ONEpk admin" },
      { name: "description", content: "Pick a winner from the real paid entries of a ONEpk draw product." },
      { property: "og:title", content: "Declare winners — ONEpk admin" },
      { property: "og:description", content: "Declare draw winners from real entries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminWinners,
});

function AdminWinners() {
  const [productId, setProductId] = useState("");
  const [entryId, setEntryId] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const declare = useServerFn(declareWinner);

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["admin-entries", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, quantity, created_at, profiles(full_name, username, city)")
        .eq("product_id", productId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: winners } = useQuery({
    queryKey: ["winners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("winners")
        .select("*, products(title)")
        .order("announced_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function submit() {
    if (!productId || !entryId) return toast.error("Select a product and an entry");
    setBusy(true);
    try {
      await declare({ data: { productId, entryId } });
      toast.success("Winner declared");
      setEntryId("");
      queryClient.invalidateQueries({ queryKey: ["winners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not declare winner");
    } finally {
      setBusy(false);
    }
  }

  function pickRandom() {
    if (!entries?.length) return toast.error("This product has no entries yet");
    const pool = entries.flatMap((e) => Array.from({ length: e.quantity }, () => e.id));
    setEntryId(pool[Math.floor(Math.random() * pool.length)]);
    toast.success("Random entry selected — confirm to declare");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Declare a winner</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                setEntryId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Entry</Label>
            <Select value={entryId} onValueChange={setEntryId} disabled={!productId}>
              <SelectTrigger>
                <SelectValue placeholder={entries?.length ? "Select entry" : "No entries"} />
              </SelectTrigger>
              <SelectContent>
                {(entries ?? []).map((e) => {
                  const p = e.profiles as { full_name?: string; username?: string; city?: string } | null;
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      {p?.full_name ?? p?.username ?? "User"} · {e.quantity} entr
                      {e.quantity === 1 ? "y" : "ies"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={pickRandom} disabled={!productId}>
            Pick random entry
          </Button>
          <Button onClick={submit} disabled={busy || !entryId}>
            Declare winner
          </Button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Announced winners</h2>
        {!winners || winners.length === 0 ? (
          <EmptyState message="No winners announced yet." />
        ) : (
          <div className="space-y-2">
            {winners.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm"
              >
                <span className="font-medium">{w.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {(w.products as { title?: string } | null)?.title ?? "—"} · {formatDate(w.announced_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
