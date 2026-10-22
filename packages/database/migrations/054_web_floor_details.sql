ALTER TABLE floor_plans ADD COLUMN boundary_roundness integer NOT NULL DEFAULT 0 CHECK (boundary_roundness BETWEEN 0 AND 500);
