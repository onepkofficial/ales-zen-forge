import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { useEntryCounts, useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate } from "@/lib/onepk";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ONEpk — Home Dashboard" },
      {
        name: "description",
        content:
          "Browse live ONEpk product draws, track your wallet balance and buy entries with verified JazzCash or EasyPaisa deposits.",
      },
      { property: "og:title", content: "ONEpk — Home Dashboard" },
      {
        property: "og:description",
        content: "Live product draws, real wallet balance and verified deposits on ONEpk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: profile } = useProfile();
  const { data: counts } = useEntryCounts();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <section className="mb-6 rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatPKR(profile?.wallet_balance ?? 0)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Available wallet balance</p>
        <Link
          to="/deposit"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add funds
        </Link>
      </section>

      <h1 className="mb-3 text-lg font-semibold">Available products</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !products || products.length === 0 ? (
        <EmptyState message="No products available at the moment." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const sold = counts?.[p.id] ?? 0;
            const remaining = Math.max(p.total_entries - sold, 0);
            const pct = p.total_entries ? (sold / p.total_entries) * 100 : 0;
            return (
              <Link
                key={p.id}
                to="/products/$productId"
                params={{ productId: p.id }}
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-lift"
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.title}
                    loading="lazy"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-muted text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold leading-snug">{p.title}</h2>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>
                      {p.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Entry {formatPKR(p.entry_price)} · Draw {formatDate(p.draw_date)}
                  </p>
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {sold} of {p.total_entries} filled · {remaining} left
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
