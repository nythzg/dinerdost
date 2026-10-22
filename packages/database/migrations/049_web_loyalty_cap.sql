-- New web claims share a per-order cap. Historical discounts/reservations are untouched.
ALTER TABLE outlets ADD COLUMN web_loyalty_cap_paise bigint NOT NULL DEFAULT 5000 CHECK(web_loyalty_cap_paise BETWEEN 0 AND 1000000000);
