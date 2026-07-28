import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatDate } from "@/lib/onepk";

export const Route = createFileRoute("/_authenticated/winners")({
  head: () => ({
    meta: [
      { title: "Winners — ONEpk" },
      {
        name: "description",
        content: "See the real ONEpk draw winners, their city and the product they won, announced by the admin team.",
      },
      { property: "og:title", content: "Winners — ONEpk" },
      { property: "og:description", content: "Real ONEpk draw winners announced by the admin team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WinnersPage,
});

function WinnersPage() {
  const { data: winners, isLoading } = useQuery({
    queryKey: ["winners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("winners")
        .select("*, products(title, image_url)")
        .order("announced_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Winners</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !winners || winners.length === 0 ? (
        <EmptyState message="No winners announced yet." />
      ) : (
        <div className="space-y-3">
          {winners.map((w, i) => {
            const product = w.products as { title?: string; image_url?: string } | null;
            return (
              <div
                key={w.id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="flex animate-in fade-in slide-in-from-bottom-2 items-center gap-4 rounded-lg border border-border bg-card p-4 duration-500 fill-mode-both"
              >
                {product?.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.title ?? "Product"}
                    loading="lazy"
                    className="h-14 w-14 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded bg-muted">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{w.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {w.city ? `${w.city} · ` : ""}
                    Won {product?.title ?? "a ONEpk product"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(w.announced_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
