ALTER TABLE stock_batches ADD COLUMN receipt_reference text;
CREATE UNIQUE INDEX unique_received_batch ON stock_batches(outlet_id,ingredient_id,receipt_reference,batch_number) WHERE receipt_reference IS NOT NULL;
