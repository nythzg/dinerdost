-- Older approved purchases predate automatic expense posting. Preserve their source
-- records and post each missing expense once, using approval time where recorded.
INSERT INTO records(id,restro_id,outlet_id,kind,title,state,data,created_by,approved_by,production_stream,created_at)
SELECT md5('purchase-expense:'||p.id::text)::uuid,p.restro_id,p.outlet_id,'expenses',p.title,'APPROVED',
 jsonb_build_object('category','Supplies','amount',p.data->'amount',
 'date',to_char(coalesce(a.approved_at,p.created_at) AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD'),
 'reference',coalesce(p.data->>'reference',''),'note',coalesce(p.data->>'note',''),
 'sourcePurchaseId',p.id::text,'migrationSource','031_backfill_purchase_expenses'),
 coalesce(p.approved_by,p.created_by),coalesce(p.approved_by,p.created_by),coalesce(p.production_stream,'FOOD'),coalesce(a.approved_at,p.created_at)
FROM records p LEFT JOIN LATERAL(SELECT min(occurred_at) AS approved_at FROM audit_events WHERE restro_id=p.restro_id AND entity_id=p.id::text AND action='PURCHASES_APPROVED') a ON true
WHERE p.kind='purchases' AND p.state IN ('APPROVED','COMPLETED') AND p.data ? 'amount'
 AND NOT EXISTS(SELECT 1 FROM records e WHERE e.restro_id=p.restro_id AND e.outlet_id=p.outlet_id AND e.kind='expenses' AND e.data->>'sourcePurchaseId'=p.id::text)
ON CONFLICT DO NOTHING;
