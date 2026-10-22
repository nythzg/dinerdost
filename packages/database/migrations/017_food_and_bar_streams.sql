-- Routing metadata never changes item prices, issued documents or ticket states.
ALTER TABLE order_items ADD COLUMN production_stream text NOT NULL DEFAULT 'FOOD' CHECK(production_stream IN ('FOOD','BAR'));
UPDATE order_items i SET production_stream='BAR' FROM menu_items m
  WHERE m.id=i.item_id AND m.restro_id=i.restro_id AND (m.unit='peg' OR lower(i.station)='bar');
ALTER TABLE kot_tickets ADD COLUMN production_stream text NOT NULL DEFAULT 'LEGACY' CHECK(production_stream IN ('FOOD','BAR','LEGACY'));
UPDATE kot_tickets k SET production_stream=(
  SELECT CASE WHEN count(DISTINCT i.production_stream)=1 THEN min(i.production_stream) ELSE 'LEGACY' END
  FROM order_items i WHERE i.round_id=k.round_id AND i.restro_id=k.restro_id AND i.station=k.station
);
ALTER TABLE kot_tickets DROP CONSTRAINT kot_tickets_round_id_station_key;
ALTER TABLE kot_tickets ADD CONSTRAINT one_station_stream_ticket UNIQUE(round_id,station,production_stream);
CREATE INDEX kitchen_stream_queue ON kot_tickets(outlet_id,production_stream,status,created_at);
