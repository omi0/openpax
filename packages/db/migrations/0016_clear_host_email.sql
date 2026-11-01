-- The calendar link replaced the email invites, and the dashboard no longer shows the
-- address: a saved one would keep sending guest details to an address nobody can see.
UPDATE "booking_policy" SET "meeting_host_email" = NULL;
