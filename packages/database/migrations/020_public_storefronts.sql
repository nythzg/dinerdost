CREATE TABLE storefronts (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, brand_id uuid,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 published boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,brand_id) REFERENCES records(restro_id,id),
 UNIQUE(restro_id,id), UNIQUE(outlet_id,brand_id)
);
CREATE TABLE storefront_visits (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, storefront_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE, device_hash text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',
 FOREIGN KEY(restro_id,storefront_id) REFERENCES storefronts(restro_id,id), UNIQUE(restro_id,id)
);
CREATE TABLE storefront_orders (
 restro_id uuid NOT NULL, visit_id uuid NOT NULL, order_id uuid PRIMARY KEY,
 FOREIGN KEY(restro_id,visit_id) REFERENCES storefront_visits(restro_id,id),
 FOREIGN KEY(restro_id,order_id) REFERENCES orders(restro_id,id)
);
ALTER TABLE storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefronts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON storefronts USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
ALTER TABLE storefront_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON storefront_visits USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
ALTER TABLE storefront_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON storefront_orders USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON storefronts,storefront_visits TO dinerdost_app;
GRANT SELECT,INSERT ON storefront_orders TO dinerdost_app;
