ALTER TABLE menu_items ADD COLUMN image_is_sample boolean NOT NULL DEFAULT false;
UPDATE menu_items m SET image_url='/images/menu/samples/' || replace(lower(m.name),' ','-') || '.webp',image_is_sample=true
FROM restaurants r WHERE r.id=m.restro_id AND r.is_demo AND m.image_url=''
AND m.name IN ('Mint cooler','Butter naan','Saffron cheesecake','Dal makhani','Paneer tikka','Dum biryani');
