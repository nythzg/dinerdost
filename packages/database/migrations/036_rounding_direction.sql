-- Existing rounds retain their original rounding rule. New web adjustments explicitly choose DOWN.
ALTER TABLE order_rounds ADD COLUMN rounding_mode text NOT NULL DEFAULT 'NEAREST' CHECK(rounding_mode IN ('NEAREST','DOWN'));
ALTER TABLE order_rounds DROP CONSTRAINT order_rounds_round_off_check;
ALTER TABLE order_rounds ADD CONSTRAINT order_rounds_round_off_check CHECK((rounding_mode='NEAREST' AND round_off BETWEEN -50 AND 50) OR (rounding_mode='DOWN' AND round_off BETWEEN -99 AND 0));
