"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Empty, Logo } from "@/components/ui";
import { request, type Row } from "@/lib/client";
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Row | null>(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void request("/api/invites/" + token)
      .then((result) => {
        setInvite(result);
        setName(result.name);
      })
      .catch((error) => setError(error.message));
  }, [token]);
  return (
    <main className="invite-shell">
      <Logo />
      <section className="panel invite-panel">
        {!invite ? (
          error ? (
            <Empty
              action={
                <Link className="button" href="/signin">
                  Sign in
                </Link>
              }
            >
              {error}
            </Empty>
          ) : (
            <div className="loader" />
          )
        ) : (
          <>
            <h1>Join {invite.restaurant}</h1>
            <p>{invite.email}</p>
            <Badge value={invite.role === "KITCHEN" ? "CHEF" : invite.role} />
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                void request("/api/invites/" + token, {
                  method: "POST",
                  body: JSON.stringify({ name, password }),
                })
                  .then(() => {
                    router.push("/app/overview");
                    router.refresh();
                  })
                  .catch((error) => {
                    setError(error.message);
                    setBusy(false);
                  });
              }}
            >
              <label className="field">
                Full name
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                Create password
                <input
                  aria-label="Create password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <small>At least 12 characters</small>
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? "Joining…" : "Join team"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
