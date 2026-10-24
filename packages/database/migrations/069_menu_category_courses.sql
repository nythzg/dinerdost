-- Unassigned categories retain their existing name-based course until explicitly saved.
ALTER TABLE menu_categories ADD COLUMN menu_course text
 CHECK (menu_course IN ('starter','main','freshener','dessert'));
