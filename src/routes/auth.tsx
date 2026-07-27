import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — Reelio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await router.invalidate();
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      await router.invalidate();
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-[color:var(--reelio-black,#0b0b0d)] text-white">
      <div className="w-full max-w-md glass rounded-3xl p-8 conic-border">
        <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Reelio Admin</p>
        <h1 className="mt-2 text-4xl">{mode === "signin" ? "Sign in" : "Create admin"}</h1>
        <p className="mt-2 text-sm opacity-70">
          {mode === "signin"
            ? "Access the bookings dashboard."
            : "First sign-up becomes admin automatically."}
        </p>

        <form onSubmit={submit} className="mt-8 grid gap-4">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] opacity-80 mb-2">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-glass"
              placeholder="you@brand.com"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] opacity-80 mb-2">Password</span>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-glass"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-white text-[color:var(--reelio-black,#0b0b0d)] px-7 py-4 uppercase tracking-[0.2em] text-xs disabled:opacity-60"
          >
            {loading ? "…" : mode === "signin" ? "Sign in →" : "Create account →"}
          </button>

          <div className="relative flex items-center justify-center gap-3 py-2">
            <div className="h-px flex-1 bg-white/20" />
            <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">or</span>
            <div className="h-px flex-1 bg-white/20" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/20 bg-white/5 px-6 py-4 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs uppercase tracking-[0.2em] opacity-70 hover:opacity-100"
          >
            {mode === "signin" ? "Need to create the admin account?" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
