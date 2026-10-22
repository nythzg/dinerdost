ALTER TABLE outlets ADD COLUMN point_value_paise integer NOT NULL DEFAULT 100;
ALTER TABLE outlets ADD COLUMN max_redemption_bps integer NOT NULL DEFAULT 2500;
ALTER TABLE outlets ADD COLUMN max_redemption_paise bigint NOT NULL DEFAULT 25000;
CREATE TABLE loyalty_reservations (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 customer_id uuid NOT NULL, round_id uuid NOT NULL, points bigint NOT NULL CHECK(points>0),
 state text NOT NULL DEFAULT 'RESERVED', reserved_until timestamptz,
 FOREIGN KEY(restro_id,customer_id) REFERENCES customers(restro_id,id),
 FOREIGN KEY(restro_id,round_id) REFERENCES order_rounds(restro_id,id), UNIQUE(round_id)
);
ALTER TABLE loyalty_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON loyalty_reservations USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON loyalty_reservations TO dinerdost_app;
