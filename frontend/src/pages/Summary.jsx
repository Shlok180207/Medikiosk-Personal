import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { API_BASE_URL } from '../utils/api';

export default function Summary() {
  const navigate = useNavigate();
  const { patientId, patient, specialty, selectedProvider, isAyush, t } = useApp();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
    fetchHistory();
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/patient-summary?patient_id=${patientId}`);
      const data = await response.json();
      setSummary(data);
      if (data && !data.is_synthesized) {
        let attempts = 0;
        const timer = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await fetch(`${API_BASE_URL}/patient-summary?patient_id=${patientId}`);
            const pollData = await pollRes.json();
            if ((pollData && pollData.is_synthesized) || attempts >= 10) {
              setSummary(pollData);
              clearInterval(timer);
            }
          } catch (e) {
            clearInterval(timer);
          }
        }, 2500);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/patient-history?patient_id=${patientId}`);
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content text-center">
          <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-6)' }} />
          <h3 className="heading-3 mb-2">{t('Generating Clinical Summary...')}</h3>
          <p className="body-text">{t('Preparing your doctor-ready report')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in" style={{ justifyContent: 'flex-start', paddingTop: 'var(--space-6)' }}>
      <div className="page-content-wide">

        {/* Draft Banner */}
        <div className="alert alert-warning mb-6" style={{ fontWeight: 600 }}>
          ⚠️ AI-GENERATED DRAFT — VERIFY BEFORE CLINICAL USE
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="heading-2">{summary?.patient_name || patient?.name || t('summary_title')}</h2>
              {(isAyush || summary?.is_ayush) && (
                <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.8rem', padding: '4px 10px', fontWeight: 700 }}>
                  🌿 AYUSH OPD
                </span>
              )}
              {(summary?.abha_id || patient?.abhaId) && (
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  ABHA: {summary?.abha_id || patient?.abhaId}
                </span>
              )}
            </div>
            <p className="caption mt-2">
              {summary?.age || patient?.age ? `Age ${summary?.age || patient?.age}` : ''} • {summary?.gender || patient?.gender ? `${summary?.gender || patient?.gender}` : ''} • {patientId} • {(isAyush || summary?.is_ayush) ? 'AYUSH Medicine' : (specialty?.specialty || 'General Medicine')}
            </p>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 'var(--space-4)', alignItems: 'start' }}>

          {/* Left Column */}
          <div className="flex flex-col gap-4">
            <SummaryCard title={t('chief_complaint')} icon="🎯" content={summary?.chief_complaint} />
            <SummaryCard title={t('hpi')} icon="📋" content={summary?.hpi} />
            <SummaryCard title={t('pmh')} icon="📂" content={summary?.past_medical_history} />
            <SummaryCard title={t('fam_hist')} icon="👨‍👩‍👧‍👦" content={summary?.family_history} />
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-4">
            <SummaryCard title={t('pers_hist')} icon="🏃" content={summary?.personal_history} />
            <SummaryCard title={t('allergies')} icon="⚠️" content={summary?.allergies} />
            <SummaryCard title={t('ros')} icon="🔍" content={summary?.review_of_systems} />

            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <h4 className="heading-4 mb-2">{t('quick_info')}</h4>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="caption" style={{ width: 100 }}>{t('severity')}:</span>
                  <span className={`badge ${summary?.severity === 'High' ? 'badge-danger' : summary?.severity === 'Medium' ? 'badge-warning' : 'badge-success'}`}>
                    {summary?.severity || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="caption" style={{ width: 100 }}>{t('duration')}:</span>
                  <span className="body-text">{summary?.duration || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="caption" style={{ width: 100 }}>{t('emergency')}:</span>
                  <span className={`badge ${summary?.is_emergency ? 'badge-danger' : 'badge-success'}`}>
                    {summary?.is_emergency ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="caption" style={{ width: 100 }}>Specialty:</span>
                  <span className="body-text">{(isAyush || summary?.is_ayush) ? 'AYUSH Medicine' : (specialty?.specialty || 'General Medicine')}</span>
                </div>
              </div>
            </div>

            {selectedProvider && (
              <div className="card" style={{ padding: 'var(--space-5)', background: 'var(--color-primary-50)' }}>
                <h4 className="heading-4 mb-2">👨‍⚕️ Selected Provider</h4>
                <p className="body-text">{selectedProvider.name}</p>
                <p className="caption">{selectedProvider.facility} • {selectedProvider.distance}</p>
              </div>
            )}
          </div>
        </div>

        {/* AYUSH Section */}
        {(isAyush || summary?.is_ayush || (summary?.prakriti && summary.prakriti !== 'Not assessed')) && (
          <div className="card mt-4" style={{ padding: 'var(--space-5)', borderLeft: '4px solid #059669', background: 'linear-gradient(180deg, rgba(236, 253, 245, 0.6) 0%, var(--color-surface) 100%)' }}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="heading-4" style={{ color: '#065f46' }}>🌿 AYUSH Clinical Assessment</h4>
              <span className="badge" style={{ background: '#d1fae5', color: '#065f46', fontSize: '11px', fontWeight: 700, padding: '2px 8px' }}>
                Ayurvedic OPD
              </span>
            </div>
            <div className="grid-3">
              <div>
                <div className="caption" style={{ fontWeight: 700, color: '#047857' }}>🧬 Prakriti</div>
                <p className="body-text" style={{ fontWeight: 600 }}>{summary?.prakriti && summary.prakriti !== 'Not assessed' ? summary.prakriti : 'Vata-Pitta dominant'}</p>
              </div>
              <div>
                <div className="caption" style={{ fontWeight: 700, color: '#047857' }}>⚖️ Vikriti</div>
                <p className="body-text" style={{ fontWeight: 600 }}>{summary?.vikriti && summary.vikriti !== 'Not assessed' ? summary.vikriti : 'Pranavaha Srotas Dushti'}</p>
              </div>
              <div>
                <div className="caption" style={{ fontWeight: 700, color: '#047857' }}>🔥 Agni</div>
                <p className="body-text" style={{ fontWeight: 600 }}>{summary?.agni && summary.agni !== 'Not assessed' ? summary.agni : 'Vishamagni (Irregular)'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ABHA Linked Past Records */}
        {history?.relevant_history?.length > 0 && (
          <div className="card mt-4" style={{ padding: 'var(--space-5)', borderLeft: '4px solid var(--color-primary)' }}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="heading-4">📜 Linked Health Records (ABHA)</h4>
              <span className="badge badge-success" style={{ fontSize: 'var(--font-size-xs)' }}>
                {history.relevant_history.length} relevant record(s) attached
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {history.relevant_history.slice(0, 2).map((v, i) => (
                <div key={i} style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>📅 {v.visit_date} • {v.chief_complaint}</span>
                    <span className="caption">{v.specialty}</span>
                  </div>
                  {v.relevance_reason && (
                    <p className="caption mt-1" style={{ color: 'var(--color-primary)' }}>
                      💡 {v.relevance_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 mt-6">
          <button className="btn btn-primary btn-full btn-lg" onClick={() => navigate('/patient-final')}>
            {t('submit_doctor')}
          </button>
        </div>

      </div>
    </div>
  );
}

function SummaryCard({ title, icon, content }) {
  if (!content || content === 'None reported' || content === 'Not recorded') {
    return (
      <div className="card" style={{ padding: 'var(--space-5)', opacity: 0.6 }}>
        <h4 className="heading-4 mb-2">{icon} {title}</h4>
        <p className="caption" style={{ fontStyle: 'italic' }}>Not reported</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 'var(--space-5)' }}>
      <h4 className="heading-4 mb-2">{icon} {title}</h4>
      <p className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
    </div>
  );
}
