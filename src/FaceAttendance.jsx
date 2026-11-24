import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanFace, X, LoaderCircle } from 'lucide-react';

const MODEL_BASE = 'https://vladmandic.github.io/human-models/models/';

function normalize(vector) {
  if (!Array.isArray(vector) || vector.length < 128 || vector.length > 1024) {
    throw new Error('Model tidak menghasilkan template wajah yang valid.');
  }
  const values = vector.map(Number);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm < 1e-8) throw new Error('Template wajah kosong.');
  return values.map(value => value / norm);
}

export default function FaceAttendance({ db, selected, jamaah, markPresent, isAdmin, initialMemberId = '', initialMode = 'match', onClose, hideTrigger = false }) {
  const [open, setOpen] = useState(Boolean(initialMemberId));
  const [mode, setMode] = useState(initialMode);
  const [memberId, setMemberId] = useState('');
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [withdrawingFace, setWithdrawingFace] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [enrollSector, setEnrollSector] = useState('');
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [sectorPickerOpen, setSectorPickerOpen] = useState(false);
  const [consentType, setConsentType] = useState('parent_or_guardian');
  const [guardianName, setGuardianName] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentSaved, setConsentSaved] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [status, setStatus] = useState('Siap memulai pemindaian wajah.');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [recognized, setRecognized] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const humanRef = useRef(null);
  const busyRef = useRef(false);
  const lastRunRef = useRef(0);
  const lastUnknownAudioRef = useRef(0);
  const active = jamaah.filter(person => person.status === 'aktif');
  const activeSectors = [...new Set(active.map(person => person.sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  const sectorMembers = active.filter(person => person.sector === enrollSector).sort((a,b)=>a.name.localeCompare(b.name,'id'));


  async function chooseMember(person) {
    setMemberId(person.id);
    setAlreadyEnrolled(false);
    setError('');
    setStatus('Memeriksa status pendaftaran wajah ' + person.name + '...');
    try {
      const { data, error: statusError } = await db.functions.invoke('face-biometric', {
        body: { action: 'status', jamaah_id: person.id },
      });
      if (statusError) throw statusError;
      if (data?.enrolled) {
        setAlreadyEnrolled(true);
        setStatus('Wajah ' + person.name + ' sudah terdaftar. Tidak perlu mendaftarkan ulang.');
        setError('Wajah jamaah ini sudah terdaftar. Pilih jamaah lain atau gunakan Scan Absensi.');
        playAlreadyRegisteredAudio();
      } else {
        setStatus('Wajah belum terdaftar. Silakan lanjutkan pendaftaran.');
      }
    } catch (e) {
      setError(e?.message || 'Gagal memeriksa status pendaftaran wajah.');
      setStatus('Status pendaftaran belum dapat diperiksa.');
    }
  }


  async function removeRegisteredFace() {
    if (!memberId || !alreadyEnrolled || withdrawingFace) return;
    const person = active.find(item => item.id === memberId);
    const name = person?.name || 'jamaah ini';
    setConfirmRemoveOpen(true);
  }

  async function confirmRemoveRegisteredFace() {
    if (!memberId || !alreadyEnrolled || withdrawingFace) return;
    const person = active.find(item => item.id === memberId);
    const name = person?.name || 'jamaah ini';
    setConfirmRemoveOpen(false);
    setWithdrawingFace(true);
    setError('');
    setStatus('Menghapus data wajah ' + name + '...');
    try {
      const { data, error: invokeError } = await db.functions.invoke('face-biometric', {
        body: { action: 'withdraw', jamaah_id: memberId },
      });
      if (invokeError) {
        let detail = invokeError.message || 'Penghapusan data wajah gagal.';
        try {
          const response = invokeError.context;
          if (response && typeof response.clone === 'function') {
            const payload = await response.clone().json();
            if (payload?.error) detail = payload.error;
          }
        } catch {}
        throw new Error(detail);
      }
      setAlreadyEnrolled(false);
      setConsentSaved(false);
      setConsentConfirmed(false);
      setGuardianName('');
      setStatus(data?.message || ('Data wajah ' + name + ' berhasil dihapus. Jamaah dapat didaftarkan ulang dengan data yang benar.'));
      setError('');
    } catch (e) {
      setError(e?.message || 'Penghapusan data wajah gagal. Silakan coba kembali.');
      setStatus('Data wajah belum berhasil dihapus.');
    } finally {
      setWithdrawingFace(false);
    }
  }

  function playFaceAudio(file, fallbackText) {
    let fallbackUsed = false;
    const fallback = () => {
      if (fallbackUsed) return;
      fallbackUsed = true;
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        utterance.lang = 'id-ID';
        utter.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.warn('Suara cadangan tidak tersedia:', error);
      }
    };
    try {
      const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      const audio = new Audio(base + '/storage/v1/object/public/absensi-voice/' + file);
      audio.preload = 'auto';
      audio.volume = 1;
      audio.onerror = fallback;
      const result = audio.play();
      if (result && typeof result.catch === 'function') result.catch(fallback);
    } catch (error) {
      console.warn('Audio wajah gagal dimuat:', error);
      fallback();
    }
  }
  function playFaceEnrollmentSuccessAudio() {
    playFaceAudio('wajah-terdaftar.mp3', 'Pendaftaran wajah berhasil.');
  }

  function playUnknownFaceAudio() {
    playFaceAudio('wajah-tidak-terdaftar.mp3', 'Wajah belum terdaftar.');
  }

  function playAlreadyRegisteredAudio() {
    playFaceAudio('wajah-sudah-terdaftar.mp3', 'Wajah jamaah ini sudah terdaftar.');
  }

  useEffect(() => {
    if (!initialMemberId) return;
    const person = active.find(item => item.id === initialMemberId);
    if (person) {
      setEnrollSector(person.sector || '');
      chooseMember(person);
    }
  }, [initialMemberId]);

  async function loadModel() {
    if (humanRef.current) return humanRef.current;
    setStatus('Memuat model pengenalan wajah ke perangkat...');
    const module = await import('@vladmandic/human');
    const Human = module.default || module.Human;
    const config = {
      modelBasePath: MODEL_BASE,
      cacheSensitivity: 0.01,
      face: {
        enabled: true,
        detector: { maxDetected: 2, rotation: true },
        mesh: { enabled: true },
        description: { enabled: true },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        iris: { enabled: false },
        emotion: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
    };
    let human;
    try {
      human = new Human({ ...config, backend: 'webgl' });
      await human.load();
      await human.warmup();
    } catch (webglError) {
      try { human?.dispose?.(); } catch {}
      setStatus('Grafik HP tidak mendukung model penuh. Mencoba mode kompatibilitas...');
      human = new Human({ ...config, backend: 'cpu' });
      await human.load();
      await human.warmup();
    }
    humanRef.current = human;
    return human;
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!open) return;
      // SAFETY: temporarily block facial-recognition attendance after a false-positive report.
      // Do not open the camera or auto-mark attendance until the threshold/liveness pipeline is calibrated.
      if (mode === 'match') {
        setError('Absensi wajah sementara dinonaktifkan karena hasil pengenalan dapat salah. Gunakan QR atau absensi manual sampai sistem diperbaiki dan diuji.');
        setStatus('Scan wajah ditangguhkan demi mencegah salah catat kehadiran.');
        setOpen(false);
        return;
      }
      try {
        setError('');
        if (mode === 'match' && !selected) throw new Error('Pilih agenda kegiatan terlebih dahulu.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera membutuhkan HTTPS dan izin kamera dari Chrome.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (!videoRef.current) throw new Error('Kamera belum siap.');
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        await loadModel();
        if (!cancelled) setStatus(mode === 'enroll' ? 'Arahkan wajah jamaah ke kamera untuk pendaftaran.' : 'Kamera aktif. Posisikan satu wajah di tengah kamera.');
      } catch (e) {
        if (!cancelled) { setError(e.message || 'Kamera atau model wajah gagal dimuat.'); setOpen(false); }
      }
    }
    start();
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    };
  }, [open, selected, mode]);

  async function processFace() {
    if (busyRef.current || !videoRef.current || !humanRef.current || working) return;
    busyRef.current = true;
    setWorking(true);
    try {
      const result = await humanRef.current.detect(videoRef.current);
      const faces = result.face || [];
      if (faces.length !== 1 || !faces[0].embedding) {
        setStatus(faces.length > 1 ? 'Hanya satu jamaah boleh berada di depan kamera.' : 'Wajah belum terdeteksi. Dekatkan wajah ke kamera.');
        return;
      }
      const embedding = normalize(faces[0].embedding);
      if (mode === 'enroll') {
        if (!memberId) throw new Error('Pilih nama jamaah yang akan didaftarkan.');
        if (!consentSaved) throw new Error('Simpan data jamaah dan persetujuan terlebih dahulu.');
        if (!consentConfirmed) throw new Error('Persetujuan jamaah atau orang tua/wali wajib dikonfirmasi.');
        if (consentType === 'parent_or_guardian' && !guardianName.trim()) throw new Error('Nama orang tua/wali wajib diisi.');
        const { error: invokeError } = await db.functions.invoke('face-biometric', {
          body: {
            action: 'enroll',
            jamaah_id: memberId,
            embedding,
            consent_subject: consentType,
            guardian_name: consentType === 'parent_or_guardian' ? guardianName.trim() : null,
            consent_version: 'sodikuna-face-consent-v1',
            consent_confirmed: true,
          },
        });
        if (invokeError) throw invokeError;
        setStatus('Pendaftaran wajah berhasil. Template biometrik sudah tersimpan.');
        setError('');
        playFaceEnrollmentSuccessAudio();
        setAlreadyEnrolled(true);
        setConsentConfirmed(false);
        setConsentSaved(false);
        setMemberId('');
        setGuardianName('');
      } else {
        setStatus('Mencocokkan wajah dengan template terdaftar...');
        const { data, error: invokeError } = await db.functions.invoke('face-biometric', {
          body: { action: 'match', jamaah_id: active[0]?.id, embedding },
        });
        if (invokeError) throw invokeError;
        if (!data?.matched || !data?.jamaah_id) {
          setStatus('Wajah belum terdaftar pada data jamaah.');
          if (Date.now() - lastUnknownAudioRef.current > 6000) {
            lastUnknownAudioRef.current = Date.now();
            playUnknownFaceAudio();
          }
        } else {
          const person = active.find(item => item.id === data.jamaah_id);
          if (!person) throw new Error('Wajah cocok, tetapi jamaah tidak aktif atau tidak ditemukan.');
          setRecognized(person);
          setStatus('Dikenali: ' + person.name + '. Memeriksa kehadiran agenda...');
          await markPresent(person, 'face');
          setStatus('Pemeriksaan selesai untuk ' + person.name + '.');
        }
      }
    } catch (e) {
      let detail = e?.message || 'Proses pengenalan wajah gagal.';
      try {
        const response = e?.context;
        if (response && typeof response.clone === 'function') {
          const payload = await response.clone().json();
          if (payload?.error) detail = payload.error;
        }
      } catch {}
      let duplicateFace = false;
      try {
        const response = e?.context;
        if (response && typeof response.clone === 'function') {
          const payload = await response.clone().json();
          duplicateFace = payload?.duplicate_face === true;
        }
      } catch {}
      if (duplicateFace) playAlreadyRegisteredAudio();
      setError(detail);
      setStatus('Pendaftaran belum berhasil. Periksa pesan kesalahan lalu coba kembali.');
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  }

  useEffect(() => {
    // Pendaftaran wajah hanya dijalankan setelah petugas menekan tombol.
    // Pemindaian otomatis hanya aktif pada mode absensi, bukan saat form pendaftaran.
    if (!open || mode !== 'match') return;
    let frame = 0;
    const tick = timestamp => {
      if (timestamp - lastRunRef.current > 1300 && !busyRef.current) {
        lastRunRef.current = timestamp;
        processFace();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, mode, working]);

  if (!isAdmin) return null;
  return (
    <div className="face-attendance">
      {!hideTrigger && <button type="button" className="attendance-mode face-mode-ready" disabled={!selected} onClick={() => { setMode('match'); setOpen(true); setError(''); setRecognized(null); }}>
        <ScanFace size={25} />
        <span><b>Scan Wajah</b><small>Pengenalan otomatis melalui kamera HP petugas</small></span>
      </button>}
      {open && <div className="face-scanner-panel face-fullpage">
        <div className="face-scanner-head">
          <div><b>Absensi dengan pengenalan wajah</b><small>Mode otomatis · tanpa anti-spoof</small></div>
          <button type="button" onClick={() => { setOpen(false); onClose?.(); }} aria-label="Tutup"><X size={19}/></button>
        </div>
        {!initialMemberId && <div className="face-mode-tabs">
          <button type="button" className={mode === 'match' ? 'active' : ''} onClick={() => { setMode('match'); setError(''); setConsentSaved(false); }}>Scan Absensi</button>
          <button type="button" className={mode === 'enroll' ? 'active' : ''} onClick={() => { try { window.speechSynthesis?.resume(); } catch {} setMode('enroll'); setError(''); setConsentSaved(false); }}>Daftarkan Wajah</button>
        </div>}
        {mode === 'enroll' && !consentSaved && <div className="face-enroll-form">
          <label>Folder sektor</label>
          <button type="button" className="face-sector-picker-trigger" onClick={() => setSectorPickerOpen(value => !value)}>
            <span>{enrollSector || 'Pilih sektor'}</span><span>{enrollSector ? active.filter(person=>person.sector===enrollSector).length + ' jamaah' : '▼'}</span>
          </button>
          {sectorPickerOpen && <div className="face-sector-picker-grid">
            {activeSectors.map((sector,index) => <button type="button" key={sector} className={`face-sector-option ${index % 2 === 0 ? 'blue' : 'yellow'} ${enrollSector === sector ? 'selected' : ''}`} onClick={() => {setEnrollSector(sector);setMemberId('');setAlreadyEnrolled(false);setMemberPickerOpen(false);setSectorPickerOpen(false);}}>
              <b>{sector}</b><small>{active.filter(person=>person.sector===sector).length}</small>
            </button>)}
          </div>}
          <label>Nama jamaah</label>
          <button type="button" className="face-member-picker-trigger" disabled={!enrollSector} onClick={() => setMemberPickerOpen(value => !value)}>
            {sectorMembers.find(person => person.id === memberId) ? <><b>{sectorMembers.find(person => person.id === memberId).member_no}</b><span>{sectorMembers.find(person => person.id === memberId).name}</span></> : <span>{enrollSector ? 'Pilih nama jamaah' : 'Pilih sektor terlebih dahulu'}</span>}
            <span className="face-picker-chevron">{memberPickerOpen ? '▲' : '▼'}</span>
          </button>
          {memberPickerOpen && enrollSector && <div className="face-member-picker-list">
            {sectorMembers.map((person,index) => <button type="button" key={person.id} className={`face-member-option ${index % 2 === 0 ? 'blue' : 'yellow'} ${memberId === person.id ? 'selected' : ''}`} onClick={() => {chooseMember(person);setMemberPickerOpen(false);}}>
              <b>{person.member_no}</b><span>{person.name}</span>{memberId === person.id && <span className="face-member-check">✓</span>}
            </button>)}
            {!sectorMembers.length && <div className="face-member-empty">Belum ada jamaah aktif di sektor ini.</div>}
          </div>}

          {alreadyEnrolled && memberId && <div className="face-consent-saved">
            <b>⚠ Wajah jamaah ini sudah terdaftar</b>
            <span>Jika pendaftaran salah orang, hapus data wajah ini terlebih dahulu. Data jamaah dan riwayat absensi tetap aman.</span>
            <button type="button" disabled={withdrawingFace} onClick={removeRegisteredFace}>
              {withdrawingFace ? 'Menghapus data wajah...' : 'Hapus data wajah terdaftar'}
            </button>
          </div>}

          <label>Persetujuan pendaftaran biometrik</label>
          <select value={consentType} onChange={e => setConsentType(e.target.value)}>
            <option value="parent_or_guardian">Orang tua / wali</option>
            <option value="adult_self">Jamaah dewasa (persetujuan pribadi)</option>
          </select>
          {consentType === 'parent_or_guardian' && <input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Nama orang tua / wali"/>}
          <label className="face-consent-check"><input type="checkbox" checked={consentConfirmed} onChange={e => setConsentConfirmed(e.target.checked)}/> Saya memastikan persetujuan telah diberikan dan jamaah/wali memahami penggunaan template wajah untuk absensi.</label>
          {consentConfirmed && <button type="button" className="face-save-consent-button" disabled={savingConsent} onClick={() => {
            if (!memberId) { setError('Pilih nama jamaah terlebih dahulu.'); return; }
            if (consentType === 'parent_or_guardian' && !guardianName.trim()) { setError('Nama orang tua/wali wajib diisi.'); return; }
            setError('');
            setSavingConsent(true);
            setStatus('Menyimpan data pendaftaran...');
            setTimeout(() => { setConsentSaved(true); setSavingConsent(false); setStatus('Data pendaftaran siap. Arahkan wajah jamaah ke kamera.'); }, 450);
          }}>{savingConsent ? <><LoaderCircle size={16} className="face-spinner"/> Menyimpan data...</> : 'Simpan data'}</button>}
        </div>}
        {mode === 'enroll' && consentSaved && <div className="face-consent-saved"><b>✓ Data pendaftaran tersimpan sementara</b><span>Identitas dan persetujuan sudah disiapkan. Silakan daftarkan wajah di kamera.</span><button type="button" onClick={() => {setConsentSaved(false);setStatus('Silakan periksa kembali data pendaftaran.');}}>Ubah data</button></div>}
        <div className="face-camera-stage"><video ref={videoRef} playsInline muted autoPlay/><div className="face-camera-guide"/></div>
        <div className="face-status-line">{working && <LoaderCircle size={16} className="face-spinner"/>}{status}</div>
        {recognized && mode === 'match' && <div className="face-notification-card"><b>HASIL PEMINDAIAN</b><span><small>Nama:</small><strong>{recognized.name}</strong></span><span><small>No anggota:</small><strong>{recognized.member_no}</strong></span><span><small>Sektor:</small><strong>{recognized.sector || '-'}</strong></span></div>}
        {error && <div className="alert error">{error}</div>}
        {mode === 'enroll' && <button type="button" className="face-capture-button" disabled={working || alreadyEnrolled} onClick={processFace}><Camera size={17}/>Ambil dan daftarkan wajah</button>}
        {confirmRemoveOpen && <div className="face-confirm-backdrop" role="presentation">
          <div className="face-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="face-confirm-title">
            <div className="face-confirm-icon"><X size={25}/></div>
            <h3 id="face-confirm-title">Hapus pendaftaran wajah?</h3>
            <p>Data biometrik dan persetujuan wajah milik <b>{active.find(item => item.id === memberId)?.name || 'jamaah ini'}</b> akan dihapus. Data jamaah dan riwayat absensi tetap aman.</p>
            <div className="face-confirm-actions">
              <button type="button" className="face-confirm-cancel" onClick={() => setConfirmRemoveOpen(false)}>Batal</button>
              <button type="button" className="face-confirm-delete" disabled={withdrawingFace} onClick={confirmRemoveRegisteredFace}>{withdrawingFace ? 'Menghapus...' : 'Ya, hapus wajah'}</button>
            </div>
          </div>
        </div>}
        <small className="face-privacy-note">Kamera diproses di HP petugas. Yang dikirim untuk pencocokan hanya template biometrik, bukan foto wajah. Tanpa anti-spoof, sistem dapat tertipu foto atau video di depan kamera.</small>
      </div>}
    </div>
  );
}
