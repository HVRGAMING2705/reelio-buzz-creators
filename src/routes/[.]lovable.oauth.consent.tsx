import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta namespace on @supabase/supabase-js — narrow typed wrapper so TS is happy.
type OAuthResult = { redirect_url?: string; redirect_to?: string; client?: { name?: string } };
type OAuthAPI = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthAPI }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center p-6 bg-[color:var(--reelio-black,#0b0b0d)] text-white">
      <div className="glass rounded-3xl p-8 max-w-md text-sm">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="min-h-screen grid place-items-center p-4 bg-[color:var(--reelio-black,#0b0b0d)] text-white">
      <div className="w-full max-w-md glass rounded-3xl p-8 conic-border">
        <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Reelio · Authorize</p>
        <h1 className="mt-2 text-3xl leading-tight">
          Connect <span className="text-[color:var(--reelio-red,#e11d1d)]">{clientName}</span> to your account
        </h1>
        <p className="mt-3 text-sm opacity-80">
          {clientName} will be able to call Reelio's enabled tools while you're signed in.
        </p>
        <ul className="mt-6 space-y-2 text-sm opacity-90">
          <li>· Share your basic profile</li>
          <li>· Share your email address</li>
          <li>· Access Reelio tools you have permission for</li>
        </ul>
        <p className="mt-6 text-[11px] opacity-60">
          This does not bypass Reelio's permissions or backend policies.
        </p>

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-8 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-full bg-white text-[color:var(--reelio-black,#0b0b0d)] px-6 py-3 uppercase tracking-[0.2em] text-xs disabled:opacity-60"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-full border border-white/20 bg-white/5 px-6 py-3 uppercase tracking-[0.2em] text-xs hover:bg-white/10 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
