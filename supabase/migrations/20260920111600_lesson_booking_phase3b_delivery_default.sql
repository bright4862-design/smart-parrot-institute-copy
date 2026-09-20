-- Phase 3B follow-up: newly queued notices are immediately eligible for the
-- delivery worker unless a later retry explicitly sets another due time.
alter table public.compliance_notice_outbox
  alter column next_attempt_at set default clock_timestamp();

update public.compliance_notice_outbox
set next_attempt_at = queued_at
where delivered_at is null and dead_lettered_at is null and next_attempt_at is null;
