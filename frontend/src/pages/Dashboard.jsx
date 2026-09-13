import React, { useState, useEffect } from 'react';

import { API_BASE_URL } from '../utils/api';

/* ─── Helpers ────────────────────────────────────────────────────── */
const isImageFile = (url) => {
  if (!url) return false;
  const l = url.toLowerCase();
  return l.endsWith('.webp') || l.endsWith('.jpg') || l.endsWith('.jpeg') || l.endsWith('.png') || l.endsWith('.gif');
};
const isPdfFile = (url) => {
  if (!url) return false;
  return url.toLowerCase().includes('.pdf');
};

const getModalityMeta = (doc) => {
  const mod = (doc.modality || '').toLowerCase();
  const type = (doc.document_type || '').toLowerCase();

  if (type.includes('prescription') || type.includes('doctor slip') || type.includes('consultation') || type.includes('rx slip')) {
    return { title: 'Prescription / Rx', icon: '📄', bg: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' };
  }
  if (mod === 'radiology' || type.includes('x-ray') || /\b(ct|ct-scan|cat scan)\b/i.test(type) || type.includes('mri') || type.includes('radiograph') || type.includes('ultrasound')) {
    return { title: 'Radiology', icon: '🩻', bg: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };
  }
  if (mod === 'ecg' || type.includes('ecg') || type.includes('ekg') || type.includes('rhythm') || type.includes('cardio')) {
    return { title: 'ECG / Cardiology', icon: '📈', bg: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' };
  }
  if (mod === 'pathology' || type.includes('biopsy') || type.includes('patholog') || type.includes('histolog') || type.includes('cytology')) {
    return { title: 'Pathology', icon: '🔬', bg: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe' };
  }
  if (mod === 'endoscopy' || type.includes('endoscop') || type.includes('colonoscop') || type.includes('laparoscop') || type.includes('dermoscop') || type.includes('fundus')) {
    return { title: 'Endoscopy', icon: '🩺', bg: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' };
  }
  return { title: 'Clinical Document', icon: '📄', bg: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' };
};

const getLikelihoodStyle = (likelihood) => {
  const l = (likelihood || 'medium').toLowerCase();
  if (l === 'high') {
    return { label: 'HIGH', dot: '#b91c1c', badgeBg: '#fee2e2', badgeColor: '#991b1b', badgeBorder: '#fca5a5' };
  }
  if (l === 'medium' || l === 'moderate') {
    return { label: 'MOD', dot: '#b45309', badgeBg: '#fef3c7', badgeColor: '#92400e', badgeBorder: '#fcd34d' };
  }
  return { label: 'LOW', dot: '#64748b', badgeBg: '#f1f5f9', badgeColor: '#475569', badgeBorder: '#e2e8f0' };
};

const oneLiner = (text) => {
  if (!text || text === 'None reported' || text === 'Not recorded') return null;
  if (text === 'Awaiting synthesis') return '⏳ Awaiting synthesis...';
  const clean = text.replace(/\n+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 117) + '…' : clean;
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [queue, setQueue] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [status, setStatus] = useState('Waiting for patient...');
  const [historyData, setHistoryData] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  /* ─── Data Fetching (unchanged) ─────────────────────────────────── */
  const fetchQueue = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${API_BASE_URL}/patients`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const patients = await response.json();
      if (Array.isArray(patients)) {
        setQueue(patients);
      }
    } catch (error) {
      console.warn('Failed to fetch queue:', error);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (queue.length > 0 && !selectedPatientId) setSelectedPatientId(queue[0].patient_id);
  }, [queue, selectedPatientId]);

  const fetchData = async () => {
    if (!selectedPatientId) return;
    try {
      setStatus('Fetching...');
      const response = await fetch(`${API_BASE_URL}/patient-summary?patient_id=${selectedPatientId}`);
      const data = await response.json();
      setPatientData(data);
      setStatus('Synchronized');
    } catch (error) { console.error('Failed to fetch data', error); setStatus('Error connecting'); }
  };

  const handleResynthesize = async () => {
    if (!selectedPatientId) return;
    try {
      setIsSynthesizing(true);
      setStatus('Synthesizing...');
      await fetch(`${API_BASE_URL}/resynthesize?patient_id=${selectedPatientId}`, { method: 'POST' });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`${API_BASE_URL}/patient-summary?patient_id=${selectedPatientId}`);
          const data = await res.json();
          if (data.is_synthesized || attempts >= 8) {
            setPatientData(data);
            fetchHistory();
            setIsSynthesizing(false);
            setStatus('Synchronized');
            clearInterval(poll);
          }
        } catch (e) {
          if (attempts >= 8) {
            setIsSynthesizing(false);
            clearInterval(poll);
          }
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to trigger resynthesis:', error);
      setIsSynthesizing(false);
      setStatus('Synthesis error');
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete patient ${id}?`)) return;
    try {
      await fetch(`${API_BASE_URL}/patients/${id}`, { method: 'DELETE' });
      if (selectedPatientId === id) { setSelectedPatientId(null); setPatientData(null); }
      fetchQueue();
    } catch (error) { console.error('Failed to delete patient', error); }
  };

  // Auto-refresh queue and active patient data every 5s so background perceptions appear live
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQueue();
      if (selectedPatientId) {
        fetchData();
      }
    }, 5000);
    fetchQueue();
    return () => clearInterval(interval);
  }, [selectedPatientId]);

  useEffect(() => {
    if (selectedPatientId) { fetchData(); fetchHistory(); setShowAllHistory(false); }
  }, [selectedPatientId]);

  const fetchHistory = async () => {
    if (!selectedPatientId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/patient-history?patient_id=${selectedPatientId}`);
      const data = await response.json();
      setHistoryData(data);
    } catch (error) { console.error('Failed to fetch history', error); }
  };

  const isEmergency = patientData?.is_emergency;
  const ci = patientData?.clinical_impression;

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--color-bg)' }}>

      {/* ═══ Sidebar — Patient Queue ═══ */}
      <aside style={{
        width: 280, flexShrink: 0, background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>🏥 Patient Queue</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>{queue.length} patient(s)</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {queue.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>No patients in queue</p>
              <button
                onClick={fetchQueue}
                style={{
                  background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px',
                  padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: '#475569'
                }}
              >
                🔄 Refresh Queue
              </button>
            </div>
          ) : (
            queue.map(p => (
              <div
                key={p.patient_id}
                onClick={() => setSelectedPatientId(p.patient_id)}
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--color-border-light)',
                  cursor: 'pointer',
                  background: selectedPatientId === p.patient_id ? '#f1f5f9' : 'transparent',
                  borderLeft: selectedPatientId === p.patient_id ? '3px solid #1d4ed8' : '3px solid transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {p.is_emergency && <span style={{ color: 'var(--color-danger)', fontSize: '12px' }}>🚨</span>}
                      <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>
                        {p.patient_name || p.patient_id}
                      </span>
                      {p.is_ayush && (
                        <span style={{ background: '#f0fdf4', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
                          AYUSH
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500, marginTop: '2px' }}>
                      {p.abha_id ? `ABHA: ${p.abha_id}` : p.patient_id}
                    </div>
                    {(p.age || p.gender) && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                        {p.age ? `${p.age} yrs` : ''} {p.gender ? `• ${p.gender}` : ''}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, p.patient_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '14px' }}
                    title="Delete patient"
                  >🗑️</button>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '3px', display: 'block' }}>Arrived: {p.created_at}</span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ═══ Main Content ═══ */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

        {!patientData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>👨‍⚕️</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>MediKiosk Clinical Dashboard</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Select a patient from the queue to view their clinical summary</p>
          </div>
        ) : (
          <div className="animate-fade-in">

            {/* Pending Synthesis Alert Banner */}
            {!patientData.is_synthesized && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderLeft: '4px solid #f59e0b',
                borderRadius: '8px',
                padding: '12px 18px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                boxShadow: '0 1px 3px rgba(245,158,11,0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>⚡</span>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#92400e', display: 'block' }}>
                      Clinical Synthesis Pending
                    </strong>
                    <span style={{ fontSize: '12px', color: '#b45309' }}>
                      Differential diagnoses, CDSS evidence, and organized organ-system reviews are awaiting generation.
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleResynthesize}
                  disabled={isSynthesizing}
                  style={{
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSynthesizing ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  {isSynthesizing ? '⏳ Processing AI Synthesis...' : '⚡ Generate Summary Now'}
                </button>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                 HERO STRIP — The 5-Second Briefing
                ═══════════════════════════════════════════════════════ */}
            <div style={{
              background: '#ffffff',
              border: '1px solid var(--color-border)',
              borderLeft: isEmergency ? '4px solid var(--color-danger)' : '1px solid var(--color-border)',
              borderRadius: '10px',
              padding: '0',
              marginBottom: '16px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>

              {/* Row 1: Patient Identity + Vitals Strip */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', flexWrap: 'wrap', gap: '10px',
                borderBottom: '1px solid var(--color-border-light)',
                background: isEmergency ? 'rgba(185,28,28,0.02)' : '#ffffff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {/* Name */}
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    {patientData.patient_name || 'Patient'}
                  </h2>
                  {/* Age/Gender pill */}
                  <span style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)'
                  }}>
                    {patientData.age ? `${patientData.age}` : '?'}
                    {patientData.gender ? ` ${patientData.gender.charAt(0).toUpperCase()}` : ''}
                  </span>
                  {/* Severity Badge */}
                  <span style={{
                    background: patientData.severity === 'High' ? '#fef2f2' : patientData.severity === 'Medium' ? '#fffbeb' : '#f0fdf4',
                    color: patientData.severity === 'High' ? '#991b1b' : patientData.severity === 'Medium' ? '#92400e' : '#166534',
                    border: `1px solid ${patientData.severity === 'High' ? '#fecaca' : patientData.severity === 'Medium' ? '#fde68a' : '#bbf7d0'}`,
                    borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em',
                    display: 'inline-flex', alignItems: 'center', gap: '5px'
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: patientData.severity === 'High' ? '#b91c1c' : patientData.severity === 'Medium' ? '#b45309' : '#15803d'
                    }}></span>
                    {patientData.severity ? `${patientData.severity.toUpperCase()} PRIORITY` : 'NORMAL'}
                  </span>
                  {/* Emergency flag */}
                  {isEmergency && (
                    <span style={{
                      background: '#991b1b', color: '#fff', padding: '2px 8px', borderRadius: '4px',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em'
                    }}>
                      EMERGENCY
                    </span>
                  )}
                  {/* AYUSH badge */}
                  {patientData.is_ayush && (
                    <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      AYUSH
                    </span>
                  )}
                  {/* ABHA */}
                  {patientData.abha_id && (
                    <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      ABHA: {patientData.abha_id}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {patientData.phone ? `Tel: ${patientData.phone}` : ''} {patientData.duration ? `• Duration: ${patientData.duration}` : ''}
                  </span>
                  <button
                    onClick={() => { fetchData(); fetchHistory(); }}
                    style={{
                      background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px',
                      padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: '#334155',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >🔄 Refresh</button>
                  <button
                    onClick={handleResynthesize}
                    disabled={isSynthesizing}
                    style={{
                      background: patientData.is_synthesized ? '#ffffff' : '#1d4ed8',
                      border: patientData.is_synthesized ? '1px solid #cbd5e1' : '1px solid #1d4ed8',
                      color: patientData.is_synthesized ? '#334155' : '#ffffff',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: isSynthesizing ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: patientData.is_synthesized ? 'none' : '0 1px 3px rgba(29,78,216,0.3)'
                    }}
                    title="Generate or update AI clinical synthesis"
                  >
                    {isSynthesizing ? '⏳ Synthesizing...' : (patientData.is_synthesized ? '⚡ Re-synthesize' : '⚡ Generate AI Synthesis')}
                  </button>
                </div>
              </div>

              {/* Row 2: Chief Complaint */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border-light)' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>
                  Chief Complaint
                </span>
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.35 }}>
                  {patientData.chief_complaint || 'Not recorded'}
                </p>
              </div>

              {/* Row 3: Decision Support Strip */}
              {ci && (ci.clinical_synthesis || (ci.probable_diagnoses && ci.probable_diagnoses.length > 0)) && (
                <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid var(--color-border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}>
                      Clinical Decision Support
                    </span>
                    <span style={{
                      background: '#e2e8f0', color: '#475569', borderRadius: '4px',
                      padding: '1px 6px', fontSize: '9px', fontWeight: 600
                    }}>DRAFT</span>
                  </div>

                  {/* Top diagnoses as clean white cards with subtle acuity badge */}
                  {ci.probable_diagnoses && ci.probable_diagnoses.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      {ci.probable_diagnoses.map((diag, idx) => {
                        const s = getLikelihoodStyle(diag.likelihood);
                        return (
                          <div key={idx} style={{
                            background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '5px 12px',
                            display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }}></span>
                            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' }}>{diag.condition}</span>
                            <span style={{
                              fontSize: '10px', fontWeight: 700, background: s.badgeBg, color: s.badgeColor,
                              border: `1px solid ${s.badgeBorder}`, padding: '1px 6px', borderRadius: '3px', letterSpacing: '0.02em'
                            }}>{s.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}



                  {/* Suggested Tests */}
                  {ci.suggested_investigations && ci.suggested_investigations.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>SUGGESTED ORDERS:</span>
                      {ci.suggested_investigations.map((test, idx) => (
                        <CopyableChip key={idx} text={test} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════
                 AI SYNTHESIS — Collapsible Detail
                ═══════════════════════════════════════════════════════ */}
            {ci && ci.clinical_synthesis && (
              <CollapsibleSection
                icon="📝"
                title="Clinical Synthesis"
                defaultOpen={false}
              >
                <SynthesisBullets synthesis={ci.clinical_synthesis} />
                {ci.probable_diagnoses && ci.probable_diagnoses.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Supporting Evidence</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {ci.probable_diagnoses.map((diag, idx) => (
                        diag.supporting_evidence && (
                          <div key={idx} style={{ fontSize: '12px', color: 'var(--color-text-secondary)', paddingLeft: '10px', borderLeft: '2px solid var(--color-border)' }}>
                            <strong style={{ color: 'var(--color-text)' }}>{diag.condition}:</strong> {diag.supporting_evidence}
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* ═══════════════════════════════════════════════════════
                 CLINICAL DETAILS — Collapsible Sections
                ═══════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <CollapsibleSection icon="📋" title="History of Present Illness" preview={oneLiner(patientData.hpi)}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.hpi || 'Not reported'}</p>
              </CollapsibleSection>
              <CollapsibleSection icon="📂" title="Past Medical History" preview={oneLiner(patientData.past_medical_history)}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.past_medical_history || 'Not reported'}</p>
              </CollapsibleSection>
              <CollapsibleSection icon="⚠️" title="Allergies" preview={oneLiner(patientData.allergies)}
                alertBorder={Boolean(patientData.allergies && patientData.allergies !== 'None reported' && patientData.allergies !== 'Not recorded')}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.allergies || 'Not reported'}</p>
              </CollapsibleSection>
              <CollapsibleSection icon="👨‍👩‍👧‍👦" title="Family History" preview={oneLiner(patientData.family_history)}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.family_history || 'Not reported'}</p>
              </CollapsibleSection>
              <CollapsibleSection icon="🏃" title="Lifestyle / Personal" preview={oneLiner(patientData.personal_history)}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.personal_history || 'Not reported'}</p>
              </CollapsibleSection>
              <CollapsibleSection icon="🔍" title="Review of Systems" preview={oneLiner(patientData.review_of_systems)}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>{patientData.review_of_systems || 'Not reported'}</p>
              </CollapsibleSection>
            </div>

            {/* ═══════════════════════════════════════════════════════
                 AYUSH — Compact accordion (only when relevant)
                ═══════════════════════════════════════════════════════ */}
            {(patientData.is_ayush || (patientData.prakriti && patientData.prakriti !== 'Not assessed')) && (
              <CollapsibleSection
                icon="🌿"
                title="AYUSH / Ayurvedic Assessment"
                preview={`Prakriti: ${patientData.prakriti || '—'} • Vikriti: ${patientData.vikriti || '—'}`}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <AyushPill label="Prakriti" value={patientData.prakriti} />
                  <AyushPill label="Vikriti" value={patientData.vikriti} />
                  <AyushPill label="Agni" value={patientData.agni} />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>💨 Vata: Prakopa / Elevated</span>
                  <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>🔥 Pitta: Samana / Moderate</span>
                  <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>💧 Kapha: Avarana Tendency</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border-light)', paddingTop: '8px' }}>
                  <strong style={{ color: 'var(--color-text)' }}>Chikitsa:</strong> Light warm diet (Laghu Ushna Ahara). Snehana & Vata-Shamana therapy. Avoid cold/dry food and excessive exertion.
                </div>
              </CollapsibleSection>
            )}

            {/* ═══════════════════════════════════════════════════════
                 DOCUMENTS & LABS — Always visible with live count
                ═══════════════════════════════════════════════════════ */}
            <CollapsibleSection
              icon="📄"
              title={`Processed Documents & Labs${(() => {
                try {
                  const arr = JSON.parse(patientData.flagged_lab_values || '[]');
                  return Array.isArray(arr) && arr.length > 0 ? ` (${arr.length})` : '';
                } catch (e) { return ''; }
              })()}`}
              defaultOpen={true}
            >
              <DocumentsView
                data={patientData.flagged_lab_values}
                patientId={patientData.patient_id}
                onRefresh={fetchData}
              />
            </CollapsibleSection>

            {/* ═══════════════════════════════════════════════════════
                 ABHA PAST HISTORY — Compact Timeline
                ═══════════════════════════════════════════════════════ */}
            {historyData && (historyData.relevant_history?.length > 0 || historyData.other_history?.length > 0) && (
              <CollapsibleSection
                icon="📜"
                title={`Past Visit History (ABHA${historyData.abha_id ? `: ${historyData.abha_id}` : ''})`}
                defaultOpen={true}
              >
                {historyData.filter_status === 'processing' && !patientData?.is_synthesized && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px',
                    padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#92400e'
                  }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    AI is analyzing past history for relevance...
                  </div>
                )}

                {/* Relevant visits — compact timeline */}
                {historyData.relevant_history?.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      RELEVANT TO TODAY ({historyData.relevant_history.length})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {historyData.relevant_history.map(visit => (
                        <CompactVisitRow key={visit.id} visit={visit} isRelevant />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other visits — hidden by default */}
                {historyData.other_history?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowAllHistory(!showAllHistory)}
                      style={{
                        background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px',
                        padding: '4px 14px', cursor: 'pointer', color: 'var(--color-text-muted)',
                        fontSize: '11px', width: '100%', marginBottom: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {showAllHistory ? '▼ Hide' : '▶ View'} Other History ({historyData.other_history.length} visits)
                    </button>
                    {showAllHistory && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} className="animate-fade-in">
                        {historyData.other_history.map(visit => (
                          <CompactVisitRow key={visit.id} visit={visit} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Draft disclaimer footer */}
            <div style={{
              textAlign: 'center', padding: '12px', marginTop: '8px',
              fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.02em'
            }}>
              ⚠️ AI-GENERATED DRAFT — VERIFY BEFORE CLINICAL USE • {status}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   COLLAPSIBLE SECTION — Core building block
   ═══════════════════════════════════════════════════════════════════ */
function CollapsibleSection({ icon, title, preview, children, defaultOpen = false, alertBorder = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: alertBorder ? '3px solid var(--color-danger)' : '1px solid var(--color-border)',
      borderRadius: '8px',
      marginBottom: '8px',
      overflow: 'hidden',
      transition: 'box-shadow 0.15s ease',
      boxShadow: open ? '0 1px 4px rgba(0,0,0,0.03)' : 'none'
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
          textAlign: 'left'
        }}
      >
        <span style={{ fontSize: '13px', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)', flexShrink: 0 }}>{title}</span>
        {!open && preview && (
          <span style={{
            flex: 1, fontSize: '12px', color: 'var(--color-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '4px'
          }}>
            — {preview}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0, paddingLeft: '8px' }}>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px 34px' }} className="animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}


/* ─── Synthesis Bullets ──────────────────────────────────────────── */
function SynthesisBullets({ synthesis }) {
  let points = [];
  if (Array.isArray(synthesis)) {
    points = synthesis.map(p => typeof p === 'string' ? p.replace(/^[•\-\*]\s*/, '').trim() : String(p));
  } else if (typeof synthesis === 'string') {
    const lines = synthesis.split(/\n+/).map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
    if (lines.length > 1) points = lines;
    else points = synthesis.split(/(?<=[.!?])\s+/).map(s => s.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
  }
  if (points.length === 0 && synthesis) points = [String(synthesis)];

  return (
    <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {points.map((pt, i) => (
        <li key={i} style={{ fontSize: '12px', lineHeight: 1.4, color: 'var(--color-text)' }}>{pt}</li>
      ))}
    </ul>
  );
}


/* ─── Copyable Test Chip ─────────────────────────────────────────── */
function CopyableChip({ text }) {
  const [copied, setCopied] = useState(false);
  const handleClick = () => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={handleClick} title="Click to copy test" style={{
      background: copied ? '#f0fdf4' : '#ffffff',
      color: copied ? '#15803d' : '#1d4ed8',
      border: `1px solid ${copied ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: '4px',
      padding: '2px 8px', fontSize: '11px', fontWeight: 600,
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
      transition: 'all 0.15s ease'
    }}>
      <span>{copied ? '✓' : '+'}</span> {text}
    </button>
  );
}


