ALTER TABLE order_rounds ADD COLUMN manual_discount bigint NOT NULL DEFAULT 0 CHECK(manual_discount>=0);
ALTER TABLE order_rounds ADD COLUMN round_off bigint NOT NULL DEFAULT 0 CHECK(round_off BETWEEN -50 AND 50);
ALTER TABLE order_rounds ADD COLUMN rounding_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE dining_tables ADD COLUMN retired_at timestamptz;
ALTER TABLE floor_plans ADD COLUMN boundary_style text NOT NULL DEFAULT 'STROKE' CHECK(boundary_style IN ('STROKE','WALLS'));
ALTER TABLE order_rounds ADD COLUMN staff_entered boolean NOT NULL DEFAULT false;
