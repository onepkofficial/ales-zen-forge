import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data, error } = await (supabase.rpc as any)("is_admin");
      if (error) throw error;
      return !!data;
    },
  });
}

export function useEntryCounts() {
  return useQuery({
    queryKey: ["entry-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("product_entry_counts") as any).select("product_id, sold");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { product_id: string; sold: number }[]) {
        map[row.product_id] = Number(row.sold ?? 0);
      }
      return map;
    },
  });
}
