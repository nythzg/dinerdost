ALTER TABLE ingredients ADD COLUMN material_category text NOT NULL DEFAULT '' CHECK(length(material_category)<=80);
ALTER TABLE ingredients ADD COLUMN material_code text NOT NULL DEFAULT '' CHECK(length(material_code)<=40);
ALTER TABLE ingredients ADD COLUMN hsn_code text NOT NULL DEFAULT '' CHECK(length(hsn_code)<=20);
ALTER TABLE ingredients ADD COLUMN measured_yield_bps integer CHECK(measured_yield_bps BETWEEN 1 AND 10000);
CREATE UNIQUE INDEX material_code_per_outlet ON ingredients(outlet_id,lower(material_code)) WHERE material_code<>'' AND retired_at IS NULL;
CREATE TABLE ingredient_purchase_packs(
 id uuid PRIMARY KEY,restro_id uuid NOT NULL,outlet_id uuid NOT NULL,ingredient_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60),factor_milli bigint NOT NULL CHECK(factor_milli BETWEEN 1 AND 1000000000),
 version integer NOT NULL DEFAULT 1,active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(restro_id,ingredient_id) REFERENCES ingredients(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id)
);
CREATE UNIQUE INDEX active_pack_name ON ingredient_purchase_packs(ingredient_id,lower(name)) WHERE active;
ALTER TABLE ingredient_purchase_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_purchase_packs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON ingredient_purchase_packs USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON ingredient_purchase_packs TO dinerdost_app;
ALTER TABLE stock_batches ADD COLUMN purchase_pack_snapshot jsonb CHECK(purchase_pack_snapshot IS NULL OR jsonb_typeof(purchase_pack_snapshot)='object');
