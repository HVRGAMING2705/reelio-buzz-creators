import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
