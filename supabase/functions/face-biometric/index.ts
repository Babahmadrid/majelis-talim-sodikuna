import { createClient } from "npm:@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  const hostname = origin ? new URL(origin).hostname : "";
  const allowed = origin === "https://mt-sodikuna.netlify.app" ||
    hostname === "majelis-talim-sodikuna-9a68.netlify.app" ||
    hostname === "majelis-talim-sodikuna-yd3e.netlify.app" ||
    hostname.endsWith("--majelis-talim-sodikuna-yd3e.netlify.app") ||
    hostname === "majelis-talim-sodikuna-nxuz.netlify.app" ||
    hostname.endsWith("--majelis-talim-sodikuna-nxuz.netlify.app");
  return {
    ...(allowed && origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cryptoKey = Deno.env.get("FACE_ENCRYPTION_KEY")!;
const modelVersion = Deno.env.get("FACE_MODEL_VERSION") ?? "sodikuna-face-v1";

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function getAesKey() {
  if (!cryptoKey) throw new Error("FACE_ENCRYPTION_KEY belum dikonfigurasi.");
  const value = cryptoKey.trim();
  let raw: Uint8Array;
  // Terima format hex (32/48/64 karakter) maupun Base64/Base64URL.
  if (/^(?:[0-9a-f]{2}){16,32}$/i.test(value) && value.length % 2 === 0) {
    raw = Uint8Array.from(value.match(/.{2}/g)!, pair => parseInt(pair, 16));
  } else {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    } catch {
      throw new Error("Format FACE_ENCRYPTION_KEY tidak valid. Gunakan kunci acak 32 byte dalam format HEX 64 karakter atau Base64.");
    }
  }
  if (![16, 24, 32].includes(raw.length)) {
    throw new Error("Panjang FACE_ENCRYPTION_KEY tidak valid. Gunakan kunci acak 32 byte (HEX 64 karakter atau Base64).");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptEmbedding(vector: number[]) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(vector));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return { encrypted_template: `\\x${toHex(combined)}`, encryption_key_version: "aes-gcm-v1" };
}

function decodeBytea(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new Error("Format template terenkripsi tidak valid.");
  const hex = value.startsWith("\\\\x") ? value.slice(2) : value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Data template terenkripsi rusak.");
  return Uint8Array.from(hex.match(/.{2}/g)!, pair => parseInt(pair, 16));
}
async function decryptEmbedding(value: unknown): Promise<number[]> {
  const key = await getAesKey();
  const bytes = decodeBytea(value);
  if (bytes.length < 29) throw new Error("Template terenkripsi terlalu pendek.");
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!validVector(parsed)) throw new Error("Template hasil dekripsi tidak valid.");
  return parsed;
}
function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return -1;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 128 && value.length <= 1024 &&
    value.every(x => typeof x === "number" && Number.isFinite(x)) &&
    Math.abs(Math.sqrt(value.reduce((sum, x) => sum + x * x, 0)) - 1) < 0.08;
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method tidak diizinkan." }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sesi login diperlukan." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Sesi login tidak valid." }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("role").eq("id", auth.user.id).maybeSingle();
    if (profileError || !profile) return json({ error: "Profil petugas tidak ditemukan." }, 403);
    const allowedRoles = ["super_admin", "ketua", "sekretaris", "koordinator", "petugas_absensi"];
    if (!allowedRoles.includes(profile.role)) return json({ error: "Akses khusus petugas absensi/admin." }, 403);

    const body = await req.json();
    const action = body?.action;
    const jamaahId = String(body?.jamaah_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jamaahId)) return json({ error: "ID jamaah tidak valid." }, 400);

    if (action === "enroll") {
      const { consent_subject, guardian_name, consent_version, embedding, consent_confirmed } = body;
      if (consent_confirmed !== true) return json({ error: "Persetujuan belum dikonfirmasi." }, 400);
      if (!["adult_self", "parent_or_guardian"].includes(consent_subject)) return json({ error: "Jenis persetujuan tidak valid." }, 400);
      if (consent_subject === "parent_or_guardian" && !String(guardian_name ?? "").trim()) return json({ error: "Nama orang tua/wali wajib diisi." }, 400);
      if (consent_subject === "adult_self" && guardian_name) return json({ error: "Nama wali tidak diperlukan untuk persetujuan pribadi." }, 400);
      if (consent_version !== "sodikuna-face-consent-v1") return json({ error: "Versi formulir persetujuan tidak sesuai." }, 400);
      if (!validVector(embedding)) return json({ error: "Template wajah tidak valid. Pastikan model pengenalan menghasilkan vektor ternormalisasi." }, 400);
      const { data: member } = await admin.from("jamaah").select("id,status").eq("id", jamaahId).maybeSingle();
      if (!member || member.status !== "aktif") return json({ error: "Jamaah tidak ditemukan atau tidak aktif." }, 404);

      const { data: existingRows, error: existingError } = await admin.rpc("face_template_status", { p_jamaah_id: jamaahId });
      if (existingError) throw existingError;
      const existingTemplate = existingRows?.[0] ?? null;
      if (existingTemplate?.enrolled) {
        return json({ error: "Wajah jamaah ini sudah terdaftar. Tidak perlu mendaftarkan ulang." }, 409);
      }
      // Reject a face descriptor that is already enrolled under another jamaah.
      // Compare only inside the trusted Edge Function; never return biometric vectors.
      const { data: registeredRows, error: registeredError } = await admin.rpc("list_face_templates_for_match");
      if (registeredError) throw registeredError;
      const duplicateThreshold = 0.90;
      for (const row of registeredRows ?? []) {
        if (row.jamaah_id === jamaahId) continue;
        if (row.model_version !== modelVersion || row.encryption_key_version !== "aes-gcm-v1") continue;
        try {
          const registeredEmbedding = await decryptEmbedding(row.encrypted_template);
          const similarity = cosineSimilarity(embedding, registeredEmbedding);
          if (similarity >= duplicateThreshold) {
            return json({
              error: "Wajah ini sudah terdaftar pada jamaah lain. Periksa kembali nama jamaah yang dipilih atau hapus pendaftaran yang keliru terlebih dahulu.",
              duplicate_face: true,
            }, 409);
          }
        } catch {
          // Ignore malformed or undecryptable rows; never expose biometric data.
        }
      }
      const encrypted = await encryptEmbedding(embedding);
      const { error: consentError } = await admin.from("face_consents").upsert({
        jamaah_id: jamaahId, consent_subject, guardian_name: consent_subject === "parent_or_guardian" ? String(guardian_name).trim().slice(0, 160) : null,
        consent_version, granted_by: auth.user.id,
      }, { onConflict: "jamaah_id" });
      if (consentError) throw consentError;
      const { error: templateError } = await admin.rpc("store_face_template", {
        p_jamaah_id: jamaahId, p_encrypted_template: encrypted.encrypted_template,
        p_encryption_key_version: encrypted.encryption_key_version, p_model_version: modelVersion,
      });
      if (templateError) {
        await admin.from("face_consents").delete().eq("jamaah_id", jamaahId);
        throw templateError;
      }
      return json({ ok: true, message: "Pendaftaran template wajah terenkripsi berhasil." });
    }

    if (action === "withdraw") {
      const { error } = await admin.rpc("delete_face_data_for_jamaah", { p_jamaah_id: jamaahId });
      if (error) throw error;
      return json({ ok: true, message: "Data biometrik dan persetujuan aktif telah dihapus dari database." });
    }


    if (action === "match") {
      const { embedding } = body;
      if (!validVector(embedding)) return json({ error: "Template wajah tidak valid." }, 400);
      const { data: rows, error: rowsError } = await admin.rpc("list_face_templates_for_match");
      if (rowsError) throw rowsError;
      let best: { jamaah_id: string; similarity: number } | null = null;
      for (const row of rows ?? []) {
        if (row.model_version !== modelVersion || row.encryption_key_version !== "aes-gcm-v1") continue;
        try {
          const stored = await decryptEmbedding(row.encrypted_template);
          const similarity = cosineSimilarity(embedding, stored);
          if (!best || similarity > best.similarity) best = { jamaah_id: row.jamaah_id, similarity };
        } catch {
          // Skip malformed or undecryptable rows; never expose biometric payloads.
        }
      }
      return json({
        matched: Boolean(best && best.similarity >= 0.60),
        jamaah_id: best && best.similarity >= 0.60 ? best.jamaah_id : null,
        similarity: best ? Number(best.similarity.toFixed(4)) : null,
        model_version: modelVersion,
        requires_liveness: false,
        attendance_recorded: false
      });
    }

    if (action === "checkin") {
      return json({ error: "Absensi wajah belum diaktifkan: model pengenalan dan pemeriksaan liveness/anti-spoof belum dipasang. Gunakan QR atau absensi manual." }, 503);
    }

    if (action === "status") {
      const [{ data: consent }, { data: templateRows, error: statusError }] = await Promise.all([
        admin.from("face_consents").select("consent_subject,consent_version,granted_at").eq("jamaah_id", jamaahId).maybeSingle(),
        admin.rpc("face_template_status", { p_jamaah_id: jamaahId }),
      ]);
      if (statusError) throw statusError;
      const template = templateRows?.[0] ?? null;
      return json({ consent: consent ?? null, enrolled: Boolean(template?.enrolled), template: template?.enrolled ? { model_version: template.model_version, enrolled_at: template.enrolled_at, updated_at: template.updated_at } : null });
    }
    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("face-biometric request failed:", message);
    return json({ error: message || "Terjadi kesalahan server." }, 500);
  }
});