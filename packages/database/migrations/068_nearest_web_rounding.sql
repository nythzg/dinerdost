-- Existing saved settings and recorded bills keep their original direction until explicitly changed.
ALTER TABLE outlets DROP CONSTRAINT outlets_web_rounding_mode_default_check;
ALTER TABLE outlets ADD CONSTRAINT outlets_web_rounding_mode_default_check
 CHECK(web_rounding_mode_default IN ('NONE','UP','DOWN','NEAREST'));
