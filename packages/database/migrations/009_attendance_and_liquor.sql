ALTER TABLE ingredients ADD COLUMN category text NOT NULL DEFAULT 'GENERAL' CHECK(category IN ('GENERAL','LIQUOR'));
ALTER TABLE ingredients ADD CONSTRAINT liquor_volume_unit CHECK(category<>'LIQUOR' OR unit='L');
ALTER TABLE menu_items DROP CONSTRAINT menu_items_unit_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_unit_check CHECK(unit IN ('portion','kg','L','peg'));
ALTER TABLE menu_items ADD COLUMN peg_ml integer;
ALTER TABLE menu_items ADD COLUMN liquor_ingredient_id uuid;
ALTER TABLE menu_items ADD CONSTRAINT liquor_menu_stock FOREIGN KEY(restro_id,liquor_ingredient_id) REFERENCES ingredients(restro_id,id);
ALTER TABLE menu_items ADD CONSTRAINT valid_peg_measure CHECK(unit<>'peg' OR (peg_ml IS NOT NULL AND peg_ml BETWEEN 1 AND 1000 AND liquor_ingredient_id IS NOT NULL));
CREATE UNIQUE INDEX automatic_purchase_expense ON records(outlet_id,(data->>'sourcePurchaseId')) WHERE kind='expenses' AND data ? 'sourcePurchaseId';

CREATE TABLE employee_shifts (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, name text NOT NULL,
 starts_local time NOT NULL, ends_local time NOT NULL, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id), UNIQUE(restro_id,id), CHECK(starts_local<>ends_local)
);
CREATE UNIQUE INDEX shift_name ON employee_shifts(outlet_id,lower(name));
CREATE TABLE employee_attendance (
 id uuid PRIMARY KEY, restro_id uuid NOT NULL, outlet_id uuid NOT NULL, employee_id uuid NOT NULL, shift_id uuid NOT NULL,
 business_date date NOT NULL, state text NOT NULL CHECK(state IN ('PRESENT','ABSENT','LEAVE')),
 checked_in_at timestamptz, checked_out_at timestamptz, source text NOT NULL DEFAULT 'MANUAL' CHECK(source='MANUAL'),
 note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1, recorded_by uuid NOT NULL,
 FOREIGN KEY(restro_id,outlet_id) REFERENCES outlets(restro_id,id),
 FOREIGN KEY(restro_id,employee_id) REFERENCES employees(restro_id,id),
 FOREIGN KEY(restro_id,shift_id) REFERENCES employee_shifts(restro_id,id),
 FOREIGN KEY(restro_id,recorded_by) REFERENCES employees(restro_id,id),
 UNIQUE(employee_id,shift_id,business_date), UNIQUE(restro_id,id),
 CHECK(checked_out_at IS NULL OR (checked_in_at IS NOT NULL AND checked_out_at>=checked_in_at))
);
CREATE INDEX attendance_by_day ON employee_attendance(outlet_id,business_date);
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON employee_shifts USING(restro_id=current_setting('app.restro_id',true)::uuid) WITH CHECK(restro_id=current_setting('app.restro_id',true)::uuid);
ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON employee_attendance USING(restro_id=current_setting('app.restro_id',true)::uuid) WITH CHECK(restro_id=current_setting('app.restro_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON employee_shifts,employee_attendance TO dinerdost_app;
