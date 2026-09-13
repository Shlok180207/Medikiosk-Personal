import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { API_BASE_URL } from '../utils/api';

export default function Specialty() {
  const navigate = useNavigate();
  const { patientId, languageLabel, setSpecialty: setAppSpecialty, t } = useApp();
  const [loading, setLoading] = useState(true);
  const [specialty, setSpecialty] = useState(null);
  const [showBypass, setShowBypass] = useState(false);

  useEffect(() => {
    matchSpecialty();
    const timer = setTimeout(() => setShowBypass(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleFallback = () => {
    const fallback = { specialty: 'General Medicine', reason: 'Recommended primary clinical consultation', confidence: 'Medium' };
    setSpecialty(fallback);
    setAppSpecialty(fallback);
    setLoading(false);
  };

  const matchSpecialty = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const qId = patientId && patientId !== 'null' && patientId !== 'undefined' ? patientId : '';
      const response = await fetch(`${API_BASE_URL}/specialty-match?patient_id=${encodeURIComponent(qId)}&language=${encodeURIComponent(languageLabel || 'English')}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !data.specialty) throw new Error('Invalid specialty payload');
      setSpecialty(data);
      setAppSpecialty(data);
    } catch (error) {
      console.warn('Specialty match fallback used:', error);
      handleFallback();
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content text-center">
          <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-6)' }} />
          <h3 className="heading-3 mb-2">{t('specialty_matching')}</h3>
          <p className="body-text">{t('specialty_analyzing')}</p>
          {showBypass && (
            <div className="animate-fade-in mt-6" style={{ marginTop: '24px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { handleFallback(); navigate('/providers'); }}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                ⏩ Continue to Providers
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const specialtyIcons = {
    'Dermatology': '🩺', 'Ophthalmology': '👁️', 'ENT': '👂', 'Dentistry': '🦷',
    'Orthopedics': '🦴', 'Pediatrics': '👶', 'Obstetrics & Gynecology': '🤰',
    'Gastroenterology': '🫁', 'Cardiology': '❤️', 'Pulmonology': '🫁',
    'Neurology': '🧠', 'Psychiatry': '🧠', 'General Medicine': '🏥',
    'Surgery': '🔪', 'Urology': '🩺',
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-content text-center">

        <h2 className="heading-2 mb-2">{t('specialty_title')}</h2>
        <p className="subtitle mb-8">
          {t('specialty_desc')}
        </p>

        <div className="card card-elevated" style={{
          padding: 'var(--space-8)', marginBottom: 'var(--space-6)', textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>
            {specialtyIcons[specialty?.specialty] || '🏥'}
          </div>
          <h3 className="heading-2" style={{ color: 'var(--color-primary)', marginBottom: 'var(--space-3)' }}>
            {specialty?.specialty || 'General Medicine'}
          </h3>
          {specialty?.reason && (
            <p className="body-text">{specialty.reason}</p>
          )}
          {specialty?.confidence && (
            <span className="badge badge-info mt-4" style={{ display: 'inline-flex' }}>
              {t('confidence')}: {specialty.confidence}
            </span>
          )}
        </div>

        <div className="alert alert-warning mb-6">
          ℹ️ {t('specialty_disclaimer')}
        </div>

        <button className="btn btn-primary btn-lg btn-full" onClick={() => navigate('/providers')}>
          {t('find_providers')}
        </button>

      </div>
    </div>
  );
}
