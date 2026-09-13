import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { API_BASE_URL } from '../utils/api';

export default function PatientID() {
  const navigate = useNavigate();
  const {
    setPatient,
    demoAbhaPatients,
    language,
    setLanguage,
    languages,
    t
  } = useApp();

  const [abhaInput, setAbhaInput] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mode, setMode] = useState('input'); // 'input', 'scan'
  const [showLangModal, setShowLangModal] = useState(false);

  // Format ABHA number as XX-XXXX-XXXX-XXXX
  const formatAbha = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 6));
    if (digits.length > 6) parts.push(digits.slice(6, 10));
    if (digits.length > 10) parts.push(digits.slice(10, 14));
    return parts.join('-');
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    const formatted = formatAbha(raw);
    setAbhaInput(formatted);
    setErrorMessage('');
    setVerifiedPatient(null);
  };

  // Auto-detect when 14 digits are entered
  useEffect(() => {
    const digits = abhaInput.replace(/\D/g, '');
    if (digits.length === 14) {
      verifyAbhaNumber(abhaInput);
    }
  }, [abhaInput]);

  const verifyAbhaNumber = async (idToVerify) => {
    const cleanId = idToVerify.trim();
    if (!cleanId) return;

    setIsVerifying(true);
    setErrorMessage('');
    setVerifiedPatient(null);

    try {
      const res = await fetch(`${API_BASE_URL}/abha-profile/${encodeURIComponent(cleanId)}`);
      const data = await res.json();

      if (data.found) {
        setVerifiedPatient({
          name: data.name,
          age: data.age,
          gender: data.gender,
          phone: data.phone,
          abhaId: data.abha_id,
          badge: data.badge,
          summary: data.summary
        });
      } else {
        setErrorMessage(data.message || t('no_abha_error'));
      }
    } catch (err) {
      setErrorMessage(t('verification_error'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleProceed = () => {
    if (verifiedPatient) {
      setPatient(verifiedPatient);
      navigate('/consent');
    }
  };

  const handleQuickFill = (demoObj) => {
    setAbhaInput(demoObj.abhaId);
    verifyAbhaNumber(demoObj.abhaId);
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-content" style={{ maxWidth: 640 }}>

        {/* Selected Language Display & Switcher Bar */}
        <div
          className="card mb-5"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.08), rgba(2, 132, 199, 0.05))',
            border: '1px solid rgba(8, 145, 178, 0.25)',
            borderRadius: 'var(--radius-xl)',
            gap: 'var(--space-2)',
            flexWrap: 'wrap'
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.3rem' }}>🌐</span>
            <div>
              <span className="caption" style={{ fontWeight: 600, color: 'var(--color-primary-dark)' }}>
                {t('selected_language')}:
              </span>
              <span style={{ marginLeft: 6, fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                {language?.native || 'English'} <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '0.85rem' }}>({language?.label || 'English'})</span>
              </span>
            </div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowLangModal(!showLangModal)}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              padding: '5px 12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 'var(--radius-md)'
            }}
          >
            <span>{t('change_language_btn')}</span>
            <span style={{ fontSize: '0.7rem' }}>{showLangModal ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* Quick Language Switcher Dropdown Grid */}
        {showLangModal && (
          <div className="card mb-5 animate-fade-in" style={{
            padding: 'var(--space-4)',
            background: 'var(--color-surface)',
            border: '2px solid var(--color-primary)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                🌐 {t('select_language_title')}
              </span>
              <button
                onClick={() => setShowLangModal(false)}
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.85rem' }}
              >
                ✕
              </button>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 'var(--space-2)'
            }}>
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l);
                    setShowLangModal(false);
                  }}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: language?.code === l.code ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: language?.code === l.code ? 'var(--color-primary-50)' : 'var(--color-bg)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: language?.code === l.code ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    {l.native}
                  </span>
                  <span className="caption" style={{ fontSize: '0.75rem' }}>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center" style={{ marginBottom: 'var(--space-6)' }}>
          <span className="badge badge-info mb-2" style={{ padding: '6px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
            {t('abdm_badge')}
          </span>
          <h2 className="heading-2" style={{ marginBottom: 'var(--space-1)' }}>{t('patient_id_title')}</h2>
          <p className="subtitle">{t('patient_id_subtitle')}</p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-2 mb-6" style={{ background: 'var(--color-surface)', padding: 4, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <button
            onClick={() => { setMode('input'); setErrorMessage(''); }}
            className={`btn btn-full ${mode === 'input' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 'var(--font-size-sm)' }}
          >
            {t('enter_abha_tab')}
          </button>
          <button
            onClick={() => { setMode('scan'); setErrorMessage(''); }}
            className={`btn btn-full ${mode === 'scan' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 'var(--font-size-sm)' }}
          >
            {t('scan_abha_tab')}
          </button>
        </div>

        {/* Input Mode */}
        {mode === 'input' && (
          <div className="card" style={{ padding: 'var(--space-6)', boxShadow: 'var(--shadow-md)' }}>
            <label className="caption" style={{ fontWeight: 700, display: 'block', marginBottom: 'var(--space-2)' }}>
              {t('abha_input_label')}
            </label>

            <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
              <input
                className="input"
                placeholder={t('abha_input_placeholder')}
                value={abhaInput}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === 'Enter' && verifyAbhaNumber(abhaInput)}
                maxLength={17}
                style={{
                  fontSize: '1.25rem',
                  letterSpacing: '1px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  paddingRight: '120px'
                }}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => verifyAbhaNumber(abhaInput)}
                disabled={isVerifying || !abhaInput.trim()}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 6,
                  bottom: 6,
                  borderRadius: 'var(--radius-md)',
                  padding: '0 16px'
                }}
              >
                {isVerifying ? t('verifying_btn') : t('verify_btn')}
              </button>
            </div>

            {/* Error State */}
            {errorMessage && (
              <div className="alert alert-danger mb-4 animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                <span style={{ fontSize: 'var(--font-size-sm)' }}>{errorMessage}</span>
              </div>
            )}

            {/* Auto-Detected Verified Patient Card */}
            {verifiedPatient && (
              <div
                className="card animate-fade-in mb-4"
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '2px solid var(--color-success)',
                  borderRadius: 'var(--radius-lg)'
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                    <div>
                      <h4 style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                        {verifiedPatient.name}
                      </h4>
                      <span className="caption" style={{ color: 'var(--color-success-dark, #065f46)', fontWeight: 600 }}>
                        ABHA ID: {verifiedPatient.abhaId}
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ padding: '4px 10px' }}>
                    {t('abha_verified_badge')}
                  </span>
                </div>

                <div className="grid-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(16, 185, 129, 0.2)', fontSize: 'var(--font-size-sm)' }}>
                  <div>
                    <span className="caption">{t('age_gender_label')} </span>
                    <span style={{ fontWeight: 600 }}>
                      {verifiedPatient.age} {t('years')} • {verifiedPatient.gender === 'Male' ? t('male') : (verifiedPatient.gender === 'Female' ? t('female') : verifiedPatient.gender)}
                    </span>
                  </div>
                  <div>
                    <span className="caption">{t('linked_phone_label')} </span>
                    <span style={{ fontWeight: 600 }}>+91 {verifiedPatient.phone}</span>
                  </div>
                </div>

                {verifiedPatient.badge && (
                  <div className="mt-2">
                    <span className="badge badge-info" style={{ fontSize: '11px' }}>
                      {t('profile_label')} {verifiedPatient.badge}
                    </span>
                  </div>
                )}

                <button
                  className="btn btn-primary btn-full mt-4"
                  onClick={handleProceed}
                  style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}
                >
                  {t('confirm_start_triage')}
                </button>
              </div>
            )}

            {/* Subtle Demo ABHA helper */}
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
              <div className="flex flex-wrap gap-2">
                {demoAbhaPatients?.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickFill(p)}
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      color: 'var(--color-text)',
                      transition: 'all var(--transition-fast)'
                    }}
                    title={`Fill ${p.name} (${p.badge})`}
                  >
                    {p.avatar} {p.name.split(' ')[0]} ({p.abhaId})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scan Mode */}
        {mode === 'scan' && (
          <div className="card text-center" style={{ padding: 'var(--space-6)' }}>
            <div style={{
              width: 180, height: 180, margin: '0 auto var(--space-4)',
              border: '3px dashed var(--color-border)', borderRadius: 'var(--radius-xl)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-bg)', fontSize: '3rem'
            }}>
              📷
            </div>
            <h4 className="heading-4 mb-1">{t('scan_title')}</h4>
            <p className="caption mb-4">{t('scan_desc')}</p>

            <div className="flex gap-2 justify-center flex-wrap">
              <button className="btn btn-secondary" onClick={() => setMode('input')}>
                {t('scan_back_btn')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode('input');
                  handleQuickFill(demoAbhaPatients[0]);
                }}
              >
                {t('simulate_scan_btn')}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


