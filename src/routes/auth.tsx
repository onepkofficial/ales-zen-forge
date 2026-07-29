import { useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { applyReferral } from "@/lib/onepk.functions";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  ref: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in or register — ONEpk" },
      {
        name: "description",
        content:
          "Log in or create your ONEpk account to buy entries, manage your wallet and track real draw results.",
      },
      { property: "og:title", content: "Sign in or register — ONEpk" },
      {
        property: "og:description",
        content: "Log in or create your ONEpk account to join live product draws.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const applyRef = useServerFn(applyReferral);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [refCode, setRefCode] = useState(search.ref ?? "");
  const [resetMode, setResetMode] = useState(false);

  function safeRedirect() {
    const r = search.redirect;
    return r && r.startsWith("/") && !r.startsWith("//") ? r : "/";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: safeRedirect(), replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Please enter your full name");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim(), username: username.trim() || undefined, city: city.trim() },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);

    if (data.session) {
      if (refCode.trim()) {
        try {
          await applyRef({ data: { code: refCode.trim() } });
        } catch {
          /* invalid referral codes are simply ignored */
        }
      }
      toast.success("Account created");
      navigate({ to: safeRedirect(), replace: true });
    } else {
      toast.success("Check your email to confirm your account");
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent to your email");
    setResetMode(false);
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });

    if (result.error) {
      setLoading(false);
      return toast.error(result.error.message || "Google sign-in failed");
    }
    if (result.redirected) return;

    if (refCode.trim()) {
      try {
        await applyRef({ data: { code: refCode.trim() } });
      } catch {
        /* invalid referral codes are simply ignored */
      }
    }
    setLoading(false);
    toast.success("Signed in with Google");
    navigate({ to: safeRedirect(), replace: true });
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
            1
          </span>
          <span className="text-xl font-bold tracking-tight">ONEpk</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          {resetMode ? (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Reset your password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll email you a secure link to choose a new password.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Send reset link
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setResetMode(false)}
              >
                Back to login
              </button>
            </form>
          ) : (
            <Tabs defaultValue="login">
              <Button
                type="button"
                variant="outline"
                className="mb-4 w-full gap-2"
                disabled={loading}
                onClick={handleGoogle}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                  <path
                    fill="#4285F4"
                    d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.96-1.08 7.94-2.93l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.1A12 12 0 0 0 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.26a12 12 0 0 0 0 10.74l4.01-3.1Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.26 6.63l4.01 3.1C6.22 6.89 8.87 4.75 12 4.75Z"
                  />
                </svg>
                Continue with Google
              </Button>

              <div className="mb-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or use your email</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-5">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Login
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setResetMode(true)}
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-5">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input
                      id="su-name"
                      required
                      maxLength={100}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="su-username">Username</Label>
                      <Input
                        id="su-username"
                        maxLength={30}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="su-city">City</Label>
                      <Input
                        id="su-city"
                        maxLength={60}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-email">Email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-password">Password</Label>
                    <Input
                      id="su-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-ref">Referral code (optional)</Label>
                    <Input
                      id="su-ref"
                      maxLength={20}
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Create account
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Every new account starts with a wallet balance of Rs 0.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/winners" className="hover:text-foreground">
            View recent winners
          </Link>
        </p>
      </div>
    </div>
  );
}
