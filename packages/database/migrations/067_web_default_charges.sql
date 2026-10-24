ALTER TABLE outlets ADD COLUMN web_default_charges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(web_default_charges)='array' AND jsonb_array_length(web_default_charges)<=20);
