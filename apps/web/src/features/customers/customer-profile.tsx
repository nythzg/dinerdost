"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useState } from "react";
import { Badge, Empty, Form } from "@/components/ui";
import { date, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function CustomerProfile({
  customerId,
  outletId,
}: {
  customerId: string;
  outletId: string;
}) {
  const { run, close, busy, notify } = useDesk();
  const [profile, setProfile] = useState<Row | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void request(`/api/customers/${customerId}?outlet=${outletId}`, {
      signal: abort.signal,
    })
      .then(setProfile)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [customerId, outletId]);
  if (!profile)
    return error ? (
      <p className="error">{error}</p>
    ) : (
      <Empty>Loading customer…</Empty>
    );
  if (editing)
    return (
      <Form
        busy={busy}
        fields={[
          { name: "name", label: "Customer name", value: profile.name },
          {
            name: "phone",
            label: "Customer phone",
            type: "tel",
            value: profile.phone,
          },
        ]}
        onSubmit={async (values) => {
          try {
            await run("customerProfile", {
              ...values,
              customerId,
              outletId,
              version: profile.version,
            });
            notify("Customer updated. Points stay with this account.");
            close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="detail-list">
          <div>
            <span>Account ID</span>
            <code>{profile.id}</code>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Form>
    );
  return (
    <div className="customer-profile">
      <div className="detail-list">
        <div>
          <span>
            <T>{"Name"}</T>
          </span>
          <strong>{profile.name}</strong>
        </div>
        <div>
          <span>
            <T>{"Phone"}</T>
          </span>
          <strong>{profile.phone}</strong>
        </div>
        <div>
          <span>Phone status</span>
          <Badge value={profile.otp_verified ? "VERIFIED" : "CAPTURED"} />
        </div>
        <div>
          <span>Available points</span>
          <strong>{profile.availablePoints}</strong>
        </div>
        <div>
          <span>Account ID</span>
          <code>{profile.id}</code>
        </div>
        <div>
          <span>Joined</span>
          <span>{date(profile.created_at)}</span>
        </div>
      </div>
      {profile.canEdit && (
        <button className="button" onClick={() => setEditing(true)}>
          Edit customer
        </button>
      )}
    </div>
  );
}
