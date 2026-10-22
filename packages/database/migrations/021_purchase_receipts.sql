CREATE TABLE purchase_receipts (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, purchase_id uuid NOT NULL UNIQUE,
 reference text NOT NULL, lines jsonb NOT NULL, received_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,purchase_id) REFERENCES records(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,received_by) REFERENCES employees(restro_id,id), UNIQUE(restro_id,id)
);
ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON purchase_receipts USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON purchase_receipts TO dinerdost_app;
CREATE TRIGGER immutable_purchase_receipt BEFORE UPDATE OR DELETE OR TRUNCATE ON purchase_receipts FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
