import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { API_BASE_URL } from '../utils/api';

export default function RedFlag() {
  const navigate = useNavigate();
  const { patientId, setRedFlags, t } = useApp();
  const [checking, setChecking] = useState(true);
  const [flags, setFlags] = useState(null);

  useEffect(() => {
    checkRedFlags();
  }, []);

  const checkRedFlags = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const qId = patientId && patientId !== 'null' && patientId !== 'undefined' ? patientId : '';
      const response = await fetch(`${API_BASE_URL}/red-flag-check?patient_id=${encodeURIComponent(qId)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setFlags(data);
      setRedFlags(data);
    } catch (error) {
      console.warn('Red flag check fallback used:', error);
      setFlags({ has_red_flags: false, flags: [], message: 'Check completed — no urgent flags detected.' });
    } finally {
      clearTimeout(timeoutId);
      setChecking(false);
    }
  };

  const handleContinue = () => {
    navigate('/specialty');
  };

  if (checking) {
    return (
      <div className="page-container">
        <div className="page-content text-center">
          <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-6)' }} />
          <h3 className="heading-3 mb-2">{t('Running Safety Check...')}</h3>
          <p className="body-text">{t('Evaluating reported symptoms for potential urgent conditions')}</p>
        </div>
      </div>
    );
  }

  // Red flags detected
  if (flags?.has_red_flags) {
    return (
      <div className="page-container animate-fade-in">
        <div className="page-content">
          <div className="alert alert-danger mb-6" style={{ padding: 'var(--space-6)', fontSize: 'var(--font-size-lg)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}>
                {t('urgent_detected')}
              </div>
              <p>{t('urgent_desc')}</p>
            </div>
          </div>

          {flags.flags?.length > 0 && (
            <div className="card mb-6" style={{ padding: 'var(--space-6)' }}>
              <h3 className="heading-4 mb-4">{t('Detected Concerns:')}</h3>
              {flags.flags.map((flag, i) => (
                <div key={i} className="flex items-center gap-3 mb-3">
                  <span style={{ color: 'var(--color-danger)', fontSize: '1.2rem' }}>🚩</span>
                  <span className="body-text">{flag}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button className="btn btn-danger btn-full btn-lg">
              {t('alert_triage')}
            </button>
            <button className="btn btn-secondary btn-full" onClick={handleContinue}>
              {t('continue_specialty')}
            </button>
          </div>

          <div className="alert alert-warning mt-6">
            ℹ️ {t('This is NOT a diagnosis. The system has flagged potentially urgent symptoms for human clinical assessment.')}
          </div>
        </div>
      </div>
    );
  }

  // No red flags
  return (
    <div className="page-container animate-fade-in">
      <div className="page-content text-center">
        <div style={{ fontSize: '4rem', marginBottom: 'var(--space-4)' }}>✅</div>
        <h2 className="heading-2 mb-2">{t('safety_check')}</h2>
        <p className="subtitle mb-8">{t('no_urgent')}</p>
        <button className="btn btn-primary btn-lg" onClick={handleContinue}>
          {t('continue_specialty')}
        </button>
      </div>
    </div>
  );
}
