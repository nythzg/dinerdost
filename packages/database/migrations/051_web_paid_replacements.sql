-- A payment credit is a traced allocation, never a second payment_attempt.
CREATE TABLE web_replacements (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 source_order_id uuid NOT NULL UNIQUE, target_order_id uuid NOT NULL UNIQUE,
 source_invoice_id uuid, amount bigint NOT NULL CHECK(amount>0),
 original_payable bigint NOT NULL CHECK(original_payable>=amount),
 allocations jsonb NOT NULL, snapshot jsonb NOT NULL,
 net_sales bigint NOT NULL, tax bigint NOT NULL, charges bigint NOT NULL, round_off bigint NOT NULL,
 unbilled_cogs bigint NOT NULL CHECK(unbilled_cogs>=0),
 reason text NOT NULL, recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_order_id<>target_order_id), UNIQUE(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,source_order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,target_order_id) REFERENCES orders(restro_id,id),
 FOREIGN KEY(restro_id,source_invoice_id) REFERENCES invoices(restro_id,id),
 FOREIGN KEY(restro_id,recorded_by) REFERENCES employees(restro_id,id)
);
ALTER TABLE web_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_replacements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON web_replacements
 USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON web_replacements TO dinerdost_app;
CREATE TRIGGER immutable_web_replacements BEFORE UPDATE OR DELETE OR TRUNCATE ON web_replacements
 FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
