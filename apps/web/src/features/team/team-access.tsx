"use client";
import { useState } from "react";
import { type Row } from "@/lib/client";
export const staffRoles = [
  "MANAGER",
  "CASHIER",
  "WAITER",
  "KITCHEN",
  "BARTENDER",
  "ACCOUNTANT",
];
export const roleName = (role: string) =>
  role === "KITCHEN" ? "Chef" : role[0] + role.slice(1).toLowerCase();

export function StaffAccessEditor({
  member,
  outlets,
  outletId,
  save,
  templates=[],
}: {
  templates?: Row[];
  member?: Row;
  outlets: Row[];
  outletId: string;
  save: (input: Row) => Promise<unknown>;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState("");
  const [role, setRole] = useState(member?.role ?? "WAITER");
  const [outletIds, setOutletIds] = useState<string[]>(
    member?.outlet_ids ?? [outletId],
  );
  const [active, setActive] = useState(member?.active ?? true),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void save({
          role,
          outletIds,
          ...(member
            ? { active, password, version: member.version }
            : { name, email }),
        })
          .catch((error) => setError(error.message))
          .finally(() => setBusy(false));
      }}
    >
      {!member && (
        <>
          <label className="field">
            Full name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Sign-in email
            <input
              type="email"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </>
      )}
      {templates.length>0&&<label className="field">Onboarding role template<select defaultValue="" onChange={e=>{if(e.target.value)setRole(e.target.value)}}><option value="">Choose a saved template…</option>{templates.filter(t=>staffRoles.includes(t.role)).map(t=><option key={t.id} value={t.role}>{t.name} · {t.notes}</option>)}</select></label>}
      <label className="field">
        Role
        <select
          aria-label="Role"
          value={role}
          disabled={busy}
          onChange={(event) => setRole(event.target.value)}
        >
          {staffRoles.map((role) => (
            <option key={role} value={role}>
              {roleName(role)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="team-outlet-choices">
        <legend>Outlet access</legend>
        {outlets.map((outlet) => (
          <label key={outlet.id}>
            <input
              type="checkbox"
              checked={outletIds.includes(outlet.id)}
              disabled={busy}
              onChange={(event) =>
                setOutletIds((previous) =>
                  event.target.checked
                    ? [...previous, outlet.id]
                    : previous.filter((id) => id !== outlet.id),
                )
              }
            />
            {outlet.name}
          </label>
        ))}
      </fieldset>
      {member && (
        <>
          <label className="team-access-toggle">
            <input
              type="checkbox"
              checked={active}
              disabled={busy}
              onChange={(event) => setActive(event.target.checked)}
            />
            Account enabled
          </label>
          <label className="field">
            Confirm your password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy || !outletIds.length}>
        {busy ? "Saving…" : member ? "Save access" : "Create invite"}
      </button>
    </form>
  );
}

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="form">
      <label className="field">
        Invite link
        <input
          aria-label="Invite link"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <button
        className="button primary"
        onClick={() =>
          void navigator.clipboard
            .writeText(url)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <small className="muted">
        Valid for 7 days. Staff choose their own password.
      </small>
    </div>
  );
}
