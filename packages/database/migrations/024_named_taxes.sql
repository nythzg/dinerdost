ALTER TABLE outlets ADD COLUMN tax_components jsonb CHECK(tax_components IS NULL OR (jsonb_typeof(tax_components)='array' AND jsonb_array_length(tax_components)<=10));
ALTER TABLE orders ADD COLUMN tax_components jsonb;
CREATE FUNCTION snapshot_order_taxes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE configured jsonb;
BEGIN
 SELECT tax_components INTO configured FROM outlets WHERE id=NEW.outlet_id AND restro_id=NEW.restro_id FOR SHARE;
 IF configured IS NOT NULL THEN
   NEW.tax_components:=configured;
   SELECT coalesce(sum((rule->>'rateBps')::integer),0) INTO NEW.tax_bps_override FROM jsonb_array_elements(configured) rule;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_tax_snapshot BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION snapshot_order_taxes();
