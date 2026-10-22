-- A future-transaction web preference; existing rounds and issued documents are untouched.
ALTER TABLE outlets ADD COLUMN web_round_down_default boolean NOT NULL DEFAULT false;
