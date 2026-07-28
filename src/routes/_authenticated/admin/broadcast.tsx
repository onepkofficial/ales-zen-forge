import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { broadcastNotification } from "@/lib/onepk.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  head: () => ({
    meta: [
      { title: "Broadcast — ONEpk admin" },
      { name: "description", content: "Send an announcement to every registered ONEpk user." },
      { property: "og:title", content: "Broadcast — ONEpk admin" },
      { property: "og:description", content: "Send platform-wide ONEpk announcements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminBroadcast,
});

function AdminBroadcast() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useServerFn(broadcastNotification);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send({ data: { title: title.trim(), body: body.trim() } });
      toast.success("Announcement sent to all users");
      setTitle("");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send announcement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Send announcement</h2>
      <div className="space-y-1.5">
        <Label htmlFor="b-title">Title</Label>
        <Input
          id="b-title"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="b-body">Message</Label>
        <Textarea
          id="b-body"
          rows={5}
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy}>
        Send to all users
      </Button>
    </form>
  );
}
