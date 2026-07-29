import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { completeProfile } from "@/lib/onepk.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Profile = {
  full_name: string | null;
  phone: string | null;
  city: string | null;
} | null;

/** Forces a first-time (e.g. Google) user to supply a name and a unique phone number. */
export function CompleteProfileDialog({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const save = useServerFn(completeProfile);

  const incomplete = !!profile && (!profile.full_name?.trim() || !profile.phone?.trim());
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setOpen(incomplete);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setCity(profile.city ?? "");
  }, [profile, incomplete]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: { fullName: fullName.trim(), phone: phone.trim(), city: city.trim() || undefined } });
      toast.success("Profile completed");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your profile";
      toast.error(
        message.includes("PHONE_TAKEN")
          ? "This phone number is already registered to another account"
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!incomplete) return null;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            We need your name and mobile number before you can use your ONEpk wallet. One number can be used
            by one account only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Full name</Label>
            <Input
              id="cp-name"
              required
              minLength={2}
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ali Raza"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-phone">Mobile number</Label>
            <Input
              id="cp-phone"
              required
              inputMode="numeric"
              pattern="03[0-9]{9}"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="03001234567"
            />
            <p className="text-xs text-muted-foreground">Format 03XXXXXXXXX. No verification code required.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-city">City (optional)</Label>
            <Input id="cp-city" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
