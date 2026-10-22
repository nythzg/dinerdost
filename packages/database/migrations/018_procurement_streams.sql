ALTER TABLE records ADD COLUMN production_stream text CHECK(production_stream IN ('FOOD','BAR'));
UPDATE records SET production_stream='FOOD' WHERE kind IN ('vendors','purchases','expenses');
CREATE INDEX records_stream ON records(outlet_id,kind,production_stream);
