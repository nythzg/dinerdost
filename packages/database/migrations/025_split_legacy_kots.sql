-- Split pre-v2 mixed display tickets without changing payment, order or item snapshots.
-- Already issued tickets may belong to served/settled rounds. The normal insert
-- gate only accepts current authorizations. Suspend it under this migration's
-- table lock, copy existing routing metadata, then restore it before commit.
ALTER TABLE kot_tickets DISABLE TRIGGER enforce_kot_authority;
INSERT INTO kot_tickets(id,restro_id,outlet_id,order_id,round_id,station,status,created_at,updated_at,production_stream)
SELECT gen_random_uuid(),k.restro_id,k.outlet_id,k.order_id,k.round_id,k.station,k.status,k.created_at,k.updated_at,'BAR'
FROM kot_tickets k WHERE k.production_stream='LEGACY'
AND EXISTS(SELECT 1 FROM order_items i WHERE i.round_id=k.round_id AND i.station=k.station AND i.production_stream='BAR')
AND EXISTS(SELECT 1 FROM order_items i WHERE i.round_id=k.round_id AND i.station=k.station AND i.production_stream='FOOD')
ON CONFLICT(round_id,station,production_stream) DO NOTHING;
UPDATE kot_tickets k SET production_stream='FOOD' WHERE k.production_stream='LEGACY'
AND EXISTS(SELECT 1 FROM order_items i WHERE i.round_id=k.round_id AND i.station=k.station AND i.production_stream='FOOD');
UPDATE kot_tickets k SET production_stream='BAR' WHERE k.production_stream='LEGACY'
AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.round_id=k.round_id AND i.station=k.station AND i.production_stream='FOOD')
AND EXISTS(SELECT 1 FROM order_items i WHERE i.round_id=k.round_id AND i.station=k.station AND i.production_stream='BAR');
ALTER TABLE kot_tickets ENABLE TRIGGER enforce_kot_authority;
