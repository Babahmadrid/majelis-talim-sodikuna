import { withSupabase } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(
  withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method tidak didukung.' }, { status: 405, headers: corsHeaders })
    }

    try {
      const { data: profile, error: profileError } = await ctx.supabase
        .from('profiles')
        .select('role')
        .eq('id', ctx.userClaims.sub)
        .maybeSingle()

      if (profileError || profile?.role !== 'admin') {
        return Response.json({ error: 'Akses ditolak.' }, { status: 403, headers: corsHeaders })
      }

      const body = await req.json()
      const jamaahId = typeof body?.jamaah_id === 'string' ? body.jamaah_id : ''
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jamaahId)) {
        return Response.json({ error: 'Permintaan tidak valid.' }, { status: 400, headers: corsHeaders })
      }

      // Delete both rows; never log the member ID or retain a withdrawal record.
      const { error: templateError } = await ctx.supabaseAdmin
        .schema('private')
        .from('face_templates')
        .delete()
        .eq('jamaah_id', jamaahId)
      if (templateError) throw templateError

      const { error: consentError } = await ctx.supabaseAdmin
        .from('face_consents')
        .delete()
        .eq('jamaah_id', jamaahId)
      if (consentError) throw consentError

      return Response.json({ success: true, message: 'Data biometrik berhasil dihapus dari database aktif.' }, {
        status: 200,
        headers: corsHeaders,
      })
    } catch {
      // Deliberately omit identifiers and database details from the response.
      return Response.json({ error: 'Penghapusan data biometrik gagal.' }, { status: 500, headers: corsHeaders })
    }
  }),
)
