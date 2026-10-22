"use client";
import { T } from "@/lib/staff-language";
import { useCallback, useEffect, useState } from "react";
import {ReadyElapsed} from "@/components/ready-elapsed";
import { Empty, Icon } from "@/components/ui";
import { request, date, type Row } from "@/lib/client";
import { useDesk } from "./context";
export function NotificationBell() {
  const { data, modal } = useDesk(),
    [unread, setUnread] = useState(0),
    load = useCallback(async () => {
      try {
        const value = await request(
          "/api/notifications?outlet=" + data.outletId,
        );
        setUnread(value.unread);
      } catch {}
    }, [data.outletId, data.actor.role]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  return (
    <button
      className="icon-button notification-bell"
      aria-label={"Notifications" + (unread ? " · " + unread + " unread" : "")}
      title="Notifications"
      onClick={() =>
        modal(
          "Notifications",
          <NotificationInbox outletId={data.outletId} changed={load} />,
        )
      }
    >
      <Icon name="bell" />
      {unread > 0 && (
        <span className="unread-count">{unread > 99 ? "99+" : unread}</span>
      )}
    </button>
  );
}
function NotificationInbox({
  outletId,
  changed,
}: {
  outletId: string;
  changed: () => Promise<void>;
}) {
  const { go, close, refresh } = useDesk(),
    [inbox, setInbox] = useState<Row | null>(null),
    [items, setItems] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async (before?: number) => {
    setBusy(true);
    try {
      const value = await request(
        "/api/notifications?outlet=" +
          outletId +
          (before ? "&before=" + before : ""),
      );
      setInbox((previous) =>
        before ? { ...value, latest: previous?.latest ?? value.latest } : value,
      );
      setItems((previous) =>
        before
          ? [
              ...previous,
              ...value.items.filter(
                (item: Row) => !previous.some((row) => row.id === item.id),
              ),
            ]
          : value.items,
      );
      setError("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [outletId]);
  const mark = async (input: Row) => {
    await request("/api/notifications", {
      method: "POST",
      body: JSON.stringify({ outletId, ...input }),
    });
    await changed();
  };
  return (
    <div className="notification-inbox">
      <div className="inline-actions">
        <button
          className="button small"
          disabled={busy}
          onClick={() => void load()}
        >
          <T>{"Refresh"}</T>
        </button>
        <button
          className="button small"
          disabled={busy || !inbox?.unread}
          onClick={async () => {
            setBusy(true);
            try {
              await mark({ through: inbox!.latest });
              await load();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <T>{"Mark all read"}</T>
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!inbox && busy && <p role="status">Loading…</p>}
      {items.length ? (
        <div className="notification-list">
          {items.map((item) => (
            <button
              key={item.id}
              className={item.read ? "is-read" : ""}
              onClick={async () => {
                try {
                  await mark({ ids: [item.id] });
                  if (item.kind === "ORDER_READY" && item.path === "/app/tasks#ready-orders")
                    await refresh();
                  close();
                  go(item.path);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{date(item.createdAt)}</small>{item.kind==="ORDER_READY"&&<ReadyElapsed at={item.createdAt} label="Marked ready"/>}
              </span>
              {!item.read && <i aria-label="Unread" />}
            </button>
          ))}
        </div>
      ) : (
        inbox && <Empty>No notifications yet.</Empty>
      )}
      {inbox?.next && (
        <button
          className="button full-width"
          disabled={busy}
          onClick={() => void load(inbox.next)}
        >
          Older notifications
        </button>
      )}
    </div>
  );
}
