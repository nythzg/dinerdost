-- Expand the available selling units; do not relabel existing menu/order snapshots.
ALTER TABLE menu_items DROP CONSTRAINT menu_items_unit_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_unit_check CHECK(unit IN ('portion','piece','kg','L','peg'));
