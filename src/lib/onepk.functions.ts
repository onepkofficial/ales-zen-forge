import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Buy entries for a product. Deducts the wallet balance server-side. */
export const purchaseEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, title, entry_price, total_entries, status")
      .eq("id", data.productId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Product not found");
    if (product.status !== "active") throw new Error("This product is no longer accepting entries");

    const { data: soldRows, error: sErr } = await supabaseAdmin
      .from("entries")
      .select("quantity")
      .eq("product_id", data.productId);
    if (sErr) throw new Error(sErr.message);
    const sold = (soldRows ?? []).reduce((a, r) => a + (r.quantity ?? 0), 0);
    const remaining = product.total_entries - sold;
    if (remaining < data.quantity) throw new Error(`Only ${Math.max(remaining, 0)} entries remaining`);

    const cost = Number(product.entry_price) * data.quantity;

    const { data: profile, error: prErr } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .maybeSingle();
    if (prErr) throw new Error(prErr.message);
    const balance = Number(profile?.wallet_balance ?? 0);
    if (balance < cost) throw new Error("INSUFFICIENT_BALANCE");

    const { error: eErr } = await supabaseAdmin
      .from("entries")
      .insert({ user_id: userId, product_id: data.productId, quantity: data.quantity, amount_paid: cost });
    if (eErr) throw new Error(eErr.message);

    const { error: wErr } = await supabaseAdmin
      .from("profiles")
      .update({ wallet_balance: balance - cost })
      .eq("id", userId);
    if (wErr) throw new Error(wErr.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "Entry confirmed",
      body: `You bought ${data.quantity} entry(s) for ${product.title}.`,
    });

    return { ok: true, newBalance: balance - cost };
  });

/** Admin: approve or decline a deposit request. Approval credits the wallet. */
export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        depositId: z.string().uuid(),
        action: z.enum(["approved", "declined"]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deposit, error } = await supabaseAdmin
      .from("deposits")
      .select("id, user_id, amount, status")
      .eq("id", data.depositId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deposit) throw new Error("Deposit not found");
    if (deposit.status !== "pending") throw new Error("This deposit was already reviewed");

    const { error: uErr } = await supabaseAdmin
      .from("deposits")
      .update({ status: data.action, admin_note: data.note ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", data.depositId);
    if (uErr) throw new Error(uErr.message);

    if (data.action === "approved") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("wallet_balance")
        .eq("id", deposit.user_id)
        .maybeSingle();
      const balance = Number(profile?.wallet_balance ?? 0) + Number(deposit.amount);
      const { error: wErr } = await supabaseAdmin
        .from("profiles")
        .update({ wallet_balance: balance })
        .eq("id", deposit.user_id);
      if (wErr) throw new Error(wErr.message);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: deposit.user_id,
      title: data.action === "approved" ? "Deposit approved" : "Deposit declined",
      body:
        data.action === "approved"
          ? `Rs ${Number(deposit.amount)} has been added to your wallet.`
          : data.note || "Your deposit request was declined.",
    });

    return { ok: true };
  });

/** Admin: declare a winner picked from the real buyers of a product. */
export const declareWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ productId: z.string().uuid(), entryId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entry, error } = await supabaseAdmin
      .from("entries")
      .select("id, user_id, product_id")
      .eq("id", data.entryId)
      .eq("product_id", data.productId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entry) throw new Error("That entry does not belong to this product");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, username, city")
      .eq("id", entry.user_id)
      .maybeSingle();

    const { error: wErr } = await supabaseAdmin.from("winners").insert({
      product_id: data.productId,
      user_id: entry.user_id,
      entry_id: entry.id,
      display_name: profile?.full_name || profile?.username || "ONEpk user",
      city: profile?.city ?? null,
    });
    if (wErr) throw new Error(wErr.message);

    await supabaseAdmin.from("products").update({ status: "completed" }).eq("id", data.productId);
    await supabaseAdmin.from("notifications").insert({
      user_id: entry.user_id,
      title: "Congratulations — you won!",
      body: "You have been declared the winner of a ONEpk draw.",
    });

    return { ok: true };
  });

/** Admin: broadcast a notification to all registered users. */
export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notifications")
      .insert({ user_id: null, title: data.title, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Link a new signup to a referrer and credit the Rs 10 bonus. */
export const applyReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().trim().min(4).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by")
      .eq("id", userId)
      .maybeSingle();
    if (!me || me.referred_by) return { ok: false, reason: "already_referred" };

    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id, wallet_balance")
      .eq("referral_code", data.code.toUpperCase())
      .maybeSingle();
    if (!referrer || referrer.id === userId) return { ok: false, reason: "invalid_code" };

    await supabaseAdmin.from("profiles").update({ referred_by: referrer.id }).eq("id", userId);
    const { error } = await supabaseAdmin
      .from("referrals")
      .insert({ referrer_id: referrer.id, referred_id: userId, bonus_amount: 10 });
    if (error) return { ok: false, reason: "already_referred" };

    await supabaseAdmin
      .from("profiles")
      .update({ wallet_balance: Number(referrer.wallet_balance ?? 0) + 10 })
      .eq("id", referrer.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: referrer.id,
      title: "Referral bonus earned",
      body: "Rs 10 has been added to your wallet for a successful referral.",
    });

    return { ok: true };
  });

/** Admin: aggregated dashboard counters. */
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, products, pending, entries] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("deposits").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("entries").select("id", { count: "exact", head: true }),
    ]);
    return {
      users: users.count ?? 0,
      products: products.count ?? 0,
      pendingDeposits: pending.count ?? 0,
      entries: entries.count ?? 0,
    };
  });

/** Admin: full user list with wallet balances (admin portal + CSV export). */
export const adminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, email, phone, city, wallet_balance, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
