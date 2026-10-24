-- Platform-owned configuration only; no restaurant/financial data is rewritten.
CREATE UNIQUE INDEX platform_feature_control_scope ON platform_records(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE kind='FEATURE_CONTROL';
CREATE FUNCTION platform_own_feature_controls(lock_configuration boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE global_flags jsonb; local_flags jsonb;
BEGIN
 IF lock_configuration THEN
  SELECT data INTO global_flags FROM public.platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id IS NULL FOR SHARE;
  SELECT data INTO local_flags FROM public.platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id=nullif(current_setting('app.restro_id',true),'')::uuid FOR SHARE;
 ELSE
  SELECT data INTO global_flags FROM public.platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id IS NULL;
  SELECT data INTO local_flags FROM public.platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id=nullif(current_setting('app.restro_id',true),'')::uuid;
 END IF;
 RETURN jsonb_build_object('server',coalesce(global_flags,'{}'::jsonb),'restaurant',coalesce(local_flags,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION platform_own_feature_controls(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_own_feature_controls(boolean) TO dinerdost_app;
