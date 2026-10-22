-- An archived physical table retains its identity/history while its label can be reused.
ALTER TABLE dining_tables DROP CONSTRAINT dining_tables_outlet_id_label_key;
CREATE UNIQUE INDEX active_dining_table_label ON dining_tables(outlet_id,label) WHERE retired_at IS NULL;
