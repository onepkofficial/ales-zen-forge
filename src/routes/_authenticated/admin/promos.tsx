import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { savePromoCode } from "@/lib/onepk.functions";
import { EmptyState } from "@/components/app-shell";
import { formatPKR, formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/promos")({
  head: () => ({
    meta: [
      { title: "Promo codes — ONEpk admin" },
      { name: "description", content: "Create and manage ONEpk wallet bonus promo codes and usage limits." },
      { property: "og:title", content: "Promo codes — ONEpk admin" },
      { property: "og:description", content: "Manage ONEpk promo codes and bonus amounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPromos,
});

function AdminPromos() {
  const queryClient = useQueryClient();
  const save = useServerFn(savePromoCode);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [bonus, setBonus] = useState("50");
  const [maxUses, setMaxUses] = useState("0");
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: promos } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        data: {
          code: code.trim(),
          description: description.trim() || undefined,
          bonusAmount: Number(bonus),
          maxUses: Number(maxUses),
          expiresAt: expires || undefined,
          active: true,
        },
      });
      setCode("");
      setDescription("");
      toast.success("Promo code saved");
      queryClient.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save promo code");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: { id: string; code: string; description: string | null; bonus_amount: number; max_uses: number; expires_at: string | null; active: boolean }) {
    try {
      await save({
        data: {
          id: p.id,
          code: p.code,
          description: p.description ?? undefined,
          bonusAmount: Number(p.bonus_amount),
          maxUses: p.max_uses,
          expiresAt: p.expires_at ?? undefined,
          active: !p.active,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">New promo code</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pc-code">Code</Label>
            <Input
              id="pc-code"
              required
              maxLength={30}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ONEPK50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-bonus">Bonus amount (PKR)</Label>
            <Input id="pc-bonus" type="number" min={0} required value={bonus} onChange={(e) => setBonus(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-max">Max uses (0 = unlimited)</Label>
            <Input id="pc-max" type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-exp">Expires</Label>
            <Input id="pc-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pc-desc">Description</Label>
            <Input
              id="pc-desc"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create code"}
        </Button>
      </form>

      {!promos || promos.length === 0 ? (
        <EmptyState message="No promo codes created yet." />
      ) : (
        <div className="space-y-3">
          {promos.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold">
                  {p.code} <span className="text-muted-foreground">· {formatPKR(p.bonus_amount)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.used_count} used{p.max_uses > 0 ? ` of ${p.max_uses}` : ""} ·{" "}
                  {p.expires_at ? `expires ${formatDate(p.expires_at)}` : "no expiry"}
                </p>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "active" : "disabled"}</Badge>
                <Switch checked={p.active} onCheckedChange={() => toggle(p)} aria-label="Toggle promo code" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
