import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-onepk";
import { formatPKR, formatDate } from "@/lib/onepk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — ONEpk" },
      {
        name: "description",
        content: "Manage your ONEpk profile details, picture, notification preferences and account security.",
      },
      { property: "og:title", content: "Your profile — ONEpk" },
      { property: "og:description", content: "Manage your ONEpk profile and account security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [stats, setStats] = useState({ entries: 0, wins: 0 });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setUsername(profile.username ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "");
    setPhone(profile.phone ?? "");
    setNotify(profile.notifications_enabled);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: entries }, { count: wins }] = await Promise.all([
        supabase.from("entries").select("quantity").eq("user_id", profile.id),
        supabase.from("winners").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
      ]);
      setStats({
        entries: (entries ?? []).reduce((a, r) => a + (r.quantity ?? 0), 0),
        wins: wins ?? 0,
      });
    })();
  }, [profile]);

  async function handleAvatar(file: File) {
    if (!profile) return;
    const path = `${profile.id}/avatar-${Date.now()}-${file.name.replace(/[^\w.-]/g, "")}`;
    const { error } = await supabase.storage.from("logos").upload(path, file);
    if (error) return toast.error(error.message);
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error: uErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (uErr) return toast.error(uErr.message);
    toast.success("Profile picture updated");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim().slice(0, 100),
        username: username.trim().slice(0, 30) || null,
        city: city.trim().slice(0, 60),
        country: country.trim().slice(0, 60),
        phone: phone.trim().slice(0, 20),
        notifications_enabled: notify,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success("Password changed");
  }

  async function requestDeletion() {
    if (!profile) return;
    const { error } = await supabase.from("notifications").insert({
      user_id: profile.id,
      title: "Account deletion requested",
      body: "Your account deletion request has been recorded and will be processed by the ONEpk admin team.",
    });
    if (error) return toast.error(error.message);
    await supabase.auth.signOut();
    toast.success("Deletion request submitted. You have been signed out.");
    navigate({ to: "/auth", replace: true });
  }

  if (!profile) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name ?? "Profile picture"}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold">
              {(profile.full_name ?? "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{profile.full_name ?? "ONEpk user"}</h1>
            <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
            <label className="mt-2 inline-flex cursor-pointer text-xs font-medium text-primary">
              Change picture
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Wallet", value: formatPKR(profile.wallet_balance) },
            { label: "Entries", value: stats.entries },
            { label: "Wins", value: stats.wins },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-lg font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSave} className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Profile details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Full name</Label>
              <Input id="pf-name" maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-username">Username</Label>
              <Input
                id="pf-username"
                maxLength={30}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-city">City</Label>
              <Input id="pf-city" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-country">Country</Label>
              <Input id="pf-country" maxLength={60} value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">Phone</Label>
              <Input id="pf-phone" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-id">User ID</Label>
              <Input id="pf-id" value={profile.id} readOnly disabled className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-email">Registered email</Label>
              <Input id="pf-email" value={profile.email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-since">Member since</Label>
              <Input id="pf-since" value={formatDate(profile.created_at)} readOnly disabled />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-muted-foreground">Receive ONEpk alerts and announcements</p>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
          <Button type="submit" disabled={saving}>
            Save changes
          </Button>
        </form>

        <form onSubmit={handlePassword} className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Change password</h2>
          <div className="space-y-1.5">
            <Label htmlFor="pf-password">New password</Label>
            <Input
              id="pf-password"
              type="password"
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Update password
          </Button>
        </form>

        <div className="space-y-3 rounded-lg border border-destructive/40 bg-card p-5">
          <h2 className="text-base font-semibold text-destructive">Delete account</h2>
          <p className="text-sm text-muted-foreground">
            This submits a deletion request to the ONEpk admin team and signs you out immediately.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your ONEpk account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your remaining wallet balance and entry history will be forfeited. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={requestDeletion}>Confirm deletion</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppShell>
  );
}
