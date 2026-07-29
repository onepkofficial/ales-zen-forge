-- Replace the definer view with a maintained counts table (aggregate only)
DROP VIEW IF EXISTS public.product_entry_counts;

CREATE TABLE public.product_entry_counts (
  product_id uuid PRIMARY KEY,
  sold bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_entry_counts TO anon, authenticated;
GRANT ALL ON public.product_entry_counts TO service_role;
ALTER TABLE public.product_entry_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entry counts public read" ON public.product_entry_counts
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.product_entry_counts (product_id, sold)
SELECT product_id, COALESCE(SUM(quantity), 0) FROM public.entries GROUP BY product_id;

CREATE OR REPLACE FUNCTION public.sync_product_entry_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.product_entry_counts (product_id, sold, updated_at)
  VALUES (NEW.product_id, NEW.quantity, now())
  ON CONFLICT (product_id) DO UPDATE
    SET sold = public.product_entry_counts.sold + EXCLUDED.sold, updated_at = now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_product_entry_counts() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER entries_sync_counts
AFTER INSERT ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.sync_product_entry_counts();

-- Safe invoker-based admin check (relies on each user reading their own roles)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- user_roles: own rows only (no recursive definer call)
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Rewrite every policy that used has_role()
DROP POLICY IF EXISTS "deposits admin update" ON public.deposits;
CREATE POLICY "deposits admin update" ON public.deposits FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "deposits select own or admin" ON public.deposits;
CREATE POLICY "deposits select own or admin" ON public.deposits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications admin write" ON public.notifications;
CREATE POLICY "notifications admin write" ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "notifications read own or broadcast" ON public.notifications;
CREATE POLICY "notifications read own or broadcast" ON public.notifications FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "products admin write" ON public.products;
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;
CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select own" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "referrals read own" ON public.referrals;
CREATE POLICY "referrals read own" ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR public.is_admin());

DROP POLICY IF EXISTS "winners admin write" ON public.winners;
CREATE POLICY "winners admin write" ON public.winners FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "entries select own or admin" ON public.entries;
CREATE POLICY "entries select own or admin" ON public.entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Storage policies without the definer helper
DROP POLICY IF EXISTS "logos public read" ON storage.objects;
DROP POLICY IF EXISTS "logos insert own folder" ON storage.objects;
DROP POLICY IF EXISTS "logos update own folder" ON storage.objects;
DROP POLICY IF EXISTS "logos delete own folder" ON storage.objects;

CREATE POLICY "logos insert own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'products' AND public.is_admin())));
CREATE POLICY "logos update own folder" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'products' AND public.is_admin())))
  WITH CHECK (bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'products' AND public.is_admin())));
CREATE POLICY "logos delete own folder" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'products' AND public.is_admin())));

-- has_role is no longer reachable from the API
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;