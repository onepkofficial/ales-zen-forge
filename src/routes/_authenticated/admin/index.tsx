import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminStats } from "@/lib/onepk.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview — ONEpk" },
      { name: "description", content: "ONEpk admin overview: users, products, entries and pending deposits." },
      { property: "og:title", content: "Admin overview — ONEpk" },
      { property: "og:description", content: "Platform counters for the ONEpk admin team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchStats = useServerFn(adminStats);
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchStats({}) });

  const cards = [
    { label: "Registered users", value: data?.users ?? 0 },
    { label: "Products", value: data?.products ?? 0 },
    { label: "Total entries", value: data?.entries ?? 0 },
    { label: "Pending deposits", value: data?.pendingDeposits ?? 0 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-5">
          <p className="text-2xl font-bold tabular-nums">{c.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
