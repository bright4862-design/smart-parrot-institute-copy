-- Phase 4C5V service-only requeue generation consumption + lineage evidence. Ephemeral CI only.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('7d000000-0000-0000-0000-000000000011','{"full_name":"Phase4C5V Admin"}');
update public.profiles set role='admin' where id='7d000000-0000-0000-0000-000000000011';
create or replace function auth.uid() returns uuid language sql stable as $$ select '7d000000-0000-0000-0000-000000000011'::uuid $$;

do $$
declare
 s1 bigint; s2 bigint; s3 bigint; a1 bigint; a2 bigint; q1 jsonb; q2 jsonb; q1id bigint; q2id bigint; d1 bigint; d2 bigint;
 r1 jsonb; r2 jsonb; g1 jsonb; c1 jsonb; c1r jsonb; oldg bigint; newg bigint;
 conflict boolean:=false; expired boolean:=false; superseded boolean:=false; stale boolean:=false; mutate1 boolean:=false; mutate2 boolean:=false;
begin
 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('6',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning snapshot_id into s1;
 insert into public.lesson_booking_preview_launch_blocker_alerts(schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_alert_v1',s1,null,'initial_state',null,'blocked',array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning alert_id into a1;
 perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(s1);
 select public.service_prepare_booking_preview_launch_blocker_escalation_queue(s1) into q1; q1id:=(q1->>'queue_item_id')::bigint;
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,lease_seconds,lease_expires_at,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,'claimed',repeat('6',32),5,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes');
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q1id,s1,a1,'dead_lettered',repeat('6',32),5,'attempts_exhausted',statement_timestamp()-interval '1 minute') returning event_id into d1;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q1id,'retry_after_review') into r1;
 select public.admin_generate_booking_preview_launch_blocker_requeue_eligibility((r1->>'review_id')::bigint) into g1;
 select public.service_consume_booking_preview_launch_blocker_requeue_eligibility((g1->>'generation_id')::bigint,repeat('a',32)) into c1;
 select public.service_consume_booking_preview_launch_blocker_requeue_eligibility((g1->>'generation_id')::bigint,repeat('a',32)) into c1r;
 if (c1->>'replay')::boolean or not (c1r->>'replay')::boolean or c1->>'work_state'<>'prepared' or (c1->>'claim_eligible')::boolean or (c1->>'requeue_execution_authorized')::boolean then raise exception 'Phase V consumption replay/gate failed: %, %',c1,c1r; end if;
 if c1->>'lineage_ref' <> 'rqg:'||s1::text||':'||q1id::text||':'||(g1->>'generation_id')||':1' then raise exception 'deterministic lineage mismatch: %',c1; end if;
 if (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_consumptions where eligibility_generation_id=(g1->>'generation_id')::bigint)<>1 or (select count(*) from public.lesson_booking_preview_launch_blocker_requeue_work_generations where eligibility_generation_id=(g1->>'generation_id')::bigint)<>1 then raise exception 'single-use lineage row count mismatch'; end if;
 begin perform public.service_consume_booking_preview_launch_blocker_requeue_eligibility((g1->>'generation_id')::bigint,repeat('b',32)); exception when unique_violation then conflict:=true; end;
 if not conflict then raise exception 'already-consumed generation accepted a conflicting consumption key'; end if;

 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('7',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning snapshot_id into s2;
 insert into public.lesson_booking_preview_launch_blocker_alerts(schema_version,snapshot_id,previous_snapshot_id,change_kind,previous_status,current_status,blocker_codes,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_alert_v1',s2,s1,'blockers_changed','blocked','blocked',array['provider_secret_bundle_missing']::text[],statement_timestamp()-interval '2 hours') returning alert_id into a2;
 perform public.service_prepare_booking_preview_launch_blocker_alert_handoff(s2);
 select public.service_prepare_booking_preview_launch_blocker_escalation_queue(s2) into q2; q2id:=(q2->>'queue_item_id')::bigint;
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,lease_seconds,lease_expires_at,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q2id,s2,a2,'claimed',repeat('7',32),5,30,statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes');
 insert into public.lesson_booking_preview_launch_blocker_escalation_work_events(schema_version,queue_item_id,snapshot_id,alert_id,event_kind,claim_key,attempt_no,reason_code,recorded_at)
 values('smart_parrot_booking_preview_launch_blocker_escalation_work_event_v1',q2id,s2,a2,'dead_lettered',repeat('7',32),5,'attempts_exhausted',statement_timestamp()-interval '1 minute') returning event_id into d2;
 select public.admin_record_booking_preview_launch_blocker_dead_letter_review(q2id,'retry_after_review') into r2;
 insert into public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(schema_version,review_id,queue_item_id,snapshot_id,alert_id,dead_letter_event_id,generation_no,review_decision,validity_seconds,expires_at,generated_by,generated_at)
 values('smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1',(r2->>'review_id')::bigint,q2id,s2,a2,d2,1,'retry_after_review',900,statement_timestamp()-interval '15 minutes','7d000000-0000-0000-0000-000000000011',statement_timestamp()-interval '30 minutes') returning generation_id into oldg;
 begin perform public.service_consume_booking_preview_launch_blocker_requeue_eligibility(oldg,repeat('c',32)); exception when object_not_in_prerequisite_state then expired:=true; end;
 if not expired then raise exception 'expired eligibility generation was consumed'; end if;
 insert into public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(schema_version,review_id,queue_item_id,snapshot_id,alert_id,dead_letter_event_id,generation_no,review_decision,validity_seconds,expires_at,generated_by,generated_at)
 values('smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1',(r2->>'review_id')::bigint,q2id,s2,a2,d2,2,'retry_after_review',900,statement_timestamp()+interval '15 minutes','7d000000-0000-0000-0000-000000000011',statement_timestamp()) returning generation_id into oldg;
 insert into public.lesson_booking_preview_launch_blocker_requeue_eligibility_generations(schema_version,review_id,queue_item_id,snapshot_id,alert_id,dead_letter_event_id,generation_no,review_decision,validity_seconds,expires_at,generated_by,generated_at)
 values('smart_parrot_booking_preview_launch_blocker_requeue_eligibility_v1',(r2->>'review_id')::bigint,q2id,s2,a2,d2,3,'retry_after_review',900,statement_timestamp()+interval '15 minutes','7d000000-0000-0000-0000-000000000011',statement_timestamp()) returning generation_id into newg;
 begin perform public.service_consume_booking_preview_launch_blocker_requeue_eligibility(oldg,repeat('d',32)); exception when serialization_failure then superseded:=true; end;
 if not superseded then raise exception 'superseded active generation was consumed'; end if;
 insert into public.lesson_booking_preview_launch_blocker_snapshots(schema_version,state_fingerprint,status,schema_function_ready,provider_secret_bundle_ready,preview_project_identity_ready,stripe_account_identity_ready,daily_webhook_identity_ready,stripe_checkout_signed_recent,stripe_dispute_signed_recent,daily_signed_endpoint_ready,provider_rehearsal_recent,fixture_principals_ready,ephemeral_sessions_ready,provider_e2e_gate_open,worker_write_gate_open,unresolved_provider_cleanup_count,unresolved_terminal_reconciliation_count,missing_terminal_evidence_count,blocker_codes,captured_at)
 values('smart_parrot_booking_preview_launch_blocker_snapshot_v1',repeat('8',32),'blocked',true,false,true,true,true,true,true,true,true,true,true,true,true,0,0,0,array['provider_secret_bundle_missing']::text[],statement_timestamp()) returning snapshot_id into s3;
 begin perform public.service_consume_booking_preview_launch_blocker_requeue_eligibility(newg,repeat('e',32)); exception when serialization_failure then stale:=true; end;
 if not stale then raise exception 'stale-snapshot generation was consumed'; end if;

 begin update public.lesson_booking_preview_launch_blocker_requeue_consumptions set consumption_status=consumption_status; exception when others then mutate1:=true; end;
 begin update public.lesson_booking_preview_launch_blocker_requeue_work_generations set work_state=work_state; exception when others then mutate2:=true; end;
 if not mutate1 or not mutate2 then raise exception 'Phase V evidence tables were mutable'; end if;
end $$;

do $$ begin
 if has_function_privilege('authenticated','public.service_consume_booking_preview_launch_blocker_requeue_eligibility(bigint,text)','EXECUTE') then raise exception 'authenticated unexpectedly has Phase V service RPC'; end if;
 if not has_function_privilege('service_role','public.service_consume_booking_preview_launch_blocker_requeue_eligibility(bigint,text)','EXECUTE') then raise exception 'service_role missing Phase V service RPC'; end if;
 if has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_requeue_consumptions','SELECT') or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_requeue_consumptions','SELECT') or has_table_privilege('authenticated','public.lesson_booking_preview_launch_blocker_requeue_work_generations','SELECT') or has_table_privilege('service_role','public.lesson_booking_preview_launch_blocker_requeue_work_generations','SELECT') then raise exception 'Phase V evidence tables must remain RPC-only'; end if;
end $$;

rollback;