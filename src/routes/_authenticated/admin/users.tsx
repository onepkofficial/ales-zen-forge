import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminUsers } from "@/lib/onepk.functions";
import { EmptyState } from "@/components/app-shell";
import { formatPKR, formatDate, downloadCsv } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — ONEpk admin" },
      { name: "description", content: "Browse registered ONEpk users, wallet balances and contact details." },
      { property: "og:title", content: "Users — ONEpk admin" },
      { property: "og:description", content: "Registered ONEpk users and wallet balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  const [q, setQ] = useState("");
  const fetchUsers = useServerFn(adminUsers);
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers({}) });

  const filtered = (users ?? []).filter((u) =>
    [u.full_name, u.username, u.email, u.phone, u.city].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search users…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => downloadCsv("onepk-users.csv", filtered)}>
          Export CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No users found." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">City</th>
                <th className="px-4 py-2 font-medium">Wallet</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">{u.full_name ?? u.username ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.city ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{formatPKR(u.wallet_balance)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
