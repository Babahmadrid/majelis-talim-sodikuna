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

      // One database function deletes both rows in a single transaction.
      const { error: deleteError } = await ctx.supabaseAdmin.rpc('delete_face_data_for_jamaah', {
        p_jamaah_id: jamaahId,
      })
      if (deleteError) throw deleteError

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
