DO $$ BEGIN EXECUTE format('GRANT dinerdost_app TO %I',current_user); END; $$;

CREATE FUNCTION protect_posted_loyalty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state<>'PENDING_EARN' THEN RAISE EXCEPTION 'IMMUTABLE_LOYALTY: posted points require a compensating entry'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER posted_loyalty_guard BEFORE UPDATE OR DELETE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION protect_posted_loyalty();
CREATE TRIGGER loyalty_truncate_guard BEFORE TRUNCATE ON loyalty_ledger FOR EACH STATEMENT EXECUTE FUNCTION block_immutable_mutation();
