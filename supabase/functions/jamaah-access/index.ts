import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-jamaah-token","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,"Content-Type":"application/json"}});
async function sha(v:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method tidak diizinkan"},405);
 try{
  const body=await req.json();
  if(body.action==="set_pin"){
   const auth=req.headers.get("Authorization")||"";
   const userClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
   const {data:{user},error:ae}=await userClient.auth.getUser();
   if(ae||!user)return json({error:"Silakan masuk sebagai admin"},401);
   const {data:p}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();
   if(!p||!["super_admin","ketua","sekretaris","koordinator"].includes(p.role))return json({error:"Tidak memiliki izin mengatur PIN"},403);
   const pin=String(body.pin||"");if(!/^\d{6}$/.test(pin))return json({error:"PIN harus 6 digit"},400);
   const {error}=await admin.from("jamaah_pin_config").upsert({id:true,pin_hash:await sha(pin),updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"id"});
   if(error)throw error;
   await admin.from("jamaah_pin_sessions").delete().neq("token_hash","");
   return json({ok:true});
  }
  if(body.action==="login"){
   const pin=String(body.pin||"");if(!/^\d{6}$/.test(pin))return json({error:"PIN harus 6 digit"},400);
   const {data:c}=await admin.from("jamaah_pin_config").select("pin_hash").eq("id",true).maybeSingle();
   if(!c||(await sha(pin))!==c.pin_hash)return json({error:"PIN tidak sesuai"},401);
   const raw=crypto.randomUUID()+crypto.randomUUID(),token=btoa(raw).replaceAll("=","").replaceAll("+","-").replaceAll("/","_");
   const {error}=await admin.from("jamaah_pin_sessions").insert({token_hash:await sha(token),expires_at:new Date(Date.now()+12*60*60*1000).toISOString()});
   if(error)throw error;return json({token,expires_in:43200});
  }
  if(body.action==="read"){
   const token=req.headers.get("x-jamaah-token")||"";
   const {data:s}=await admin.from("jamaah_pin_sessions").select("expires_at").eq("token_hash",await sha(token)).maybeSingle();
   if(!s||new Date(s.expires_at).getTime()<Date.now())return json({error:"Sesi jamaah berakhir"},401);
   const [j,a,at,n,t,w,d]=await Promise.all([
    admin.from("jamaah").select("id,member_no,name,sector,status").eq("status","aktif").order("sector").order("member_no"),
    admin.from("agenda").select("id,title,event_date,event_time,location,speaker,description,status").order("event_date"),
    admin.from("attendance").select("id,status,agenda_id,jamaah_id,created_at").order("created_at",{ascending:false}),
    admin.from("announcements").select("id,title,body,image_url,video_url,created_at").order("created_at",{ascending:false}),
    admin.from("app_settings").select("value").eq("id","dashboard_theme").maybeSingle(),
    admin.from("app_settings").select("value").eq("id","dashboard_welcome_slides").maybeSingle(),
    admin.from("app_settings").select("value").eq("id","devotional_library").maybeSingle()
   ]);
   for(const r of [j,a,at,n,t,w,d])if(r.error)throw r.error;
   return json({jamaah:j.data||[],agenda:a.data||[],attendance:at.data||[],announcements:n.data||[],devotionalItems:(()=>{try{const raw=typeof d.data?.value==="string"?JSON.parse(d.data.value):d.data?.value;if(!Array.isArray(raw))return [];return raw.map((x:any)=>{const cat=String(x.category||"").toLowerCase();const title=String(x.title||"");let category;if(["pagi","adzkar-shobah","dzikir-pagi","wirdul-latif"].includes(cat)||/dzikir pagi|adzkar shobah|wirdul latif|wirid latif/i.test(title))category="dzikir-harian";else if(["doa","doa-harian"].includes(cat))category="doa-harian";else if(["dzikir","dzikir-harian"].includes(cat)||!cat)category="dzikir-harian";else category=cat;return {...x,category}})}catch{return []}})(),theme:t.data?.value||"ocean",welcomeSlides:(()=>{try{const v=typeof w.data?.value==="string"?JSON.parse(w.data.value):w.data?.value;return Array.isArray(v)?v:[]}catch{return []}})()});
  }
  return json({error:"Permintaan tidak dikenal"},400);
 }catch(e){return json({error:e?.message||"Kesalahan server"},500)}
});