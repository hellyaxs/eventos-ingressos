-- Multiple sessions of the same TMDb title are allowed.
DROP INDEX IF EXISTS "Event_externalRef_key";
CREATE INDEX IF NOT EXISTS "Event_externalRef_idx" ON "Event"("externalRef");
