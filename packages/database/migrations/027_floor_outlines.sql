ALTER TABLE floor_plans ADD COLUMN outline jsonb;
ALTER TABLE floor_plans ADD CONSTRAINT floor_outline_array CHECK(outline IS NULL OR (jsonb_typeof(outline)='array' AND jsonb_array_length(outline) BETWEEN 3 AND 24));
