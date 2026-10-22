-- Existing rounds retain their historical preparation policy (NULL means legacy).
ALTER TABLE outlets ADD COLUMN web_kitchen_stages_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE order_rounds ADD COLUMN web_kitchen_stages_enabled boolean;
