-- Existing menu prices and issued order snapshots remain unchanged.
ALTER TABLE menu_items ADD COLUMN guest_best_choice boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN compare_at_price bigint CHECK(compare_at_price IS NULL OR (compare_at_price>price AND compare_at_price<=1000000000));
