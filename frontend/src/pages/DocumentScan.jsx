import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import SmartCameraScanner from '../components/SmartCameraScanner';

import { API_BASE_URL } from '../utils/api';

export default function DocumentScan() {
  const navigate = useNavigate();
  const { patientId, documents, setDocuments, languageLabel, isAyush, t } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [extractedDoc, setExtractedDoc] = useState(null);
  const fileInputRef = useRef(null);

  const triggerFinalizeIntake = () => {
    if (patientId) {
      const formData = new FormData();
      formData.append('patient_id', patientId);
      formData.append('language', languageLabel || 'English');
      formData.append('is_ayush', Boolean(isAyush));
      fetch(`${API_BASE_URL}/finalize-intake`, { method: 'POST', body: formData }).catch(err => console.log('Finalize intake note:', err));
    }
  };

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setExtractedDoc(null);
    setIsCameraActive(false);

    const uploadedResults = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatus(`Uploading & queueing ${i + 1} of ${files.length}: ${file.name}...`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (patientId) formData.append('patient_id', patientId);

        const response = await fetch(`${API_BASE_URL}/process-document`, { method: 'POST', body: formData });
        const data = await response.json();

        if (data.extracted_document) {
          uploadedResults.push({ filename: file.name, ...data.extracted_document });
        }
      } catch (error) {
        console.error(`Document upload failed for ${file.name}:`, error);
        hasError = true;
      }
    }

    if (uploadedResults.length > 0) {
      setDocuments(prev => [...prev, ...uploadedResults]);
      setExtractedDoc({
        count: uploadedResults.length,
        summary: uploadedResults.length === 1
          ? `1 document securely uploaded and queued for clinical perception.`
          : `All ${uploadedResults.length} documents securely uploaded and queued in FIFO order.`
      });
    } else if (hasError) {
      setExtractedDoc({ error: true, summary: 'Failed to upload document(s). Please try again.' });
    }

    setIsProcessing(false);
    setProcessingStatus('');
  };

  const handleFileUpload = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    uploadFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleCameraCapture = (file) => {
    uploadFiles([file]);
  };

  const handleSkip = () => {
    triggerFinalizeIntake();
    navigate('/specialty');
  };

  const handleContinue = () => {
    setExtractedDoc(null); // Reset for another scan
    setIsCameraActive(false);
  };

  const handleDone = () => {
    triggerFinalizeIntake();
    navigate('/specialty');
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-content">

        <div className="text-center mb-8">
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📄</div>
          <h2 className="heading-2" style={{ marginBottom: 'var(--space-2)' }}>
            {t('docs_title')}
          </h2>
          <p className="subtitle">
            {t('docs_subtitle')}
          </p>
        </div>

        {/* Live Camera Scanner Mode */}
        {isCameraActive && (
          <div className="mb-6">
            <SmartCameraScanner
              onCapture={handleCameraCapture}
              onClose={() => setIsCameraActive(false)}
            />
          </div>
        )}

        {/* Dual Choice Options: Live Camera (Auto-Snap) or File Upload */}
        {!extractedDoc && !isProcessing && !isCameraActive && (
          <>
            <div className="grid grid-2 gap-4 mb-6">
              {/* Option 1: Smart Camera Scanner */}
              <button
                className="card card-interactive"
                onClick={() => setIsCameraActive(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-6)',
                  border: '1.5px solid rgba(56, 189, 248, 0.4)',
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08), rgba(2, 132, 199, 0.02))',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 'var(--radius-lg)',
                  background: 'rgba(56, 189, 248, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', flexShrink: 0
                }}>📷</div>
                <div style={{ textAlign: 'left' }}>
                  <div className="heading-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    Smart Camera
                    <span className="badge badge-success" style={{ fontSize: '10px' }}>⚡ Auto-Snap</span>
                  </div>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Auto-detects paper boundary & auto-captures when held steady
                  </p>
                </div>
              </button>

              {/* Option 2: Upload Files */}
              <button
                className="card card-interactive"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-6)',
                  border: '1.5px solid var(--color-border)',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', flexShrink: 0
                }}>📁</div>
                <div style={{ textAlign: 'left' }}>
                  <div className="heading-4">Upload File(s)</div>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Select single or multiple photos, images, or PDF reports
                  </p>
                </div>
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple
              onChange={handleFileUpload} style={{ display: 'none' }} />



            <div style={{
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px dashed rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)'
            }}>
              <span>💡</span>
              <span><strong>Clinical Vision:</strong> Select or drag single or multiple documents/reports at once. AI queues and auto-detects imaging modalities in sequence.</span>
            </div>

            <p className="caption text-center mb-4">
              {t('docs_supported')}
            </p>

            {documents.length > 0 && (
              <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
                <div className="heading-4 mb-2">📁 {documents.length} {t('docs_processed')}</div>
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <span className="badge badge-success">✓</span>
                    <span className="body-text">{doc.filename}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-4">
              <button className="btn btn-secondary btn-full" onClick={handleSkip}>
                {documents.length > 0 ? t('done_docs') : t('skip_docs')}
              </button>
            </div>
          </>
        )}

        {/* Processing */}
        {isProcessing && (
          <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-6)' }} />
            <p className="heading-4 mb-2">{processingStatus || t('processing_doc')}</p>
            <p className="body-text">FIFO Queue → OCR → Medical NLP → Structured Data Extraction</p>
          </div>
        )}

        {/* Upload Success Result */}
        {extractedDoc && !extractedDoc.error && (
          <div className="animate-slide-up">
            <div className="alert alert-success mb-4">
              {extractedDoc.summary || '✅ Document uploaded securely. Our AI is analyzing it in the background.'}
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn btn-success btn-full" onClick={handleDone}>{t('confirm_continue')}</button>
              <button className="btn btn-outline btn-full" onClick={handleContinue}>{t('scan_another')}</button>
            </div>
          </div>
        )}

        {extractedDoc?.error && (
          <div className="alert alert-danger mb-4">
            ❌ {extractedDoc.summary}
          </div>
        )}

      </div>
    </div>
  );
}
