-- Only the fields and records needed by the client feedback queue.
ALTER TABLE outlets ADD COLUMN qr_auto_activate boolean NOT NULL DEFAULT false;
ALTER TABLE outlets ADD COLUMN payment_methods text[] NOT NULL DEFAULT ARRAY['CASH','MANUAL_UPI'];
ALTER TABLE outlets ADD CONSTRAINT configured_payment_methods CHECK (
  cardinality(payment_methods) > 0 AND payment_methods <@ ARRAY['CASH','MANUAL_UPI','UPI_QR','UPI_PHONE','CARD','ONLINE']::text[]
);
ALTER TABLE service_requests ADD COLUMN rejection_reason text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX verified_digital_receipt ON payment_attempts(restro_id,lower(reference)) WHERE state='VERIFIED' AND method<>'CASH' AND reference IS NOT NULL;

CREATE TABLE menu_categories (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 name text NOT NULL, version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id), UNIQUE(outlet_id,name)
);
CREATE UNIQUE INDEX menu_category_name ON menu_categories(outlet_id,lower(name));
INSERT INTO menu_categories(id,restro_id,outlet_id,name)
SELECT DISTINCT ON(outlet_id,lower(category)) gen_random_uuid(),restro_id,outlet_id,category FROM menu_items ORDER BY outlet_id,lower(category),category;

CREATE TABLE table_reservations (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, table_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, guests integer NOT NULL CHECK(guests BETWEEN 1 AND 100),
 state text NOT NULL DEFAULT 'HELD' CHECK(state IN ('HELD','SEATED','CANCELLED','COMPLETED')),
 session_id uuid, CHECK(ends_at>starts_at),
 FOREIGN KEY(restro_id,id) REFERENCES records(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,table_id) REFERENCES dining_tables(restro_id,id),
 FOREIGN KEY(restro_id,session_id) REFERENCES table_sessions(restro_id,id), UNIQUE(restro_id,id)
);
CREATE INDEX table_booking_window ON table_reservations(table_id,starts_at,ends_at) WHERE state IN ('HELD','SEATED');

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON menu_categories USING(restro_id=current_setting('app.restro_id',true)::uuid) WITH CHECK(restro_id=current_setting('app.restro_id',true)::uuid);
ALTER TABLE table_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON table_reservations USING(restro_id=current_setting('app.restro_id',true)::uuid) WITH CHECK(restro_id=current_setting('app.restro_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON menu_categories,table_reservations TO dinerdost_app;
