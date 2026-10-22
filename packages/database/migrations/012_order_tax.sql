ALTER TABLE orders ADD COLUMN tax_bps_override integer
  CHECK(tax_bps_override BETWEEN 0 AND 10000);
ALTER TABLE order_rounds ADD COLUMN charges jsonb NOT NULL DEFAULT '[]'
  CHECK(jsonb_typeof(charges)='array');
ALTER TABLE order_rounds ADD COLUMN charges_total bigint NOT NULL DEFAULT 0
  CHECK(charges_total BETWEEN 0 AND 1000000000);
