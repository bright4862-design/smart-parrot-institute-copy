-- Phase 4C5U dead-letter operator review + bounded requeue eligibility evidence. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7c000000-0000-0000-0000-000000000011','{"full_name":"Phase4C5U Admin"}'),
 ('7c000000-0000-0000-0000-000000000012','{"full_name":"Phase4C5U Outsider"}');
update public.profiles set role='admin' where id='7c000000-0000-0000-0000-000000000011';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7c000000-0000-0000-0000-000000000011'::uuid $$;

do $$
declare
 s1 bigint; s2 bigint; s3 bigint; a1 bigint; a2 bigint; q1 jsonb; q2 jsonb; q1id bigint; q2id bigint; d1 bigint; d2 bigint;
 r1 jsonb; r1r jsonb; r2 jsonb; r2r jsonb; g1 jsonb; g1r jsonb; listing jsonb;
 bad_retry boolean:=false; bad_generate boolean:=false; bad_invalid boolean:=false; conflict boolean:=false; stale boolean:=false; outsider boolean:=false; mutate1 boolean:=false; mutate2 boolean:=false;
begin
 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('d',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning snapshot_id into s1;
 insert into public.lesson_booking_preview_launch_blocker_alerts(schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_alert_v1',s1,null,'initial_state',null,'blocked',array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning alert_id into a1;
 perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(s1);
 select public.service_prepare_booking_preview_launch_blocker_escalation_queue(s1) into q1; q1id:=(q1->>'queue_item_id')::bigint;
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,lease_seconds,lease_expires_at,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,'claimed',repeat('1',32),1,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes');
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,'dead_lettered',repeat('1',32),1,'invalid_work_item',statement_timestamp()-interval '1 minute') returning event_id into d1;
 begin perform public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'retry_after_review'); exception when invalid_parameter_value then bad_retry:=true; end;
 if not bad_retry then raise exception 'retry_after_review accepted invalid_work_item'; end if;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'invalid_work_item_confirmed') into r1;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'invalid_work_item_confirmed') into r1r;
 if r1->>'dead_letter_event_id'<>d1::text or r1->>'decision'<>'invalid_work_item_confirmed' or (r1->>'replay')::boolean or not (r1r->>'replay')::boolean or (r1->>'requeue_execution_authorized')::boolean or (r1->>'notifier_send_authorized')::boolean then raise exception 'invalid-work review boundary failed: %, %',r1,r1r; end if;
 begin perform public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r1->>'review_id')::bigint); exception when object_not_in_prerequisite_state then bad_generate:=true; end;
 if not bad_generate then raise exception 'invalid-work review became requeue eligible'; end if;

 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('e',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning snapshot_id into s2;
 insert into public.lesson_booking_preview_launch_blocker_alerts(schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_alert_v1',s2,s1,'blockers_changed','blocked','blocked',array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning alert_id into a2;
 perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(s2);
 select public.service_prepare_booking_preview_launch_blocker_escalation_queue(s2) into q2; q2id:=(q2->>'queue_item_id')::bigint;
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,lease_seconds,lease_expires_at,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q2id,s2,a2,'claimed',repeat('2',32),5,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes');
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q2id,s2,a2,'dead_lettered',repeat('2',32),5,'attempts_exhausted',statement_timestamp()-interval '1 minute') returning event_id into d2;
 begin perform public.admin_record_booking_preview_launch_blocker_dead_letter_review(q2id,'invalid_work_item_confirmed'); exception when invalid_parameter_value then bad_invalid:=true; end;
 if not bad_invalid then raise exception 'invalid_work_item confirmation accepted attempts_exhausted'; end if;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q2id,'retry_after_review') into r2;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q2id,'retry_after_review') into r2r;
 if r2->>'dead_letter_event_id'<>d2::text or r2->>'decision'<>'retry_after_review' or (r2->>'attempt_no')::integer<>5 or (r2->>'replay')::boolean or not (r2r->>'replay')::boolean then raise exception 'retry review boundary failed: %, %',r2,r2r; end if;
 begin perform public.admin_record_booking_preview_launch_blocker_dead_letter_review(q2id,'preserve'); exception when unique_violation then conflict:=true; end;
 if not conflict then raise exception 'conflicting review replay was accepted'; end if;
 select public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r2->>'review_id')::bigint) into g1;
 select public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r2->>'review_id')::bigint) into g1r;
 if (g1->>'validity_seconds')::integer<>900 or not (g1->>'requeue_eligible')::boolean or (g1->>'requeue_execution_authorized')::boolean or (g1->>'replay')::boolean or not (g1r->>'replay')::boolean or ((g1->>'expires_at')::timestamptz-(g1->>'generated_at')::timestamptz)<>interval '15 minutes' then raise exception 'generation boundary failed: %, %',g1,g1r; end if;
 select public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(25) into listing;
 if (listing->>'item_count')::int<>1 or listing->'items'->0->>'queue_item_id'<>q2id::text or listing->'items'->0->>'decision'<>'retry_after_review' or not (listing->'items'->0->>'requeue_eligible')::boolean or listing::text like '%provider_secret_bundle_missing%' or listing::text like '%'||repeat('2',32)||'%' or (listing->>'requeue_execution_authorized')::boolean then raise exception 'minimized queue failed: %',listing; end if;

 execute 'create or replace function auth.uid() returns uuid language sql stable as ''select ''''7c000000-0000-0000-0000-000000000012''''::uuid''';
 begin perform public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(25); exception when others then outsider:=true; end;
 if not outsider then raise exception 'non-admin crossed review boundary'; end if;
 execute 'create or replace function auth.uid() returns uuid language sql stable as ''select ''''7c000000-0000-0000-0000-000000000011''''::uuid''';

 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('f',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()) returning snapshot_id into s3;
 begin perform public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r2->>'review_id')::bigint); exception when serialization_failure then stale:=true; end;
 if not stale then raise exception 'stale reviewed snapshot remained eligible'; end if;
 begin update public.lesson_booking_preview_launch_blocker_dead_letter_reviews set decision=decision; exception when others then mutate1:=true; end;
 begin update public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations set generation_no=generation_no; exception when others then mutate2:=true; end;
 if not mutate1 or not mutate2 then raise exception 'append-only evidence mutation was allowed'; end if;
end $$;

do $$ declare rpc text; begin
 for rpc in select unnest(array['public.admin_list_booking_preview_launch_blocker_dead_letter_review_queue(integer)','public.admin_record_booking_preview_launch_blocker_dead_letter_review(bigint,text)','public.admin_generate_booking_preview_launch_blocker_requeue_eligibility(bigint)']) loop
  if not has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'authenticated missing Phase U admin RPC %',rpc; end if;
  if has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role unexpectedly has Phase U admin RPC %',rpc; end if;
 end loop;
 if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_dead_letter_reviews','SELECT') or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_dead_letter_reviews','SELECT') or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations','SELECT') or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations','SELECT') then raise exception 'Phase U evidence tables must remain RPC-only'; end if;
end $$;

rollback;
