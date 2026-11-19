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

export default function FaceAttendance({ db, selected, jamaah, markPresent, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('match');
  const [memberId, setMemberId] = useState('');
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
  const active = jamaah.filter(person => person.status === 'aktif');
  const activeSectors = [...new Set(active.map(person => person.sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  const sectorMembers = active.filter(person => person.sector === enrollSector).sort((a,b)=>a.name.localeCompare(b.name,'id'));

  async function loadModel() {
    if (humanRef.current) return humanRef.current;
    setStatus('Memuat model pengenalan wajah ke perangkat...');
    const module = await import('@vladmandic/human');
    const Human = module.default || module.Human;
    const human = new Human({
      backend: 'webgl',
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
    });
    await human.load();
    await human.warmup();
    humanRef.current = human;
    return human;
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!open) return;
      try {
        setError('');
        if (!selected) throw new Error('Pilih agenda kegiatan terlebih dahulu.');
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
        setStatus('Pendaftaran template wajah berhasil. Foto tidak dikirim; template dienkripsi di server.');
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
          setStatus('Wajah belum cocok dengan data jamaah yang terdaftar.');
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
      setError(detail);
      setStatus('Pendaftaran belum berhasil. Periksa pesan kesalahan lalu coba kembali.');
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  }

  useEffect(() => {
    if (!open) return;
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
  }, [open, mode, memberId, consentType, guardianName, consentConfirmed, working]);

  if (!isAdmin) return null;
  return (
    <div className="face-attendance">
      <button type="button" className="attendance-mode face-mode-ready" disabled={!selected} onClick={() => { setMode('match'); setOpen(true); setError(''); setRecognized(null); }}>
        <ScanFace size={25} />
        <span><b>Scan Wajah</b><small>Pengenalan otomatis melalui kamera HP petugas</small></span>
      </button>
      {open && <div className="face-scanner-panel face-fullpage">
        <div className="face-scanner-head">
          <div><b>Absensi dengan pengenalan wajah</b><small>Mode otomatis · tanpa anti-spoof</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup"><X size={19}/></button>
        </div>
        <div className="face-mode-tabs">
          <button type="button" className={mode === 'match' ? 'active' : ''} onClick={() => { setMode('match'); setError(''); setConsentSaved(false); }}>Scan Absensi</button>
          <button type="button" className={mode === 'enroll' ? 'active' : ''} onClick={() => { setMode('enroll'); setError(''); setConsentSaved(false); }}>Daftarkan Wajah</button>
        </div>
        {mode === 'enroll' && !consentSaved && <div className="face-enroll-form">
          <label>Folder sektor</label>
          <button type="button" className="face-sector-picker-trigger" onClick={() => setSectorPickerOpen(value => !value)}>
            <span>{enrollSector || 'Pilih sektor'}</span><span>{enrollSector ? active.filter(person=>person.sector===enrollSector).length + ' jamaah' : '▼'}</span>
          </button>
          {sectorPickerOpen && <div className="face-sector-picker-grid">
            {activeSectors.map((sector,index) => <button type="button" key={sector} className={`face-sector-option ${index % 2 === 0 ? 'blue' : 'yellow'} ${enrollSector === sector ? 'selected' : ''}`} onClick={() => {setEnrollSector(sector);setMemberId('');setMemberPickerOpen(false);setSectorPickerOpen(false);}}>
              <b>{sector}</b><small>{active.filter(person=>person.sector===sector).length}</small>
            </button>)}
          </div>}
          <label>Nama jamaah</label>
          <button type="button" className="face-member-picker-trigger" disabled={!enrollSector} onClick={() => setMemberPickerOpen(value => !value)}>
            {sectorMembers.find(person => person.id === memberId) ? <><b>{sectorMembers.find(person => person.id === memberId).member_no}</b><span>{sectorMembers.find(person => person.id === memberId).name}</span></> : <span>{enrollSector ? 'Pilih nama jamaah' : 'Pilih sektor terlebih dahulu'}</span>}
            <span className="face-picker-chevron">{memberPickerOpen ? '▲' : '▼'}</span>
          </button>
          {memberPickerOpen && enrollSector && <div className="face-member-picker-list">
            {sectorMembers.map((person,index) => <button type="button" key={person.id} className={`face-member-option ${index % 2 === 0 ? 'blue' : 'yellow'} ${memberId === person.id ? 'selected' : ''}`} onClick={() => {setMemberId(person.id);setMemberPickerOpen(false);}}>
              <b>{person.member_no}</b><span>{person.name}</span>{memberId === person.id && <span className="face-member-check">✓</span>}
            </button>)}
            {!sectorMembers.length && <div className="face-member-empty">Belum ada jamaah aktif di sektor ini.</div>}
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
        {mode === 'enroll' && <button type="button" className="face-capture-button" disabled={working} onClick={processFace}><Camera size={17}/>Ambil dan daftarkan wajah</button>}
        <small className="face-privacy-note">Kamera diproses di HP petugas. Yang dikirim untuk pencocokan hanya template biometrik, bukan foto wajah. Tanpa anti-spoof, sistem dapat tertipu foto atau video di depan kamera.</small>
      </div>}
    </div>
  );
}
