const CFG = window.APP_CONFIG || { storagePrefix:"sercuctech_tryme_" };

const LS = {
  people: CFG.storagePrefix + "people_v1",
  garments: CFG.storagePrefix + "garments_v1",
  assign: CFG.storagePrefix + "assign_v1"
};

function lsLoad(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key) || "") }catch(e){ return fallback }
}
function lsSave(key, data){ localStorage.setItem(key, JSON.stringify(data)); }

function isOnlineMode(){
  return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
}

// Lazy load supabase js only if needed
async function supabaseClient(){
  if(!isOnlineMode()) return null;
  if(window.__sb) return window.__sb;

  await new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  window.__sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  return window.__sb;
}

/* =========================
   DATA MODEL (semplificato)
   - people: {id,name,pinHash,views{FRONT,RIGHT,BACK,LEFT}}
   - garments:{id,name,type,views{FRONT,RIGHT,BACK,LEFT}}
   - assign: { personId: [garmentId,...] }
========================= */

async function dbGetAll(){
  if(!isOnlineMode()){
    return {
      people: lsLoad(LS.people, []),
      garments: lsLoad(LS.garments, []),
      assign: lsLoad(LS.assign, {})
    };
  }
  const sb = await supabaseClient();
  const [p,g,a] = await Promise.all([
    sb.from("people").select("*"),
    sb.from("garments").select("*"),
    sb.from("assignments").select("*")
  ]);
  const assign = {};
  (a.data||[]).forEach(r=>{
    if(!assign[r.person_id]) assign[r.person_id]=[];
    assign[r.person_id].push(r.garment_id);
  });
  return { people: p.data||[], garments: g.data||[], assign };
}

async function dbSavePerson(person){
  if(!isOnlineMode()){
    const people = lsLoad(LS.people, []);
    const idx = people.findIndex(p=>p.id===person.id);
    if(idx>=0) people[idx]=person; else people.push(person);
    lsSave(LS.people, people);
    return;
  }
  const sb = await supabaseClient();
  await sb.from("people").upsert(person, { onConflict:"id" });
}

async function dbSaveGarment(garment){
  if(!isOnlineMode()){
    const garments = lsLoad(LS.garments, []);
    const idx = garments.findIndex(g=>g.id===garment.id);
    if(idx>=0) garments[idx]=garment; else garments.push(garment);
    lsSave(LS.garments, garments);
    return;
  }
  const sb = await supabaseClient();
  await sb.from("garments").upsert(garment, { onConflict:"id" });
}

async function dbAssign(personId, garmentIds){
  if(!isOnlineMode()){
    const assign = lsLoad(LS.assign, {});
    assign[personId] = garmentIds;
    lsSave(LS.assign, assign);
    return;
  }
  const sb = await supabaseClient();
  // replace assignments
  await sb.from("assignments").delete().eq("person_id", personId);
  if(garmentIds.length){
    await sb.from("assignments").insert(garmentIds.map(gid=>({ person_id:personId, garment_id:gid })));
  }
}

// Simple hash (PIN) — per UI gate. Con Supabase puoi fare anche auth vera.
async function sha256(str){
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

window.DB = { dbGetAll, dbSavePerson, dbSaveGarment, dbAssign, isOnlineMode, sha256 };
