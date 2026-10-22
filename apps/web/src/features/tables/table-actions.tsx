"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useRef } from "react";
import { can } from "@dinerdost/core";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import {useRenameTable} from './rename-table';

export function TableActions({ table }: { table: Row }) {
  const rename=useRenameTable();
  const { data, form, run, busy } = useDesk(),
    menu = useRef<HTMLDetailsElement>(null);
  const members: Row[] = table.members ?? [table];
  useEffect(() => {
    const dismiss = (event: Event) => {
      const node = menu.current;
      if (node?.open && !node.contains(event.target as Node)) node.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, []);
  const sessions: Row[] = (data.sessions ?? []).filter((s: Row) =>
    members.some((t) => t.id === s.table_id),
  );
  const targets: Row[] = (data.sessions ?? []).filter(
    (s: Row) =>
      !members.some((t) => t.id === s.table_id) &&
      s.status === "OPEN" &&
      !s.parent_id &&
      !data.sessions.some((child: Row) => child.parent_id === s.id),
  );
  const roots = sessions.filter((s) => s.status === "OPEN" && !s.parent_id);
  const links: Row[] = (data.sessions ?? []).filter(
    (s: Row) =>
      s.parent_id &&
      (members.some((t) => t.id === s.table_id) ||
        sessions.some((parent) => parent.id === s.parent_id)),
  );
  const demerge = () => {
    void run("demerge", {
      parentId: links[0].parent_id,
      childId: links[0].id,
      all: true,
      sessionIds: sessions.map((s) => s.id),
      reason: "Staff separated all merged tables",
    }).catch(() => {});
  };
  const choose = (action: () => void) => {
    if (menu.current) menu.current.open = false;
    action();
  };
  const swap = () =>
    form(
      "Move / swap " + table.label,
      [
        {
          name: "targetTableId",
          label: "Destination table",
          type: "select",
          options: data.tables
            .filter((t: Row) => t.id !== table.id)
            .map((t: Row) => ({
              value: t.id,
              label:
                t.label +
                (t.is_occupied ? " · occupied, swap guests" : " · available"),
            })),
        },
        {
          name: "reason",
          label: "Reason",
          value: "Guest requested a different table",
        },
      ],
      (v) => run("exchangeTables", { ...v, sourceTableId: table.id }),
      "Move / swap",
    );
  const merge = () =>
    form(
      "Merge " + table.label,
      [
        {
          name: "parentId",
          label: "This table session",
          type: "select",
          value: roots[0]?.id,
          options: roots.map((s) => ({
            value: s.id,
            label: (s.table_label ?? table.label) + " · " + s.label,
          })),
        },
        {
          name: "childId",
          label: "Merge with",
          type: "select",
          value: targets[0]?.id,
          options: targets.map((s) => ({
            value: s.id,
            label: s.table_label + " · " + s.label,
          })),
        },
        {
          name: "reason",
          label: "Reason",
          value: "Guests requested a merged table group",
        },
      ],
      (v) => run("merge", v),
      "Merge tables",
    );
  return (
    <details
      ref={menu}
      className="table-actions-menu"
      onKeyDown={(e) => {
        if (e.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={"Actions for " + table.label} aria-haspopup="menu">
        ⋮
      </summary>
      <div role="menu" aria-label={table.label + " actions"}>
        {can(data.actor,'settings')&&members.map(member=><button key={member.id} role="menuitem" disabled={busy} onClick={()=>choose(()=>rename(member))}>Rename {member.label}</button>)}
        <button
          role="menuitem"
          disabled={!roots.length || !targets.length}
          onClick={() => choose(merge)}
        >
          <T>{"Merge tables"}</T>
        </button>
        {links.length > 0 && (
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => choose(demerge)}
          >
            <T>Demerge tables</T>
          </button>
        )}
        <button
          role="menuitem"
          disabled={!sessions.length || data.tables.length < 2}
          onClick={() => choose(swap)}
        >
          <T>{"Move / swap"}</T>
        </button>
        {can(data.actor, "settings") && (
          <button
            role="menuitem"
            className="danger-text"
            disabled={table.is_occupied}
            onClick={() =>
              choose(() =>
                form(
                  "Delete " + table.label,
                  [],
                  () =>
                    run("removeTable", {
                      tableId: table.id,
                      version: table.version,
                    }),
                  "Delete table",
                ),
              )
            }
          >
            <T>{"Delete table"}</T>
          </button>
        )}
      </div>
    </details>
  );
}
