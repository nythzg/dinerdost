-- Optional web direction preserves the legacy boolean until settings are explicitly saved.
ALTER TABLE outlets ADD COLUMN web_rounding_mode_default text CHECK(web_rounding_mode_default IN ('NONE','UP','DOWN'));
ALTER TABLE order_rounds DROP CONSTRAINT order_rounds_rounding_mode_check;
ALTER TABLE order_rounds ADD CONSTRAINT order_rounds_rounding_mode_check CHECK(rounding_mode IN ('NEAREST','DOWN','UP'));
ALTER TABLE order_rounds DROP CONSTRAINT order_rounds_round_off_check;
ALTER TABLE order_rounds ADD CONSTRAINT order_rounds_round_off_check CHECK(
 (rounding_mode='NEAREST' AND round_off BETWEEN -50 AND 50) OR
 (rounding_mode='DOWN' AND round_off BETWEEN -99 AND 0) OR
 (rounding_mode='UP' AND round_off BETWEEN 0 AND 99));

CREATE TABLE web_discount_coupons (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL,
 code text NOT NULL CHECK(length(code) BETWEEN 1 AND 80),
 discount_amount bigint NOT NULL CHECK(discount_amount BETWEEN 1 AND 1000000000),
 valid_until date NOT NULL, expires_at timestamptz NOT NULL,
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 1000000),
 active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restro_id,outlet_id,id),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,created_by) REFERENCES employees(restro_id,id)
);
CREATE UNIQUE INDEX web_discount_coupon_code ON web_discount_coupons(restro_id,outlet_id,lower(code));
ALTER TABLE web_discount_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_discount_coupons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON web_discount_coupons
 USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid)
 WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON web_discount_coupons TO dinerdost_app;

-- Each use retains the existing reservation/lock/redemption lifecycle and financial links.
ALTER TABLE coupons ADD COLUMN web_discount_coupon_id uuid;
ALTER TABLE coupons ADD CONSTRAINT web_discount_coupon_scope
 FOREIGN KEY(restro_id,outlet_id,web_discount_coupon_id) REFERENCES web_discount_coupons(restro_id,outlet_id,id);
CREATE INDEX web_discount_coupon_uses ON coupons(web_discount_coupon_id,state,reserved_until);
