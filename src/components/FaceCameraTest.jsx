import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';

// Uji akses kamera saja. Tidak mengambil snapshot, mengirim frame, atau menyimpan foto.
export default function FaceCameraTest({ onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('Meminta izin kamera...');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!window.isSecureContext) throw new Error('Kamera hanya dapat digunakan melalui HTTPS atau localhost.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak menyediakan akses kamera.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('Kamera aktif. Ini hanya uji tampilan kamera.');
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Kamera tidak dapat dibuka.');
          setStatus('Kamera belum aktif');
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return <div className="face-camera-test">
    <div className="face-camera-head">
      <div><b><Camera size={17}/> Uji kamera wajah</b><small>{status}</small></div>
      <button type="button" className="small-btn" onClick={onClose}><CameraOff size={15}/> Tutup</button>
    </div>
    <div className="face-camera-stage">
      <video ref={videoRef} autoPlay muted playsInline />
      <div className="face-camera-guide" aria-hidden="true" />
    </div>
    {error && <div className="alert error">{error}</div>}
    <div className="alert info"><ShieldCheck size={16}/> Privasi: kamera hanya menampilkan video langsung. Tidak ada foto yang diambil, diunggah, atau disimpan. Belum ada pengenalan wajah pada tahap ini.</div>
  </div>;
}
