ALTER TABLE ingredients ADD COLUMN purchase_rate bigint CHECK(purchase_rate BETWEEN 0 AND 100000000);
ALTER TABLE stock_batches ADD COLUMN expires_at timestamptz;
ALTER TABLE outlets ADD COLUMN kot_print_mode text NOT NULL DEFAULT 'OFF' CHECK(kot_print_mode IN ('OFF','MANUAL','AUTO'));
ALTER TABLE kot_tickets ADD COLUMN auto_print_requested_at timestamptz;
CREATE INDEX stock_expiry_time ON stock_batches(outlet_id,expires_at) WHERE on_hand>0;
