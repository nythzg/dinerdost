ALTER TABLE ingredients ADD COLUMN retired_at timestamptz;
-- Receipt rates remain frozen; only explicitly revalued remaining stock uses this balance.
ALTER TABLE stock_batches ADD COLUMN remaining_value bigint CHECK(remaining_value IS NULL OR (remaining_value>=0 AND (on_hand>0 OR remaining_value=0)));
CREATE TABLE stock_value_adjustments (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, ingredient_id uuid NOT NULL,
 quantity_milli bigint NOT NULL CHECK(quantity_milli>0), value_before bigint NOT NULL CHECK(value_before>=0),
 value_after bigint NOT NULL CHECK(value_after>=0), batches jsonb NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,actor_id) REFERENCES employees(restro_id,id)
);
ALTER TABLE stock_value_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_value_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON stock_value_adjustments USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON stock_value_adjustments TO dinerdost_app;
CREATE TRIGGER immutable_stock_value_adjustment BEFORE UPDATE OR DELETE OR TRUNCATE ON stock_value_adjustments FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
