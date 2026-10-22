ALTER TABLE ingredients ADD COLUMN semi_finished boolean NOT NULL DEFAULT false;
CREATE TABLE web_production_recipes (
 ingredient_id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 yield_milli bigint NOT NULL CHECK(yield_milli>0), ingredients jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
CREATE TABLE web_production_batches (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, ingredient_id uuid NOT NULL,
 output_batch_id uuid UNIQUE, batch_number text NOT NULL, planned_milli bigint NOT NULL CHECK(planned_milli>0),
 actual_milli bigint NOT NULL CHECK(actual_milli>=0), cost bigint NOT NULL CHECK(cost>=0),
 snapshot jsonb NOT NULL, reason text NOT NULL, recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restro_id,id), UNIQUE(ingredient_id,batch_number),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,output_batch_id) REFERENCES stock_batches(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,recorded_by) REFERENCES employees(restro_id,id)
);
ALTER TABLE stock_movements ADD COLUMN production_batch_id uuid;
ALTER TABLE stock_movements ADD FOREIGN KEY(restro_id,production_batch_id) REFERENCES web_production_batches(restro_id,id);
ALTER TABLE web_production_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_production_recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE web_production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_production_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON web_production_recipes
 USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
CREATE POLICY tenant_scope ON web_production_batches
 USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON web_production_recipes TO dinerdost_app;
GRANT SELECT,INSERT ON web_production_batches TO dinerdost_app;
CREATE TRIGGER immutable_production_batches BEFORE UPDATE OR DELETE OR TRUNCATE ON web_production_batches
 FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
