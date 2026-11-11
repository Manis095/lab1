import { useRef, useState } from 'react';
import { useWebcam } from './hooks/useWebcam';
import { useRiconoscitore, type SnapshotData } from './hooks/useRiconoscitore';
import './App.css';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attivo, setAttivo] = useState(false);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [lastSnapshot, setLastSnapshot] = useState<SnapshotData | null>(null);
  
  const errore = useWebcam(videoRef, attivo);
  const percezione = useRiconoscitore(videoRef, attivo, delegate);

  const toggleDelegate = () => {
    setDelegate(prev => (prev === 'GPU' ? 'CPU' : 'GPU'));
  };

  const handleCaptureSnapshot = () => {
    const snapshot: SnapshotData = {
      timestamp: new Date().toISOString(),
      delegate,
      inferenceTimeMs: percezione.inferenceTimeMs,
      avgInferenceTimeMs: percezione.avgInferenceTimeMs,
      calibrated: percezione.calibrated,
      isDistracted: percezione.isDistracted,
      yawDev: percezione.yawDev,
      pitchDev: percezione.pitchDev,
      gazeDev: percezione.gazeDev,
      allBlendshapes: percezione.allBlendshapes,
    };
    setLastSnapshot(snapshot);
  };

  const handleDownloadJSON = () => {
    if (!lastSnapshot) return;
    const blob = new Blob([JSON.stringify(lastSnapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snapshot-${delegate}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>Supervisore dello Studio — Percezione Distrazione</h2>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
        <button 
          onClick={() => setAttivo(prev => !prev)} 
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        >
          {attivo ? "Disattiva Webcam" : "Attiva Webcam"}
        </button>

        <button
          onClick={toggleDelegate}
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px', 
            cursor: 'pointer', 
            backgroundColor: delegate === 'GPU' ? '#28a745' : '#ffc107',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          Modalità: {delegate}
        </button>

        {attivo && (
          <button 
            onClick={handleCaptureSnapshot}
            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Cattura Istantanea
          </button>
        )}
      </div>

      {errore && (
        <p style={{ color: 'red' }}>
          Errore Webcam: {errore}
        </p>
      )}

      <div className="contenitore-video">
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className="specchio"
        />
      </div>

      {attivo && (
        <div style={{ marginTop: '20px', maxWidth: '640px', margin: '0 auto', textAlign: 'left' }}>
          <div style={{ padding: '10px 14px', backgroundColor: '#eef', borderRadius: '4px', marginBottom: '15px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
            <span>Delegate: <strong>{delegate}</strong></span>
            <span>Ultimo: <strong>{percezione.inferenceTimeMs.toFixed(2)} ms</strong></span>
            <span>Media: <strong>{percezione.avgInferenceTimeMs.toFixed(2)} ms</strong></span>
          </div>

          {!percezione.calibrated ? (
            <div>
              <p>Calibrazione in corso: mantieni lo sguardo sul monitor a volto rilassato...</p>
              <progress value={percezione.calibrationProgress} max={1} style={{ width: '100%' }} />
            </div>
          ) : (
            <div style={{ 
              padding: '15px', 
              borderRadius: '8px', 
              backgroundColor: percezione.isDistracted ? '#ffcccc' : '#e6ffe6',
              border: `2px solid ${percezione.isDistracted ? 'red' : 'green'}`
            }}>
              <h3>Stato Utente: {percezione.isDistracted ? "DISTRACTED (Lampada Giudica)" : "CONCENTRATED"}</h3>
              
              <div>
                <label>Deviazione Yaw (Rotazione Orizzontale): {percezione.yawDev.toFixed(1)}°</label>
                <progress value={Math.min(percezione.yawDev, 30)} max={30} style={{ width: '100%' }} />
              </div>

              <div style={{ marginTop: '10px' }}>
                <label>Deviazione Pitch (Inclinazione Verticale): {percezione.pitchDev.toFixed(1)}°</label>
                <progress value={Math.min(percezione.pitchDev, 30)} max={30} style={{ width: '100%' }} />
              </div>

              <div style={{ marginTop: '10px' }}>
                <label>Deviazione Sguardo: {percezione.gazeDev.toFixed(2)}</label>
                <progress value={Math.min(percezione.gazeDev, 1)} max={1} style={{ width: '100%' }} />
              </div>
            </div>
          )}

          {lastSnapshot && (
            <div style={{ 
              padding: '15px', 
              borderRadius: '8px', 
              backgroundColor: '#fff3cd', 
              border: '1px solid #ffeeba',
              marginTop: '15px' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Ultimo Snapshot ({lastSnapshot.delegate}): {lastSnapshot.timestamp.split('T')[1].slice(0, 8)}</h4>
                <button onClick={handleDownloadJSON} style={{ cursor: 'pointer', padding: '5px 10px' }}>
                  Scarica JSON
                </button>
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                Inclinazione: Yaw {lastSnapshot.yawDev.toFixed(1)}°, Pitch {lastSnapshot.pitchDev.toFixed(1)}° | Sguardo: {lastSnapshot.gazeDev.toFixed(2)} | Inferenza Media: {lastSnapshot.avgInferenceTimeMs.toFixed(2)} ms
              </p>
            </div>
          )}

          <div style={{ 
            padding: '15px', 
            borderRadius: '8px', 
            backgroundColor: '#222',
            color: '#fff',
            marginTop: '15px'
          }}>
            <h3>Coefficienti Grezzi Attivi (&ge; 0.20)</h3>
            {(percezione.activeCoefficients?.length ?? 0) === 0 ? (
              <p>Nessun coefficiente sopra 0.20 (Volto a riposo/neutro)</p>
            ) : (
              <ul style={{ columnCount: 2, listStyleType: 'none', paddingLeft: 0 }}>
                {percezione.activeCoefficients.map(c => (
                  <li key={c.name} style={{ fontFamily: 'monospace', marginBottom: '4px' }}>
                    <strong>{c.name}:</strong> {c.score.toFixed(3)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}