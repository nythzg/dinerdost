CREATE TABLE uploaded_assets (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL REFERENCES restaurants(id), outlet_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('MENU','STAFF_PHOTO','STAFF_DOCUMENT')),
 content bytea NOT NULL CHECK(octet_length(content)<=2000000), mime text NOT NULL CHECK(mime IN ('image/webp','application/pdf')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id)
);
CREATE INDEX asset_owner ON uploaded_assets(restro_id,created_at);
CREATE TABLE employee_details (
 employee_id uuid PRIMARY KEY, restro_id uuid NOT NULL, phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', pincode text NOT NULL DEFAULT '',
 photo_id uuid, document_id uuid, document_type text NOT NULL DEFAULT '' CHECK(document_type IN ('','AADHAAR','PAN','VOTER_ID','DRIVING_LICENCE')),
 FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id),
 FOREIGN KEY(restro_id,photo_id) REFERENCES uploaded_assets(restro_id,id), FOREIGN KEY(restro_id,document_id) REFERENCES uploaded_assets(restro_id,id)
);
ALTER TABLE uploaded_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON uploaded_assets USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
ALTER TABLE employee_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_details FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON employee_details USING(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid) WITH CHECK(restro_id=nullif(current_setting('app.restro_id',true),'')::uuid);
GRANT SELECT,INSERT ON uploaded_assets TO dinerdost_app;
GRANT SELECT,INSERT,UPDATE ON employee_details TO dinerdost_app;