/* ─── AYUSH Pill ─────────────────────────────────────────────────── */
function AyushPill({ label, value }) {
  const displayVal = (value && value !== 'Not assessed') ? value : '—';
  return (
    <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</span>
      <p style={{ margin: '2px 0 0', fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' }}>{displayVal}</p>
    </div>
  );
}


/* ─── Compact Visit Row (for ABHA timeline) ──────────────────────── */
function CompactVisitRow({ visit, isRelevant }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid var(--color-border)',
      borderLeft: isRelevant ? '3px solid #16a34a' : '1px solid var(--color-border)',
      borderRadius: '6px', overflow: 'hidden'
    }}>
      {/* Compact row */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left'
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>
          {visit.visit_date}
        </span>
        <span style={{
          background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0',
          padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, flexShrink: 0
        }}>
          {visit.specialty || 'General OPD'}
        </span>
        {isRelevant && (
          <span style={{
            background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '4px',
            fontSize: '10px', fontWeight: 600, flexShrink: 0
          }}>AI Correlated</span>
        )}
        <span style={{
          flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          — {visit.chief_complaint}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 10px 12px', borderTop: '1px solid var(--color-border-light)' }} className="animate-fade-in">
          {visit.relevance_reason && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid var(--color-border)',
              borderRadius: '4px', padding: '6px 10px', marginTop: '8px', marginBottom: '6px',
              fontSize: '11px', color: isRelevant ? '#166534' : 'var(--color-text-secondary)'
            }}>
              <strong>Clinical Correlation:</strong> {visit.relevance_reason}
            </div>
          )}
          {visit.summary && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '6px 0', lineHeight: 1.4 }}>{visit.summary}</p>
          )}
          {visit.diagnoses?.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Diagnoses: </span>
              {visit.diagnoses.map((d, i) => (
                <span key={i} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '3px', padding: '1px 6px', margin: '2px', fontSize: '11px', fontWeight: 600, display: 'inline-block' }}>{d}</span>
              ))}
            </div>
          )}
          {visit.medications?.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Medications: </span>
              {visit.medications.map((m, i) => (
                <span key={i} style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '1px 6px', margin: '2px', fontSize: '11px', display: 'inline-block' }}>💊 {m}</span>
              ))}
            </div>
          )}
          {visit.flagged_values?.length > 0 && (
            <div style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '11px', marginTop: '4px' }}>
              Flagged: {visit.flagged_values.join(' • ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   DOCUMENTS VIEW — Preserved with compact default + expand
   ═══════════════════════════════════════════════════════════════════ */
function DocumentsView({ data, patientId, onRefresh }) {
  const [modalDoc, setModalDoc] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);

  let parsed = [];
  try {
    if (data && typeof data === 'string') {
      parsed = JSON.parse(data);
    } else if (Array.isArray(data)) {
      parsed = data;
    }
  } catch (e) {
    parsed = [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return (
      <div style={{
        padding: '16px 20px', textAlign: 'center', background: 'var(--color-bg)',
        borderRadius: '6px', border: '1px dashed var(--color-border)'
      }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          No Documents Attached
        </p>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 10px 0' }}>
          If documents were recently scanned at the kiosk, they will appear here once background perception completes.
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px',
              padding: '4px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}
          >
            🔄 Check for Processed Documents
          </button>
        )}
      </div>
    );
  }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {parsed.map((doc, i) => {
          const meta = getModalityMeta(doc);
          const hasFlags = doc.flagged_values?.length > 0;
          const isExpanded = expandedDoc === i;

          return (
            <div key={i} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: '6px', overflow: 'hidden'
            }}>
              {/* Compact row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer'
              }} onClick={() => setExpandedDoc(isExpanded ? null : i)}>
                <span style={{ fontSize: '15px', flexShrink: 0 }}>{meta.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)', flexShrink: 0 }}>
                  {doc.document_type || 'Clinical Report'}
                </span>
                <span style={{ background: meta.bg, color: meta.color, border: meta.border, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>
                  {meta.title}
                </span>
                {hasFlags && (
                  <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                    ⚠️ {doc.flagged_values.length} flag{doc.flagged_values.length > 1 ? 's' : ''}
                  </span>
                )}
                {/* One-line summary preview */}
                {doc.summary && !isExpanded && (
                  <span style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    — {doc.summary.slice(0, 80)}{doc.summary.length > 80 ? '…' : ''}
                  </span>
                )}
                {/* Action buttons */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {doc.file_url && (
                    <a
                      href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '4px',
                        padding: '3px 9px', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: '3px'
                      }}
                    >
                      {isPdfFile(doc.file_url) ? '📄 PDF ↗' : '↗ Open'}
                    </a>
                  )}
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid var(--color-border-light)' }} className="animate-fade-in">
                  {doc.summary && (
                    <div style={{ background: 'var(--color-bg)', borderRadius: '4px', padding: '8px 12px', marginTop: '8px', marginBottom: '8px' }}>
                      <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.45, color: 'var(--color-text)' }}>{doc.summary}</p>
                    </div>
                  )}
                  {doc.diagnoses?.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>Findings: </span>
                      {doc.diagnoses.map((d, idx) => (
                        <span key={idx} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '3px', padding: '1px 6px', margin: '2px', fontSize: '11px', fontWeight: 600, display: 'inline-block' }}>{d}</span>
                      ))}
                    </div>
                  )}
                  {doc.medications?.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>Medications: </span>
                      {doc.medications.map((m, idx) => (
                        <span key={idx} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '1px 6px', margin: '2px', fontSize: '11px', display: 'inline-block' }}>💊 {m}</span>
                      ))}
                    </div>
                  )}
                  {hasFlags && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '6px 10px', marginBottom: '6px' }}>
                      <span style={{ color: '#991b1b', fontWeight: 700, fontSize: '11px' }}>⚠️ Flagged Abnormalities:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {doc.flagged_values.map((v, idx) => (
                          <span key={idx} style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '3px', padding: '1px 6px', fontSize: '11px', fontWeight: 600 }}>{v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Image thumbnail + OCR/AI synthesis modal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    {doc.file_url && isImageFile(doc.file_url) && (
                      <img
                        src={doc.file_url} alt={doc.document_type || 'Scan'}
                        onClick={() => window.open(doc.file_url, '_blank')}
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                      />
                    )}
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>
                        {isPdfFile(doc.file_url) ? '📄 Open Original PDF ↗' : '👁️ Open Full Document ↗'}
                      </a>
                    )}
                    <button
                      onClick={() => setModalDoc(doc)}
                      style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: '#334155' }}
                    >🔍 AI Synthesis & OCR</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ═══ Full Inspection Modal (preserved from original) ═══ */}
        {modalDoc && (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
            }}
            onClick={() => setModalDoc(null)}
          >
            <div
              style={{
                background: 'var(--color-surface)', borderRadius: '10px',
                maxWidth: '960px', width: '100%', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', overflow: 'hidden',
                border: '1px solid var(--color-border)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 18px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>{getModalityMeta(modalDoc).icon}</span>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{modalDoc.document_type || 'Visual Document'}</h4>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{getModalityMeta(modalDoc).title} • {modalDoc.document_date || 'Visual Scan'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a href={modalDoc.file_url} target="_blank" rel="noopener noreferrer"
                    style={{
                      background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '4px',
                      padding: '4px 10px', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: '4px'
                    }}>
                    {isPdfFile(modalDoc.file_url) ? '📄 Open PDF ↗' : '↗ Open File'}
                  </a>
                  <button onClick={() => setModalDoc(null)} style={{
                    background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer',
                    color: 'var(--color-text-muted)', padding: '2px 6px'
                  }}>✕</button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: (isImageFile(modalDoc.file_url) || isPdfFile(modalDoc.file_url)) ? '1.3fr 1fr' : '1fr',
                gap: '16px', padding: '16px', overflowY: 'auto', maxHeight: 'calc(90vh - 65px)'
              }}>
                {/* PDF Preview */}
                {isPdfFile(modalDoc.file_url) && (
                  <div style={{ background: '#0f172a', borderRadius: '6px', overflow: 'hidden', height: '520px', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)' }}>
                    <div style={{ background: '#1e293b', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600 }}>📄 PDF Preview</span>
                      <a href={modalDoc.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', fontSize: '11px', textDecoration: 'underline' }}>Full Tab ↗</a>
                    </div>
                    <iframe src={modalDoc.file_url} title="PDF" style={{ width: '100%', flex: 1, border: 'none' }} />
                  </div>
                )}
                {/* Image Preview */}
                {isImageFile(modalDoc.file_url) && (
                  <div style={{ background: '#0f172a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', minHeight: '320px' }}>
                    <img src={modalDoc.file_url} alt="Scan"
                      style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', cursor: 'pointer' }}
                      onClick={() => window.open(modalDoc.file_url, '_blank')} title="Click to view full" />
                  </div>
                )}

                {/* AI Extraction Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ background: 'var(--color-bg)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--color-border-light)' }}>
                    <span style={{ fontWeight: 700, fontSize: '11px', display: 'block', marginBottom: '3px' }}>AI Clinical Synthesis:</span>
                    <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.45 }}>{modalDoc.summary}</p>
                  </div>
                  {modalDoc.flagged_values?.length > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '8px 12px' }}>
                      <strong style={{ color: '#991b1b', fontSize: '11px', display: 'block', marginBottom: '3px' }}>⚠️ Flagged Abnormalities:</strong>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#991b1b' }}>
                        {modalDoc.flagged_values.map((v, idx) => <li key={idx}>{v}</li>)}
                      </ul>
                    </div>
                  )}
                  {modalDoc.diagnoses?.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Diagnoses:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {modalDoc.diagnoses.map((d, idx) => (
                          <span key={idx} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '3px', padding: '1px 6px', fontSize: '11px', fontWeight: 600 }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {modalDoc.medications?.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '11px', display: 'block', marginBottom: '3px' }}>Medications:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {modalDoc.medications.map((m, idx) => <span key={idx} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '1px 6px', fontSize: '11px' }}>💊 {m}</span>)}
                      </div>
                    </div>
                  )}
                  {modalDoc.raw_text && (
                    <div>
                      <strong style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '3px', textTransform: 'uppercase' }}>Raw OCR Transcript:</strong>
                      <div style={{
                        background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', borderRadius: '4px',
                        padding: '6px 10px', fontSize: '11px', maxHeight: '120px', overflowY: 'auto',
                        whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)', fontFamily: 'monospace'
                      }}>{modalDoc.raw_text}</div>
                    </div>
                  )}
                  <div style={{ marginTop: '2px' }}>
                    <a href={modalDoc.file_url} target="_blank" rel="noopener noreferrer"
                      style={{
                        background: '#1d4ed8', color: '#fff', borderRadius: '4px',
                        padding: '5px 12px', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}>
                      {isPdfFile(modalDoc.file_url) ? '📄 Open PDF in New Tab ↗' : '↗ Open In New Tab'}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}
