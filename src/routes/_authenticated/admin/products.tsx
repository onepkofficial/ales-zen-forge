import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app-shell";
import { formatPKR, formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({
    meta: [
      { title: "Manage products — ONEpk admin" },
      { name: "description", content: "Create, edit and close ONEpk draw products with entry price and slots." },
      { property: "og:title", content: "Manage products — ONEpk admin" },
      { property: "og:description", content: "Create and manage ONEpk draw products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProducts,
});

const EMPTY = {
  id: "",
  title: "",
  description: "",
  category: "",
  image_url: "",
  entry_price: "100",
  total_entries: "100",
  status: "active",
  draw_date: "",
};

function AdminProducts() {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function uploadImage(file: File) {
    const path = `products/${Date.now()}-${file.name.replace(/[^\w.-]/g, "")}`;
    const { error } = await supabase.storage.from("logos").upload(path, file);
    if (error) return toast.error(error.message);
    setForm((f) => ({ ...f, image_url: supabase.storage.from("logos").getPublicUrl(path).data.publicUrl }));
    toast.success("Image uploaded");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 2000) || null,
      category: form.category.trim().slice(0, 60) || null,
      image_url: form.image_url || null,
      entry_price: Number(form.entry_price) || 0,
      total_entries: Number(form.total_entries) || 1,
      status: form.status,
      draw_date: form.draw_date ? new Date(form.draw_date).toISOString() : null,
    };
    const { error } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Product updated" : "Product created");
    setForm({ ...EMPTY });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={save} className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{form.id ? "Edit product" : "New product"}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="p-title">Title</Label>
          <Input
            id="p-title"
            required
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-desc">Description</Label>
          <Textarea
            id="p-desc"
            maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Entry price (Rs)</Label>
            <Input
              id="p-price"
              type="number"
              min={1}
              required
              value={form.entry_price}
              onChange={(e) => setForm({ ...form, entry_price: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-slots">Total entries</Label>
            <Input
              id="p-slots"
              type="number"
              min={1}
              required
              value={form.total_entries}
              onChange={(e) => setForm({ ...form, total_entries: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cat">Category</Label>
            <Input
              id="p-cat"
              maxLength={60}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger id="p-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-date">Draw date</Label>
          <Input
            id="p-date"
            type="datetime-local"
            value={form.draw_date}
            onChange={(e) => setForm({ ...form, draw_date: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-img">Product image</Label>
          <Input
            id="p-img"
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
          />
          {form.image_url && (
            <img src={form.image_url} alt="Product preview" className="mt-2 h-24 w-24 rounded object-cover" />
          )}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {form.id ? "Save changes" : "Create product"}
          </Button>
          {form.id && (
            <Button type="button" variant="secondary" onClick={() => setForm({ ...EMPTY })}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {!products || products.length === 0 ? (
          <EmptyState message="No products yet. Create the first one." />
        ) : (
          products.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
              {p.image_url ? (
                <img src={p.image_url} alt={p.title} loading="lazy" className="h-14 w-14 rounded object-cover" />
              ) : (
                <div className="h-14 w-14 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPKR(p.entry_price)} · {p.total_entries} entries · {p.status} ·{" "}
                  {p.draw_date ? formatDate(p.draw_date) : "no draw date"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      id: p.id,
                      title: p.title,
                      description: p.description ?? "",
                      category: p.category ?? "",
                      image_url: p.image_url ?? "",
                      entry_price: String(p.entry_price),
                      total_entries: String(p.total_entries),
                      status: p.status,
                      draw_date: p.draw_date ? new Date(p.draw_date).toISOString().slice(0, 16) : "",
                    })
                  }
                >
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(p.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
