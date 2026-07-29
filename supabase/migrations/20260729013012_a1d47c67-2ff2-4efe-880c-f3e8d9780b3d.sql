-- 1. entries: remove public read, restrict to owner or admin
DROP POLICY IF EXISTS "entries public count read" ON public.entries;
CREATE POLICY "entries select own or admin" ON public.entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Aggregate-only counts for everyone (no user data)
CREATE OR REPLACE VIEW public.product_entry_counts
WITH (security_invoker = false) AS
  SELECT product_id, COALESCE(SUM(quantity), 0)::bigint AS sold
  FROM public.entries
  GROUP BY product_id;

REVOKE ALL ON public.product_entry_counts FROM PUBLIC;
GRANT SELECT ON public.product_entry_counts TO anon, authenticated;
GRANT ALL ON public.product_entry_counts TO service_role;

-- 2. winners: authenticated read only
DROP POLICY IF EXISTS "winners public read" ON public.winners;
CREATE POLICY "winners authenticated read" ON public.winners
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.winners FROM anon;

-- 3. storage: ownership-scoped policies for the logos bucket
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%logos%' OR with_check ILIKE '%logos%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "logos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "logos insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'products' AND public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "logos update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'products' AND public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'products' AND public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "logos delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR ((storage.foldername(name))[1] = 'products' AND public.has_role(auth.uid(), 'admin'))
    )
  );

-- 4. lock down SECURITY DEFINER helpers that must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_onepk_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_wallet_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;