ALTER TABLE dining_tables ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE menu_items ADD COLUMN image_url text NOT NULL DEFAULT '';
