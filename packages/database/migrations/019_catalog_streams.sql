ALTER TABLE ingredients ADD COLUMN production_stream text NOT NULL DEFAULT 'FOOD' CHECK(production_stream IN ('FOOD','BAR'));
UPDATE ingredients SET production_stream='BAR' WHERE category='LIQUOR';
ALTER TABLE menu_items ADD COLUMN production_stream text NOT NULL DEFAULT 'FOOD' CHECK(production_stream IN ('FOOD','BAR'));
UPDATE menu_items SET production_stream='BAR' WHERE unit='peg' OR lower(station)='bar';
