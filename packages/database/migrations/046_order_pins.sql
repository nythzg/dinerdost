CREATE TABLE order_pins (
 restro_id uuid NOT NULL,order_id uuid PRIMARY KEY,pinned boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 0,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,updated_by) REFERENCES employees(restro_id,id)
);
ALTER TABLE order_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON order_pins USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON order_pins TO dinerdost_app;
