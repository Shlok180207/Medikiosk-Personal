import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

import { API_BASE_URL } from '../utils/api';

export default function Kiosk() {
  const navigate = useNavigate();
  const { languageLabel, languageCode, speechCode, isAyush, patient, patientId, setPatientId, setClinicalData, t } = useApp();

  // ── TTS (Text-to-Speech) for accessibility ──
  const audioRef = useRef(null);
  const ttsUnlockedRef = useRef(false);
  const pendingSpeechRef = useRef(null);

  const stopSpeaking = useCallback(() => {
    pendingSpeechRef.current = null;
    ttsUnlockedRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakText = useCallback((text) => {
    if (!text) return;
    const skip = ['Processing...', 'Listening...', 'Noted.', 'Skipping...'];
    if (skip.some(s => text.startsWith(s))) return;

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const lang = languageLabel || 'Hindi';
      const encoded = encodeURIComponent(text);
      const audio = new Audio(`${API_BASE_URL}/tts?text=${encoded}&lang=${lang}`);
      audioRef.current = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            ttsUnlockedRef.current = true;
          })
          .catch(err => {
            console.warn('Audio play error, falling back to Web Speech API:', err);
            if (window.speechSynthesis) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = speechCode || 'hi-IN';
              utterance.rate = 0.9;
              window.speechSynthesis.speak(utterance);
            }
          });
      }
    } catch (err) {
      console.error('TTS error:', err);
    }
  }, [languageLabel, speechCode]);

  // Unlock audio on first user click or tap
  useEffect(() => {
    pendingSpeechRef.current = getGreeting(languageLabel);

    const unlockTTS = () => {
      if (!ttsUnlockedRef.current && pendingSpeechRef.current) {
        speakText(pendingSpeechRef.current);
        pendingSpeechRef.current = null;
      }
      document.removeEventListener('click', unlockTTS);
      document.removeEventListener('touchstart', unlockTTS);
    };

    document.addEventListener('click', unlockTTS);
    document.addEventListener('touchstart', unlockTTS);

    return () => {
      document.removeEventListener('click', unlockTTS);
      document.removeEventListener('touchstart', unlockTTS);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  }, [languageLabel, speakText]);

  // Guard: Redirect to ABHA verification if no patient is authenticated
  useEffect(() => {
    if (!patient || !patient.name) {
      console.warn('No authenticated ABHA patient found. Redirecting to /patient-id...');
      navigate('/patient-id');
    }
  }, [patient, navigate]);

  // Chat state
  const [messages, setMessages] = useState([
    { type: 'bot', text: getGreeting(languageLabel) }
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationPhase, setConversationPhase] = useState('initial'); // initial, follow-up, complete
  const [conversationContext, setConversationContext] = useState('');
  const [followUpCount, setFollowUpCount] = useState(0);
  const [progress, setProgress] = useState(10);
  const [textInput, setTextInput] = useState('');

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Auto-scroll to latest message
  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const addMessage = useCallback((text, type) => {
    setMessages(prev => [...prev, { type, text }]);
    scrollToBottom();
    // Auto-speak bot messages
    if (type === 'bot') {
      setTimeout(() => speakText(text), 200);
    }
  }, [scrollToBottom, speakText]);

  const removeLastBotMessage = useCallback(() => {
    setMessages(prev => {
      const last = [...prev];
      for (let i = last.length - 1; i >= 0; i--) {
        if (last[i].type === 'bot' && (last[i].text === 'Processing...' || last[i].text === 'Listening...')) {
          last.splice(i, 1);
          break;
        }
      }
      return last;
    });
  }, []);

  // ── Voice Recording (Whisper offline) ──
  const handleMicClick = async () => {
    stopSpeaking();
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      setIsRecording(false);
      return;
    }
    // Always use Whisper (offline) for maximum reliability
    await startWhisperRecording();
  };

  const startWhisperRecording = async () => {
    stopSpeaking();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        addMessage('🎤 Voice recorded — processing...', 'user');
        addMessage('Processing...', 'bot');
        setIsProcessing(true);
        if (conversationPhase === 'initial') await sendInitialAudio(audioBlob);
        else if (conversationPhase === 'follow-up') await sendFollowUpAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      addMessage('⚠️ Microphone access denied. Please allow access and try again.', 'bot');
    }
  };

  // ── Text Input Handler ──
  const handleTextSubmit = async () => {
    stopSpeaking();
    if (!textInput.trim() || isProcessing) return;
    const text = textInput.trim();
    setTextInput('');
    addMessage(text, 'user');
    addMessage('Processing...', 'bot');
    setIsProcessing(true);
    if (conversationPhase === 'initial') await sendInitialText(text);
    else if (conversationPhase === 'follow-up') await sendFollowUpText(text);
  };

  // ── Quick Touch Answers ──
  const handleQuickAnswer = async (answer) => {
    stopSpeaking();
    if (isProcessing) return;
    addMessage(answer, 'user');
    addMessage('Processing...', 'bot');
    setIsProcessing(true);
    if (conversationPhase === 'initial') await sendInitialText(answer);
    else if (conversationPhase === 'follow-up') await sendFollowUpText(answer);
  };

  // ── Skip (Demo) ──
  const handleSkipDemo = async () => {
    stopSpeaking();
    if (isProcessing) return;
    setIsProcessing(true);
    addMessage('Skipping... generating demo patient and lab report...', 'bot');
    try {
      const selectedAbha = patient?.abhaId || '12-3456-7890-1234';
      const response = await fetch(`${API_BASE_URL}/demo-data?abha_id=${encodeURIComponent(selectedAbha)}`, { method: 'POST' });
      const data = await response.json();
      if (data.patient_id) {
        setPatientId(data.patient_id);
        setTimeout(() => navigate('/specialty'), 1000);
      }
    } catch (error) {
      console.error(error);
      removeLastBotMessage();
      addMessage('Error generating demo data', 'bot');
      setIsProcessing(false);
    }
  };

  // ── API Calls ──
  const sendInitialAudio = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', languageLabel);
      formData.append('is_ayush', isAyush);
      if (patient?.abhaId) formData.append('abha_id', patient.abhaId);
      if (patient?.name) formData.append('patient_name', patient.name);
      if (patient?.age) formData.append('age', patient.age);
      if (patient?.gender) formData.append('gender', patient.gender);
      if (patient?.phone) formData.append('phone', patient.phone);

      const response = await fetch(`${API_BASE_URL}/process-audio`, { method: 'POST', body: formData });
      const data = await response.json();
      handleInitialResponse(data);
    } catch (error) {
      removeLastBotMessage();
      addMessage('Sorry, there was an error. Please try again.', 'bot');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendInitialText = async (transcript) => {
    try {
      const formData = new FormData();
      formData.append('transcript', transcript);
      formData.append('language', languageLabel);
      formData.append('is_ayush', isAyush);
      if (patient?.abhaId) formData.append('abha_id', patient.abhaId);
      if (patient?.name) formData.append('patient_name', patient.name);
      if (patient?.age) formData.append('age', patient.age);
      if (patient?.gender) formData.append('gender', patient.gender);
      if (patient?.phone) formData.append('phone', patient.phone);

      const response = await fetch(`${API_BASE_URL}/process-text`, { method: 'POST', body: formData });
      const data = await response.json();
      handleInitialResponse(data);
    } catch (error) {
      removeLastBotMessage();
      addMessage('Sorry, there was an error. Please try again.', 'bot');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitialResponse = (data) => {
    if (data.patient_id) setPatientId(data.patient_id);
    removeLastBotMessage();
    const q = data.next_question || getFirstFollowUp(languageLabel);
    addMessage(q, 'bot');
    setConversationPhase('follow-up');
    setConversationContext(`Initial complaint: ${data.extracted_complaint}\nBot: ${q}`);
    setProgress(30);
  };

  const sendFollowUpAudio = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', languageLabel);
      formData.append('patient_id', patientId);
      formData.append('conversation_context', conversationContext);
      formData.append('is_ayush', isAyush);
      formData.append('follow_up_count', followUpCount);
      const response = await fetch(`${API_BASE_URL}/follow-up`, { method: 'POST', body: formData });
      const data = await response.json();
      handleFollowUpResponse(data);
    } catch (error) {
      removeLastBotMessage();
      addMessage('Sorry, there was an error processing your response.', 'bot');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendFollowUpText = async (transcript) => {
    try {
      const formData = new FormData();
      formData.append('transcript', transcript);
      formData.append('language', languageLabel);
      formData.append('patient_id', patientId);
      formData.append('conversation_context', conversationContext);
      formData.append('is_ayush', isAyush);
      formData.append('follow_up_count', followUpCount);
      const response = await fetch(`${API_BASE_URL}/follow-up-text`, { method: 'POST', body: formData });
      const data = await response.json();
      handleFollowUpResponse(data);
    } catch (error) {
      removeLastBotMessage();
      addMessage('Sorry, there was an error processing your response.', 'bot');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFollowUpResponse = (data) => {
    removeLastBotMessage();
    if (!data) {
      addMessage('Sorry, there was an error processing your response.', 'bot');
      return;
    }
    setConversationContext(prev => prev + `\nPatient: ${data.transcript || ''}`);
    setFollowUpCount(prev => prev + 1);
    setProgress(prev => Math.min(prev + 20, 90));

    if (followUpCount >= 5 || (data.is_complete && followUpCount >= 5)) {
      addMessage('Thank you for providing all the information.', 'bot');
      setConversationPhase('complete');
      setProgress(100);
      setClinicalData(data);
      setTimeout(() => {
        navigate('/document-scan');
      }, 2000);
    } else {
      const nextQ = data.next_question || getNextQuestion(languageLabel, followUpCount);
      addMessage(nextQ, 'bot');
      setConversationContext(prev => prev + `\nBot: ${nextQ}`);
    }
  };

  // ── Quick Symptom Buttons ──
  const quickSymptoms = [
    { label: t('fever'), icon: '🤒', sub: 'Fever & chills', value: 'I have fever and chills' },
    { label: t('chest_pain'), icon: '💔', sub: 'Chest discomfort', value: 'I have chest pain' },
    { label: t('stomach'), icon: '🤢', sub: 'Abdominal pain', value: 'I have stomach pain and nausea' },
    { label: t('cough'), icon: '🫁', sub: 'Persistent cough', value: 'I have continuous cough' },
    { label: t('joint_pain'), icon: '🦴', sub: 'Joint & bone pain', value: 'I have joint pain and stiffness' },
    { label: t('headache'), icon: '🤕', sub: 'Severe headache', value: 'I have severe headache' },
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'stretch',
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
      padding: '0'
    }}>
      {/* ═══ Centered Kiosk Terminal Console ═══ */}
      <div style={{
        width: '100%',
        maxWidth: '860px',
        height: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        borderLeft: '1px solid #cbd5e1',
        borderRight: '1px solid #cbd5e1',
        position: 'relative'
      }}>

        {/* ── Top Header Bar ── */}
        <div style={{
          padding: '12px 20px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Brand & Patient Identification */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '8px',
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, flexShrink: 0
            }}>
              +
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  MediKiosk
                </span>
                <span style={{
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                  borderRadius: '12px', padding: '1px 8px', fontSize: '10px', fontWeight: 700
                }}>
                  AI Intake
                </span>
                <span style={{
                  background: isAyush ? '#f0fdf4' : '#f8fafc',
                  color: isAyush ? '#166534' : '#334155',
                  border: `1px solid ${isAyush ? '#bbf7d0' : '#e2e8f0'}`,
                  borderRadius: '12px', padding: '1px 8px', fontSize: '10px', fontWeight: 600
                }}>
                  {isAyush ? '🌿 AYUSH OPD' : '🩺 General OPD'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {patient?.name ? (
                  <span>
                    👤 <strong>{patient.name}</strong>
                    {patient.age ? ` (${patient.age}${patient.gender ? patient.gender.charAt(0).toUpperCase() : ''})` : ''}
                    {patient.abhaId && <span style={{ fontFamily: 'monospace', marginLeft: '4px' }}>• ABHA: {patient.abhaId}</span>}
                  </span>
                ) : (
                  <span>{languageLabel} • {t('kiosk_title')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Status Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '20px',
              padding: '3px 10px', fontSize: '11px', color: '#334155', fontWeight: 600
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
              🔊 Audio Active
            </div>
            <button
              onClick={handleSkipDemo}
              disabled={isProcessing}
              style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px',
                padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#475569',
                cursor: isProcessing ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease'
              }}
              title="Skip triage with pre-populated demo data"
            >
              Skip (Demo)
            </button>
          </div>
        </div>

        {/* ── Clinical Progress Strip ── */}
        <div style={{ padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: conversationPhase === 'initial' ? '#1d4ed8' : '#64748b'
              }}>
                1. Chief Complaint
              </span>
              <span style={{ color: '#cbd5e1', fontSize: '10px' }}>→</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: conversationPhase === 'follow-up' ? '#1d4ed8' : '#64748b'
              }}>
                2. Details & HPI
              </span>
              <span style={{ color: '#cbd5e1', fontSize: '10px' }}>→</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: conversationPhase === 'complete' ? '#1d4ed8' : '#94a3b8'
              }}>
                3. Scan & Finish
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>
              {progress}%
            </span>
          </div>
          <div className="progress-bar" style={{ height: '6px' }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* ── Chat Messages Stream ── */}
        <div className="chat-container" style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: '14px', background: '#f8fafc'
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              alignSelf: msg.type === 'bot' ? 'flex-start' : 'flex-end',
              maxWidth: msg.type === 'bot' ? '88%' : '80%',
              flexDirection: msg.type === 'bot' ? 'row' : 'row-reverse'
            }}>
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '10px',
                background: msg.type === 'bot' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#334155',
                color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: msg.type === 'bot' ? '18px' : '14px', flexShrink: 0,
                boxShadow: msg.type === 'bot' ? '0 2px 6px rgba(29,78,216,0.2)' : 'none'
              }}>
                {msg.type === 'bot' ? '🩺' : '👤'}
              </div>

              {/* Bubble Body */}
              <div style={{
                background: msg.type === 'bot' ? '#ffffff' : '#1d4ed8',
                color: msg.type === 'bot' ? '#0f172a' : '#ffffff',
                border: msg.type === 'bot' ? '1px solid #e2e8f0' : 'none',
                borderRadius: '16px',
                borderTopLeftRadius: msg.type === 'bot' ? '4px' : '16px',
                borderTopRightRadius: msg.type === 'bot' ? '16px' : '4px',
                padding: '12px 16px',
                boxShadow: msg.type === 'bot' ? '0 1px 4px rgba(0,0,0,0.04)' : '0 2px 8px rgba(29,78,216,0.2)',
                flex: 1
              }}>
                {msg.type === 'bot' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', letterSpacing: '0.02em' }}>
                      MediKiosk Clinical AI
                    </span>
                    {msg.text !== 'Processing...' && msg.text !== 'Listening...' && (
                      <button
                        onClick={() => speakText(msg.text)}
                        style={{
                          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px',
                          padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#1d4ed8',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px',
                          transition: 'all 0.15s ease'
                        }}
                        title="Replay audio"
                      >
                        🔊 Listen
                      </button>
                    )}
                  </div>
                )}

                {msg.text === 'Processing...' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px', padding: '4px 0' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d4ed8', animation: 'typingDot 1.4s infinite 0s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d4ed8', animation: 'typingDot 1.4s infinite 0.2s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d4ed8', animation: 'typingDot 1.4s infinite 0.4s' }} />
                    </div>
                    <span>{t('processing')}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '14.5px', lineHeight: 1.6, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* ── Quick Symptom Touch Cards (Initial Phase) ── */}
        {conversationPhase === 'initial' && !isProcessing && (
          <div style={{
            padding: '12px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
              👆 {t('tap_symptom')}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {quickSymptoms.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleQuickAnswer(s.value)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#1d4ed8';
                    e.currentTarget.style.background = '#f0f7ff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{s.icon}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {s.sub}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Quick Yes / No / Not Sure (Follow-up Phase) ── */}
        {conversationPhase === 'follow-up' && !isProcessing && (
          <div style={{
            padding: '10px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <button
                onClick={() => handleQuickAnswer('Yes')}
                style={{
                  background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                  borderRadius: '10px', padding: '10px 14px', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>✓</span> {t('yes')}
              </button>
              <button
                onClick={() => handleQuickAnswer('No')}
                style={{
                  background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
                  borderRadius: '10px', padding: '10px 14px', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>✕</span> {t('no')}
              </button>
              <button
                onClick={() => handleQuickAnswer('Not sure')}
                style={{
                  background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1',
                  borderRadius: '10px', padding: '10px 14px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🤷</span> {t('not_sure')}
              </button>
            </div>
          </div>
        )}

        {/* ── Kiosk Voice & Text Console (Bottom Dock) ── */}
        {conversationPhase !== 'complete' && (
          <div style={{
            padding: '14px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* Primary Voice Mic Action Bar */}
            <button
              onClick={handleMicClick}
              disabled={isProcessing}
              style={{
                width: '100%',
                minHeight: 50,
                borderRadius: '10px',
                background: isRecording
                  ? '#b91c1c'
                  : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '15px',
                fontWeight: 700,
                border: 'none',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: isRecording
                  ? '0 4px 16px rgba(185,28,28,0.35)'
                  : '0 2px 10px rgba(29,78,216,0.25)',
                animation: isRecording ? 'pulse-ring 1.5s infinite' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{isRecording ? '⏹' : '🎙️'}</span>
              <span>
                {isRecording
                  ? 'सुन रहे हैं... समाप्त करने के लिए टैप करें (Listening... Tap to finish)'
                  : `बोलकर बताएं (Tap to Speak in ${languageLabel})`}
              </span>
              {isRecording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '6px' }}>
                  <span style={{ width: 3, background: '#fff', borderRadius: 2, animation: 'waveBar 0.8s infinite 0s' }} />
                  <span style={{ width: 3, background: '#fff', borderRadius: 2, animation: 'waveBar 0.8s infinite 0.2s' }} />
                  <span style={{ width: 3, background: '#fff', borderRadius: 2, animation: 'waveBar 0.8s infinite 0.4s' }} />
                  <span style={{ width: 3, background: '#fff', borderRadius: 2, animation: 'waveBar 0.8s infinite 0.1s' }} />
                </div>
              )}
            </button>

            {/* Secondary Keyboard / Text Input Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                className="input"
                placeholder={isRecording ? t('recording') : `${t('type_answer')} (Or type here...)`}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                disabled={isProcessing || isRecording}
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: '8px 14px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc'
                }}
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isProcessing}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: '8px',
                  background: (!textInput.trim() || isProcessing) ? '#e2e8f0' : '#1d4ed8',
                  color: (!textInput.trim() || isProcessing) ? '#94a3b8' : '#ffffff',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: (!textInput.trim() || isProcessing) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                title="Send message"
              >
                ➤
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Helpers ──
function getGreeting(lang) {
  const greetings = {
    'Hindi': 'नमस्ते! मैं MediKiosk AI हूँ। मैं आपकी चिकित्सा जानकारी एकत्र करने में मदद करूँगा।\n\nआपको आज डॉक्टर से मिलने की क्या समस्या है?',
    'Tamil': 'வணக்கம்! நான் MediKiosk AI. உங்கள் மருத்துவ வரலாற்றைச் சேகரிக்க உதவுவேன்.\n\nஇன்று நீங்கள் மருத்துவரை சந்திக்க என்ன பிரச்சனை?',
    'Telugu': 'నమస్కారం! నేను MediKiosk AI. మీ వైద్య చరిత్రను సేకరించడంలో సహాయపడతాను.\n\nమీరు ఈరోజు డాక్టర్‌ను ఎందుకు కలుస్తున్నారు?',
    'Bengali': 'নমস্কার! আমি MediKiosk AI। আপনার চিকিৎসা ইতিহাস সংগ্রহ করতে সাহায্য করব।\n\nআজ আপনি কি সমস্যায় ডাক্তারের কাছে এসেছেন?',
    'Marathi': 'नमस्कार! मी MediKiosk AI आहे। मी तुमचा वैद्यकीय इतिहास गोळा करण्यात मदत करीन।\n\nआज तुम्हाला डॉक्टरांना भेटायला काय त्रास आहे?',
  };
  return greetings[lang] || 'Hello! I am MediKiosk AI. I will help collect your medical history.\n\nWhat is the main health issue that brings you here today?';
}

function getFirstFollowUp(lang) {
  const followups = {
    'Hindi': 'अब मैं और जानना चाहता हूँ। क्या आप बता सकते हैं कि तकलीफ़ कहाँ है, कब शुरू हुई, और कितनी तेज़ है?',
    'Tamil': 'இப்போது நான் மேலும் புரிந்துகொள்ள விரும்புகிறேன். வலி எங்கு உள்ளது, எப்போது ஆரம்பித்தது, எவ்வளவு கடுமையானது?',
    'Telugu': 'ఇప్పుడు నేను మరింత అర్థం చేసుకోవాలనుకుంటున్నాను. నొప్పి ఎక్కడ ఉంది, ఎప్పుడు ప్రారంభమైంది, ఎంత తీవ్రమైనది?',
  };
  return followups[lang] || "Now I'd like to understand more. Can you describe where the discomfort is, when it started, and how severe it is?";
}

function getNextQuestion(lang, count) {
  const questions = {
    'Hindi': [
      'क्या आप बता सकते हैं कि यह दर्द या तकलीफ़ आपके शरीर में कहीं और फैलती है? क्या इसके साथ कोई और लक्षण हैं जैसे बुखार या उल्टी?',
      'क्या आपने इसके लिए कोई दवा ली है? क्या किसी चीज़ से आराम मिलता है या यह और बढ़ जाता है?',
      'क्या आपको पहले कभी ऐसी समस्या हुई है या आपके परिवार में किसी को ऐसी बीमारी है?',
      'क्या आपको किसी दवा, खाने-पीने की चीज़ या किसी अन्य चीज़ से कोई एलर्जी है?'
    ],
    'Tamil': [
      'இந்த அசௌகரியம் உங்கள் உடலின் வேறு எங்காவது பரவுகிறதா? காய்ச்சல் அல்லது வாந்தி போன்ற வேறு ஏதேனும் அறிகுறிகள் உள்ளதா?',
      'இதற்காக நீங்கள் ஏதேனும் மருந்து எடுத்துக்கொண்டீர்களா? எதையாவது செய்தால் இது குறைகிறதா அல்லது அதிகரிக்கிறதா?',
      'இதற்கு முன் உங்களுக்கு இந்த பிரச்சனை வந்திருக்கிறதா, அல்லது உங்கள் குடும்பத்தில் யாருக்காவது இதே போன்ற நிலை உள்ளதா?',
      'உங்களுக்கு ஏதேனும் மருந்து, உணவு அல்லது வேறு எதற்காவது ஒவ்வாமை (Allergy) உள்ளதா?'
    ],
    'Telugu': [
      'ఈ అసౌకర్యం మీ శరీరంలో మరెక్కడికైనా వ్యాపిస్తుందా? జ్వరం లేదా వాంతులు వంటి ఇతర లక్షణాలు ఏమైనా ఉన్నాయా?',
      'దీని కోసం మీరు ఏమైనా మందులు తీసుకున్నారా? ఏదైనా చేస్తే ఇది తగ్గుతుందా లేదా పెరుగుతుందా?',
      'మీకు ఇంతకు ముందు ఈ సమస్య ఎప్పుడైనా వచ్చిందా, లేదా మీ కుటుంబంలో ఎవరికైనా ఇలాంటి పరిస్థితి ఉందా?',
      'మీకు ఏదైనా మందు, ఆహారం లేదా మరేదైనా వస్తువు వల్ల అలెర్జీ ఉందా?'
    ]
  };

  const fallback = [
    "Can you describe if this discomfort spreads anywhere else in your body? Are there any other symptoms?",
    "Have you taken any medication for this? Does anything make it feel better or worse?",
    "Have you ever had this problem before, or does anyone in your family have a similar condition?",
    "Do you have any known allergies to medications, food, or anything else?"
  ];

  const langQs = questions[lang] || fallback;
  return langQs[count] || 'Thank you. Is there anything else you would like to add?';
}
