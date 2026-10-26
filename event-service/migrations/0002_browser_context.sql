ALTER TABLE events ADD COLUMN user_agent TEXT;
ALTER TABLE events ADD COLUMN os TEXT;
ALTER TABLE events ADD COLUMN browser TEXT;
ALTER TABLE events ADD COLUMN language TEXT;
ALTER TABLE events ADD COLUMN languages TEXT;
ALTER TABLE events ADD COLUMN browser_timezone TEXT;
ALTER TABLE events ADD COLUMN utc_offset_minutes INTEGER;
