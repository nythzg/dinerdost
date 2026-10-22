ALTER TABLE employees DROP CONSTRAINT employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check CHECK(role IN ('OWNER','MANAGER','CASHIER','WAITER','KITCHEN','BARTENDER','ACCOUNTANT'));
ALTER TABLE staff_invitations DROP CONSTRAINT staff_invitations_role_check;
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check CHECK(role IN ('MANAGER','CASHIER','WAITER','KITCHEN','BARTENDER','ACCOUNTANT'));
ALTER TABLE auth_sessions ADD COLUMN application text NOT NULL DEFAULT 'MASTER'
  CHECK(application IN ('MASTER','POS','CAPTAIN','KITCHEN','BAR','COMMAND'));
