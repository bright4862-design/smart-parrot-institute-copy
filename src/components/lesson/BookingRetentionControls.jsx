import React, { useEffect, useMemo, useState } from 'react';
import {
  approveAdminBookingRetentionClass,
  getAdminBookingRetentionStatus,
  listAdminBookingRetentionOptions,
  revokeAdminBookingRetentionClassApproval,
  setAdminBookingRetentionControl,
} from '@/lib/lessonBookingApi';

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

export default function BookingRetentionControls({ client, bookingId, onClose, onChanged }) {
  const [status, setStatus] = useState(null);
  const [options, setOptions] = useState([]);
  const [retentionClass, setRetentionClass] = useState('');
  const [legalHold, setLegalHold] = useState(false);
  const [reasonCode, setReasonCode] = useState('operator_review');
  const [reviewAfter, setReviewAfter] = useState('');
  const [activeRetentionDays, setActiveRetentionDays] = useState('');
  const [archiveRetentionDays, setArchiveRetentionDays] = useState('');
  const [sourceAuthority, setSourceAuthority] = useState('');
  const [reviewReference, setReviewReference] = useState('');
  const [approvalReason, setApprovalReason] = useState('legal_review_approved');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedOption = useMemo(() => options.find((option) => option.code === retentionClass) || null, [options, retentionClass]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextStatus, nextOptions] = await Promise.all([
        getAdminBookingRetentionStatus(client, bookingId),
        listAdminBookingRetentionOptions(client),
      ]);
      setStatus(nextStatus);
      setOptions(nextOptions);
      setRetentionClass(nextStatus?.retention_class || '');
      setLegalHold(Boolean(nextStatus?.legal_hold));
      setReviewAfter(nextStatus?.review_after || '');
    } catch (err) {
      setError(err?.message || 'Could not load retention governance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (client && bookingId) load();
  }, [client, bookingId]);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!retentionClass) return setError('Choose an authoritative retention class first.');
    if (legalHold && !reviewAfter) return setError('A legal hold requires a review date.');
    setSaving(true);
    try {
      const next = await setAdminBookingRetentionControl(client, { bookingId, retentionClass, legalHold, reasonCode, reviewAfter: reviewAfter || null });
      setStatus(next);
      setNotice('Retention governance updated and audit event appended. No evidence was erased or moved.');
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not update retention governance.');
    } finally {
      setSaving(false);
    }
  };

  const approveClass = async () => {
    setError(''); setNotice(''); setApprovalBusy(true);
    try {
      await approveAdminBookingRetentionClass(client, {
        code: retentionClass,
        activeRetentionDays,
        archiveRetentionDays,
        sourceAuthority,
        reviewReference,
        reasonCode: approvalReason,
      });
      setNotice('Retention class approval recorded with reviewed duration/source evidence. Automatic erasure remains disabled.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not approve retention class.');
    } finally {
      setApprovalBusy(false);
    }
  };

  const revokeApproval = async () => {
    setError(''); setNotice(''); setApprovalBusy(true);
    try {
      await revokeAdminBookingRetentionClassApproval(client, { code: retentionClass, reasonCode: approvalReason || 'legal_review_superseded' });
      setNotice('Retention class approval revoked. The class is fail-closed until reviewed again.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not revoke retention class approval.');
    } finally {
      setApprovalBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Retention governance</p>
          <h2 className="mt-1 text-lg font-black">Booking {bookingId}</h2>
          <p className="mt-1 text-xs text-slate-600">Audited metadata only. These controls cannot erase, archive, anonymize, charge, refund, or change provider state.</p>
        </div>
        <button className="text-sm font-bold underline" onClick={onClose}>Close</button>
      </div>

      {loading ? <p className="mt-4 text-sm">Loading retention state…</p> : (
        <>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {notice && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <div className="mt-4 grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded-lg bg-white p-3"><strong>Classified</strong><div>{status?.classified ? 'yes' : 'no'}</div></div>
            <div className="rounded-lg bg-white p-3"><strong>Period status</strong><div>{label(status?.period_status)}</div></div>
            <div className="rounded-lg bg-white p-3"><strong>Automatic erasure</strong><div>{status?.automatic_erasure_enabled ? 'enabled' : 'disabled'}</div></div>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={save}>
            <label className="text-sm font-bold">Retention class
              <select className="mt-1 w-full rounded-lg border bg-white p-2 font-normal" value={retentionClass} onChange={(e) => setRetentionClass(e.target.value)} required>
                <option value="">Choose a class</option>
                {options.map((option) => <option key={option.code} value={option.code}>{label(option.code)} — {label(option.period_status)}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">Review after
              <input className="mt-1 w-full rounded-lg border bg-white p-2 font-normal" type="date" value={reviewAfter} onChange={(e) => setReviewAfter(e.target.value)} />
            </label>
            <label className="text-sm font-bold">Reason code
              <input className="mt-1 w-full rounded-lg border bg-white p-2 font-normal" pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={reasonCode} onChange={(e) => setReasonCode(e.target.value.toLowerCase())} required />
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border bg-white p-3 text-sm font-bold">
              <input type="checkbox" checked={legalHold} onChange={(e) => setLegalHold(e.target.checked)} />
              Legal hold / claim review
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button disabled={saving} className="rounded-lg bg-indigo-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save audited control'}</button>
              <span className="text-xs text-slate-600">Approved retention durations remain server-controlled; this form cannot erase data.</span>
            </div>
          </form>

          {selectedOption && (
            <div className="mt-6 rounded-xl border border-indigo-200 bg-white p-4">
              <h3 className="font-black">Reviewed class approval</h3>
              <p className="mt-1 text-xs text-slate-600">This is governance metadata only. It never starts automatic deletion or archival.</p>
              {selectedOption.period_status === 'approved' ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p>Approved active retention: <strong>{selectedOption.active_retention_days} days</strong>{selectedOption.archive_retention_days ? <> · archive: <strong>{selectedOption.archive_retention_days} days</strong></> : null}</p>
                  <label className="block font-bold">Revocation reason code
                    <input className="mt-1 w-full rounded-lg border p-2 font-normal" pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value.toLowerCase())} />
                  </label>
                  <button type="button" disabled={approvalBusy} onClick={revokeApproval} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">Revoke reviewed approval</button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-bold">Active retention days<input className="mt-1 w-full rounded-lg border p-2 font-normal" type="number" min="1" step="1" value={activeRetentionDays} onChange={(e) => setActiveRetentionDays(e.target.value)} /></label>
                  <label className="text-sm font-bold">Archive retention days (optional)<input className="mt-1 w-full rounded-lg border p-2 font-normal" type="number" min="1" step="1" value={archiveRetentionDays} onChange={(e) => setArchiveRetentionDays(e.target.value)} /></label>
                  <label className="text-sm font-bold md:col-span-2">Source authority<input className="mt-1 w-full rounded-lg border p-2 font-normal" value={sourceAuthority} onChange={(e) => setSourceAuthority(e.target.value)} placeholder="Reviewed legal/DPO schedule or applicable authority" /></label>
                  <label className="text-sm font-bold">Review reference<input className="mt-1 w-full rounded-lg border p-2 font-normal" value={reviewReference} onChange={(e) => setReviewReference(e.target.value)} placeholder="legal-review-YYYY-MM-DD-v1" /></label>
                  <label className="text-sm font-bold">Approval reason code<input className="mt-1 w-full rounded-lg border p-2 font-normal" pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value.toLowerCase())} /></label>
                  <div className="md:col-span-2"><button type="button" disabled={approvalBusy} onClick={approveClass} className="rounded-lg bg-indigo-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve reviewed retention class</button></div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
