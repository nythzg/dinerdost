-- Physical observations are separate from stock movements and financial balances.
CREATE TABLE daily_stock_counts (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 ingredient_id uuid NOT NULL, business_date date NOT NULL,
 phase text NOT NULL CHECK(phase IN ('OPENING','CLOSING')),
 quantity_milli bigint NOT NULL CHECK(quantity_milli BETWEEN 0 AND 1000000000),
 version integer NOT NULL CHECK(version>0),
 ledger_total bigint NOT NULL, recipe_total bigint NOT NULL,
 receipt_total bigint NOT NULL, waste_total bigint NOT NULL,
 system_on_hand bigint NOT NULL CHECK(system_on_hand>=0),
 effective_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid NOT NULL, note text NOT NULL,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,actor_id) REFERENCES employees(restro_id,id),
 UNIQUE(ingredient_id,business_date,phase,version)
);
CREATE INDEX daily_stock_count_lookup ON daily_stock_counts(outlet_id,business_date,ingredient_id,phase,version DESC);
ALTER TABLE daily_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stock_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON daily_stock_counts USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON daily_stock_counts TO dinerdost_app;
CREATE TRIGGER immutable_daily_stock_counts BEFORE UPDATE OR DELETE OR TRUNCATE ON daily_stock_counts FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
