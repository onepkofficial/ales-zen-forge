import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { replyTicket } from "@/lib/onepk.functions";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support & help centre — ONEpk" },
      {
        name: "description",
        content:
          "Open a support ticket, follow admin replies and read answers to the most common ONEpk deposit, entry and withdrawal questions.",
      },
      { property: "og:title", content: "Support & help centre — ONEpk" },
      { property: "og:description", content: "Support tickets, admin replies and ONEpk FAQs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

const CATEGORIES = ["general", "deposit", "withdrawal", "entry", "account"] as const;

const FAQS = [
  {
    q: "How do I add funds to my wallet?",
    a: "Send the amount to the JazzCash or EasyPaisa number shown on the deposit page, then submit the deposit form with your transaction ID and screenshot. An admin verifies it and credits your wallet.",
  },
  {
    q: "How long does deposit approval take?",
    a: "Deposits are reviewed manually by the ONEpk team, usually within a few hours. You get a notification as soon as your request is approved or declined.",
  },
  {
    q: "How do withdrawals work?",
    a: "Request a payout from the withdrawal page with your JazzCash or EasyPaisa account details. Your wallet is debited only after an admin approves the request.",
  },
  {
    q: "How are winners selected?",
    a: "A winner is picked from the real paid entries of that product once its slots are filled or the draw date arrives. Every winner is published on the Winners page.",
  },
  {
    q: "How much do I earn per referral?",
    a: "You earn Rs 10 in your wallet each time someone signs up with your referral code and their account is created successfully.",
  },
  {
    q: "Why is my phone number rejected?",
    a: "One mobile number can belong to only one ONEpk account. If your number shows as already registered, sign in with the original account or contact support.",
  },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  open: "secondary",
  pending: "default",
  resolved: "default",
};

function SupportPage() {
  const queryClient = useQueryClient();
  const reply = useServerFn(replyTicket);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const { data: tickets } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, ticket_messages(id, body, is_admin, created_at)")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setSubmitting(false);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: auth.user.id,
      subject: subject.trim().slice(0, 150),
      category,
      message: message.trim().slice(0, 2000),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSubject("");
    setMessage("");
    toast.success("Ticket submitted. Our team will reply shortly.");
    queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
  }

  async function sendReply(ticketId: string) {
    const body = (replies[ticketId] ?? "").trim();
    if (!body) return;
    try {
      await reply({ data: { ticketId, body } });
      setReplies((r) => ({ ...r, [ticketId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    }
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Support</h1>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">Contact us</TabsTrigger>
          <TabsTrigger value="tickets">My tickets</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <form onSubmit={createTicket} className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="st-subject">Subject</Label>
              <Input
                id="st-subject"
                required
                maxLength={150}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Deposit not credited"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="st-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c[0].toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-message">Message</Label>
              <Textarea
                id="st-message"
                required
                maxLength={2000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue with as much detail as possible."
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Submit ticket"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4 space-y-3">
          {!tickets || tickets.length === 0 ? (
            <EmptyState message="You have not opened any support tickets." />
          ) : (
            tickets.map((t) => {
              const msgs = ((t.ticket_messages ?? []) as {
                id: string;
                body: string;
                is_admin: boolean;
                created_at: string;
              }[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
              return (
                <div key={t.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>{t.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.message}</p>
                  {msgs.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-3">
                      {msgs.map((m) => (
                        <div
                          key={m.id}
                          className={
                            m.is_admin
                              ? "rounded-md bg-muted p-3 text-sm"
                              : "rounded-md border border-border p-3 text-sm"
                          }
                        >
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {m.is_admin ? "ONEpk support" : "You"} · {formatDate(m.created_at)}
                          </p>
                          {m.body}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.status !== "resolved" && (
                    <div className="flex gap-2">
                      <Input
                        value={replies[t.id] ?? ""}
                        onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))}
                        placeholder="Add a reply…"
                        maxLength={2000}
                      />
                      <Button variant="secondary" onClick={() => sendReply(t.id)}>
                        Send
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="faq" className="mt-4">
          <Accordion type="single" collapsible className="rounded-lg border border-border bg-card px-4">
            {FAQS.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
