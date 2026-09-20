import React, { useEffect, useState } from 'react';
import {
  getAdminBookingRetentionStatus,
  listAdminBookingRetentionOptions,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    if (!retentionClass) {
      setError('Choose an authoritative retention class first.');
      return;
    }
    if (legalHold && !reviewAfter) {
      setError('A legal hold requires a review date.');
      return;
    }
    setSaving(true);
    try {
      const next = await setAdminBookingRetentionControl(client, {
        bookingId,
        retentionClass,
        legalHold,
        reasonCode,
        reviewAfter: reviewAfter || null,
      });
      setStatus(next);
      setNotice('Retention governance updated and audit event appended. No evidence was erased or moved.');
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not update retention governance.');
    } finally {
      setSaving(false);
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
              <span className="text-xs text-slate-600">Approved retention durations remain controlled by the server-side policy table; this form cannot invent them.</span>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
