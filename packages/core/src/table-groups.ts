type Table = { id: string; label: string };
type Session = {
  id: string;
  table_id: string;
  parent_id?: string | null;
  status?: string;
};

/** Build display groups from current, already-authorized sessions without changing visits. */
export function diningTableGroups<T extends Table>(
  tables: T[],
  sessions: Session[],
) {
  const active = sessions.filter((s) => s.status !== "CLOSED");
  const bySession = new Map(active.map((s) => [s.id, s]));
  const parents = new Map(tables.map((t) => [t.id, t.id]));
  const root = (id: string): string => {
    const parent = parents.get(id)!;
    return parent === id ? id : root(parent);
  };
  for (const session of active) {
    const parent = session.parent_id && bySession.get(session.parent_id);
    if (parent && parents.has(parent.table_id) && parents.has(session.table_id))
      parents.set(root(session.table_id), root(parent.table_id));
  }
  const groups = new Map<string, T[]>();
  for (const table of tables) {
    const key = root(table.id);
    groups.set(key, [...(groups.get(key) ?? []), table]);
  }
  return [...groups.entries()].map(([rootId, members]) => {
    const table = members.find((t) => t.id === rootId)!;
    const ordered = [
      table,
      ...members
        .filter((t) => t.id !== table.id)
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true }),
        ),
    ];
    return {
      table,
      members: ordered,
      label: ordered.map((t) => t.label).join(" & "),
    };
  });
}
