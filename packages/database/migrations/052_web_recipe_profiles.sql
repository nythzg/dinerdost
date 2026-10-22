CREATE TABLE web_recipe_profiles (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, item_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('RECIPE','ADDON','PACKAGING')),
 option_id text NOT NULL DEFAULT '', channel text NOT NULL CHECK(channel IN ('ALL','DINE_IN','TAKEAWAY','DELIVERY')),
 ingredients jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(item_id,kind,option_id,channel), UNIQUE(restro_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,item_id) REFERENCES menu_items(restro_id,id)
);
ALTER TABLE web_recipe_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_recipe_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON web_recipe_profiles
 USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON web_recipe_profiles TO dinerdost_app;
ALTER TABLE order_items ADD COLUMN recipe_snapshot jsonb;
-- Existing records deliberately remain NULL; no current recipe is attributed to history.
