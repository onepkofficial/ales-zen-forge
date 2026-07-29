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

/** Complete the user's profile after first sign-in. Phone must be globally unique. */
export const completeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(100),
        phone: z
          .string()
          .trim()
          .regex(/^03\d{9}$/, "Enter a valid Pakistani mobile number (03XXXXXXXXX)"),
        city: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .neq("id", userId)
      .maybeSingle();
    if (existing) throw new Error("PHONE_TAKEN");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone, city: data.city || null })
      .eq("id", userId);
    if (error) {
      if (error.code === "23505") throw new Error("PHONE_TAKEN");
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Request a payout from the wallet. Funds are held until an admin reviews it. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        amount: z.number().positive().max(1_000_000),
        method: z.enum(["jazzcash", "easypaisa"]),
        accountName: z.string().trim().min(2).max(100),
        accountNumber: z.string().trim().regex(/^03\d{9}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .maybeSingle();
    const balance = Number(profile?.wallet_balance ?? 0);
    if (balance < data.amount) throw new Error("Withdrawal amount exceeds your wallet balance");

    const { count } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");
    if ((count ?? 0) > 0) throw new Error("You already have a pending withdrawal request");

    const { error } = await supabaseAdmin.from("withdrawal_requests").insert({
      user_id: userId,
      amount: data.amount,
      method: data.method,
      account_name: data.accountName,
      account_number: data.accountNumber,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: approve (debits wallet) or decline a withdrawal request. */
export const reviewWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        withdrawalId: z.string().uuid(),
        action: z.enum(["approved", "declined"]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wd, error } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id, user_id, amount, status")
      .eq("id", data.withdrawalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wd) throw new Error("Withdrawal not found");
    if (wd.status !== "pending") throw new Error("This request was already reviewed");

    if (data.action === "approved") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("wallet_balance")
        .eq("id", wd.user_id)
        .maybeSingle();
      const balance = Number(profile?.wallet_balance ?? 0);
      if (balance < Number(wd.amount)) throw new Error("User no longer has enough balance");
      const { error: wErr } = await supabaseAdmin
        .from("profiles")
        .update({ wallet_balance: balance - Number(wd.amount) })
        .eq("id", wd.user_id);
      if (wErr) throw new Error(wErr.message);
    }

    const { error: uErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({ status: data.action, admin_note: data.note ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", data.withdrawalId);
    if (uErr) throw new Error(uErr.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: wd.user_id,
      title: data.action === "approved" ? "Withdrawal approved" : "Withdrawal declined",
      body:
        data.action === "approved"
          ? `Rs ${Number(wd.amount)} has been sent to your account.`
          : data.note || "Your withdrawal request was declined.",
    });
    await supabaseAdmin.from("admin_logs").insert({
      admin_id: context.userId,
      action: `withdrawal_${data.action}`,
      target_type: "withdrawal_requests",
      target_id: data.withdrawalId,
      details: { amount: wd.amount, note: data.note ?? null },
    });

    return { ok: true };
  });

/** Redeem a promo code once and credit the bonus to the wallet. */
export const redeemPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().trim().min(3).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const code = data.code.toUpperCase();

    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!promo || !promo.active) throw new Error("This promo code is not valid");
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) throw new Error("This promo code has expired");
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) throw new Error("This promo code is fully used");

    const { error: rErr } = await supabaseAdmin
      .from("promo_redemptions")
      .insert({ promo_id: promo.id, user_id: userId, amount: promo.bonus_amount });
    if (rErr) throw new Error("You have already used this promo code");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .maybeSingle();
    const newBalance = Number(profile?.wallet_balance ?? 0) + Number(promo.bonus_amount);
    await supabaseAdmin.from("profiles").update({ wallet_balance: newBalance }).eq("id", userId);
    await supabaseAdmin
      .from("promo_codes")
      .update({ used_count: promo.used_count + 1 })
      .eq("id", promo.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "Promo code applied",
      body: `Rs ${Number(promo.bonus_amount)} bonus has been added to your wallet.`,
    });

    return { ok: true, bonus: Number(promo.bonus_amount), newBalance };
  });

/** Post a reply on a support ticket (owner or admin) and optionally set its status. */
export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        status: z.enum(["open", "pending", "resolved"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (!isAdmin && ticket.user_id !== context.userId) throw new Error("Forbidden");

    const { error } = await supabaseAdmin.from("ticket_messages").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      is_admin: !!isAdmin,
      body: data.body,
    });
    if (error) throw new Error(error.message);

    if (isAdmin) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ status: data.status ?? "pending" })
        .eq("id", data.ticketId);
      await supabaseAdmin.from("notifications").insert({
        user_id: ticket.user_id,
        title: "Support replied to your ticket",
        body: data.body.slice(0, 180),
      });
      await supabaseAdmin.from("admin_logs").insert({
        admin_id: context.userId,
        action: "ticket_reply",
        target_type: "support_tickets",
        target_id: data.ticketId,
        details: { status: data.status ?? "pending" },
      });
    }

    return { ok: true };
  });

/** Admin: create or update a promo code. */
export const savePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().trim().min(3).max(30),
        description: z.string().trim().max(200).optional(),
        bonusAmount: z.number().min(0).max(100000),
        maxUses: z.number().int().min(0).max(100000),
        expiresAt: z.string().optional(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      code: data.code.toUpperCase(),
      description: data.description || null,
      bonus_amount: data.bonusAmount,
      max_uses: data.maxUses,
      expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      active: data.active,
    };
    const query = data.id
      ? supabaseAdmin.from("promo_codes").update(row).eq("id", data.id)
      : supabaseAdmin.from("promo_codes").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_logs").insert({
      admin_id: context.userId,
      action: data.id ? "promo_updated" : "promo_created",
      target_type: "promo_codes",
      target_id: data.id ?? row.code,
      details: row,
    });
    return { ok: true };
  });
