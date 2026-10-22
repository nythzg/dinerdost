ALTER TABLE order_items ADD COLUMN unit_snapshot text;
ALTER TABLE order_items ADD CONSTRAINT order_item_tenant_identity UNIQUE(restro_id,id);
CREATE TABLE round_ingredient_needs (
 restro_id uuid NOT NULL, outlet_id uuid NOT NULL, round_id uuid NOT NULL,
 order_item_id uuid NOT NULL, ingredient_id uuid NOT NULL, quantity_milli bigint NOT NULL CHECK(quantity_milli>=0),
 PRIMARY KEY(order_item_id,ingredient_id),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,order_item_id) REFERENCES order_items(restro_id,id),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
CREATE TABLE order_item_costs (
 restro_id uuid NOT NULL, outlet_id uuid NOT NULL, round_id uuid NOT NULL, order_item_id uuid PRIMARY KEY,
 cost bigint CHECK(cost>=0), recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id),
 FOREIGN KEY(restro_id,order_item_id) REFERENCES order_items(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
ALTER TABLE round_ingredient_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_ingredient_needs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON round_ingredient_needs USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
ALTER TABLE order_item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_costs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON order_item_costs USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON round_ingredient_needs TO dinerdost_app;
GRANT SELECT,INSERT ON order_item_costs TO dinerdost_app;
CREATE TRIGGER immutable_item_cost BEFORE UPDATE OR DELETE OR TRUNCATE ON order_item_costs FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
