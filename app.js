(() => {
  const cfg = window.BT_CONFIG || {};
  const client = window.supabase?.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let players = [], matches = [], appearances = [], votes = [], adminPassword = sessionStorage.getItem("bt_admin_pw") || "";
  let token = localStorage.getItem("bt_player_token") || "";
  let currentIdentity = null;
  const toast = (msg) => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); };
  const initials = (s) => (s||"?").trim().slice(0,1).toUpperCase();
  const photo = (p, cls="avatar") => p.avatar_path ? `<img class="${cls}" src="${client.storage.from("player-photos").getPublicUrl(p.avatar_path).data.publicUrl}" alt="${esc(p.name)}">` : `<div class="avatar-placeholder">${initials(p.name)}</div>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateFmt = d => new Date(d+"T12:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase();
  async function load() {
    if (!client) { toast("Configura Supabase en config.js"); return; }
    const [p,m,a,v] = await Promise.all([
      client.from("players").select("*").eq("active",true).order("name"),
      client.from("matches").select("*").order("played_on",{ascending:false}),
      client.from("appearances").select("*"),
      client.from("votes").select("*")
    ]);
    const error = [p,m,a,v].find(x=>x.error)?.error;
    if(error){ console.error(error); toast("No se pudieron cargar los datos"); return; }
    players=p.data||[]; matches=m.data||[]; appearances=a.data||[]; votes=v.data||[];
    renderAll();
  }
  function renderAll(){ renderRanking(); renderMatches(); renderPlayers(); renderIdentity(); renderVote(); $("#player-count").textContent=`${players.length} FICHAS`; $("#match-count").textContent=`${matches.length} REGISTROS`; $("#ranking-count").textContent=`${players.length} JUGADORES`; }
  function stats(p){
    const apps=appearances.filter(a=>a.player_id===p.id), ids=apps.map(a=>a.match_id);
    const ownVotes=votes.filter(v=>v.target_id===p.id), rating=ownVotes.length?ownVotes.reduce((s,v)=>s+v.score,0)/ownVotes.length:0;
    const mvps=matches.filter(m=>{const mv=votes.filter(v=>v.match_id===m.id);if(!mv.length)return false;const avg={};mv.forEach(v=>{avg[v.target_id]??=[0,0];avg[v.target_id][0]+=v.score;avg[v.target_id][1]++;});const top=Object.entries(avg).sort((a,b)=>b[1][0]/b[1][1]-a[1][0]/a[1][1])[0];return top&&top[0]===p.id&&ids.includes(m.id);}).length;
    return {goals:apps.reduce((s,a)=>s+a.goals,0),games:apps.length,rating,mvps,wins:0};
  }
  function renderRanking(){
    const sort=$("#sort-by").value; const list=players.map(p=>({...p,...stats(p)})).sort((a,b)=>b[sort]-a[sort]||a.name.localeCompare(b.name));
    $("#ranking-list").innerHTML=list.length?list.map((p,i)=>`<div class="ranking-row"><span class="rank-num ${i<3?"top":""}">${String(i+1).padStart(2,"0")}</span>${photo(p)}<div><div class="player-name">${esc(p.name)}</div><div class="player-meta">${p.games} PARTIDOS · ${p.mvps} MVP</div></div><div class="stat rating"><strong>${p.rating?p.rating.toFixed(1):"—"}</strong><small>NOTA</small></div><div class="stat"><strong>${p.goals}</strong><small>GOLES</small></div><div class="stat"><strong>${p.mvps}</strong><small>MVP</small></div></div>`).join(""):`<div class="loading-line">TODAVÍA NO HAY JUGADORES<span>.</span></div>`;
  }
  function renderMatches(){
    $("#matches-list").innerHTML=matches.length?matches.map((m,i)=>{const n=appearances.filter(a=>a.match_id===m.id).length;return `<article class="match-row"><div class="match-date">${dateFmt(m.played_on)}</div><div><div class="match-title">JORNADA ${String(matches.length-i).padStart(2,"0")}</div><div class="match-meta">${n} JUGADORES · ${votes.filter(v=>v.match_id===m.id).length} VOTOS</div></div><div class="match-status">${m.status==="open"?"● ABIERTO":"CERRADO"}</div></article>`;}).join(""):`<div class="loading-line">NO HAY PARTIDOS REGISTRADOS<span>.</span></div>`;
  }
  function renderPlayers(){
    $("#players-grid").innerHTML=players.length?players.map(p=>`<article class="player-card">${p.avatar_path?photo(p,""): `<div class="no-photo">${initials(p.name)}</div>`}<div class="player-card-info"><h3>${esc(p.name)}</h3><small>${stats(p).goals} GOLES</small></div></article>`).join(""):`<div class="loading-line">EL VESTUARIO ESTÁ VACÍO<span>.</span></div>`;
  }
  async function renderIdentity(){
    if(!token){currentIdentity=null;$("#identity-box").innerHTML=`<p>Antes de votar, selecciona quién eres. Solo podrás reclamar un jugador libre desde este dispositivo.</p><select id="claim-player" class="vote-select"><option value="">ELIGE TU JUGADOR</option>${players.filter(p=>!p.claimed).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button id="claim-btn" class="primary-btn">ESTE SOY YO ↗</button>`;$("#claim-btn")?.addEventListener("click",claimPlayer);return;}
    const {data,error}=await client.rpc("me",{p_token:token});
    if(error||!data){localStorage.removeItem("bt_player_token");token="";return renderIdentity();}
    currentIdentity=players.find(p=>p.id===data)||null;
    $("#identity-box").innerHTML=currentIdentity?`<p>VOTANDO COMO <strong>${esc(currentIdentity.name.toUpperCase())}</strong> · <button id="release-identity" class="identity-action">NO SOY YO</button></p>`:`<p>Identidad no encontrada.</p>`;
    renderVote();
    $("#release-identity")?.addEventListener("click",()=>{if(confirm("¿Quieres borrar la identidad guardada en este dispositivo?")){localStorage.removeItem("bt_player_token");token="";renderIdentity();renderVote();}});
  }
  async function claimPlayer(){
    const id=$("#claim-player").value;if(!id)return toast("Selecciona un jugador");
    token=crypto.randomUUID()+crypto.randomUUID();const {error}=await client.rpc("claim_player",{p_token:token,p_player:id});
    if(error){token="";toast(error.message);return;}
    localStorage.setItem("bt_player_token",token);toast("Identidad vinculada");await load();
  }
  function renderVote(){
    const open=matches.filter(m=>m.status==="open"&&appearances.some(a=>a.match_id===m.id));
    if(!currentIdentity){$("#vote-content").innerHTML=`<p class="muted">Selecciona primero tu jugador para poder votar.</p>`;return;}
    $("#vote-content").innerHTML=`<div class="vote-form"><label class="eyebrow">PARTIDO</label><select id="vote-match" class="vote-select"><option value="">ELIGE PARTIDO ABIERTO</option>${open.map(m=>`<option value="${m.id}">${dateFmt(m.played_on)}</option>`).join("")}</select><label class="eyebrow">JUGADOR A VALORAR</label><select id="vote-target" class="vote-select"><option value="">ELIGE JUGADOR</option></select><label class="eyebrow">TU NOTA · 1 A 10</label><input id="vote-score" class="vote-score" type="number" min="1" max="10" value="7"><button id="send-vote" class="primary-btn">PUBLICAR NOTA ↗</button><div id="vote-history"></div></div>`;
    $("#vote-match").addEventListener("change",e=>{const ids=appearances.filter(a=>a.match_id===e.target.value).map(a=>a.player_id);$("#vote-target").innerHTML=`<option value="">ELIGE JUGADOR</option>`+players.filter(p=>ids.includes(p.id)&&p.id!==currentIdentity.id).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");});
    $("#send-vote").addEventListener("click",sendVote);
  }
  async function sendVote(){
    const match=$("#vote-match").value,target=$("#vote-target").value,score=Number($("#vote-score").value);
    if(!match||!target||!Number.isInteger(score)||score<1||score>10)return toast("Revisa partido, jugador y nota");
    const {error}=await client.rpc("cast_vote",{p_token:token,p_match:match,p_target:target,p_score:score});
    if(error){toast(error.message);return;}toast("Voto publicado");await load();
  }
  async function adminRpc(name,args){const {data,error}=await client.rpc(name,{p_pw:adminPassword,...args});if(error)throw error;return data;}
  $("#admin-open").addEventListener("click",()=>{$("#admin-dialog").showModal();$("#admin-login").classList.toggle("hidden",!!adminPassword);$("#admin-panel").classList.toggle("hidden",!adminPassword);if(adminPassword)renderAdmin();});
  $("#admin-login-btn").addEventListener("click",async()=>{adminPassword=$("#admin-password").value;try{await adminRpc("admin_check",{});sessionStorage.setItem("bt_admin_pw",adminPassword);$("#admin-login").classList.add("hidden");$("#admin-panel").classList.remove("hidden");renderAdmin();}catch(e){adminPassword="";$("#admin-error").textContent="Contraseña incorrecta."; }});
  $("#admin-logout").addEventListener("click",()=>{adminPassword="";sessionStorage.removeItem("bt_admin_pw");$("#admin-panel").classList.add("hidden");$("#admin-login").classList.remove("hidden");$("#admin-password").value="";});
  function renderAdmin(){
    $("#admin-player-list").innerHTML=players.map(p=>`<div class="admin-player-row">${photo(p)}<strong>${esc(p.name)}</strong><button data-photo="${p.id}">FOTO ↑</button><button data-rename="${p.id}">NOMBRE</button><button data-release="${p.id}">LIBERAR</button></div>`).join("");
    $("#admin-match-list").innerHTML=matches.map(m=>`<div class="admin-player-row"><strong>${dateFmt(m.played_on)}</strong><button data-status="${m.id}" data-next="${m.status==="open"?"closed":"open"}">${m.status==="open"?"CERRAR":"ABRIR"}</button></div>`).join("");
    $$("[data-photo]").forEach(b=>b.addEventListener("click",()=>uploadPhoto(b.dataset.photo)));
    $$("[data-rename]").forEach(b=>b.addEventListener("click",async()=>{const p=players.find(x=>x.id===b.dataset.rename),name=prompt("Nuevo nombre",p.name);if(!name)return;try{await adminRpc("admin_rename_player",{p_player:p.id,p_name:name});await load();renderAdmin();}catch(e){toast(e.message);}}));
    $$("[data-release]").forEach(b=>b.addEventListener("click",async()=>{try{await adminRpc("admin_release_player",{p_player:b.dataset.release});toast("Jugador liberado");await load();renderAdmin();}catch(e){toast(e.message);}}));
    $$("[data-status]").forEach(b=>b.addEventListener("click",async()=>{try{await adminRpc("admin_set_match_status",{p_match:b.dataset.status,p_status:b.dataset.next});await load();renderAdmin();}catch(e){toast(e.message);}}));
  }
  async function uploadPhoto(playerId){
    const input=document.createElement("input");input.type="file";input.accept="image/jpeg,image/png,image/webp";input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024)return toast("Máximo 5 MB");const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(file);});try{const res=await fetch(cfg.SUPABASE_URL+"/functions/v1/admin-player-photo",{method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({password:adminPassword,playerId,fileName:file.name,contentType:file.type,base64:b64})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Error al subir");toast("Fotografía actualizada");await load();renderAdmin();}catch(e){toast(e.message);}};input.click();
  }
  $("#add-player").addEventListener("click",async()=>{const name=$("#new-player-name").value.trim();if(!name)return;try{await adminRpc("admin_add_player",{p_name:name});$("#new-player-name").value="";await load();renderAdmin();toast("Jugador añadido");}catch(e){toast(e.message);}});
  $("#add-match").addEventListener("click",async()=>{const date=$("#new-match-date").value||null;try{await adminRpc("admin_create_match",{p_date:date});await load();renderAdmin();toast("Partido creado");}catch(e){toast(e.message);}});
  $$(".tab").forEach(b=>b.addEventListener("click",()=>{$$(".tab").forEach(x=>x.classList.toggle("active",x===b));$$(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+b.dataset.view));}));
  $$(".admin-tabs button").forEach(b=>b.addEventListener("click",()=>{$$(".admin-tabs button").forEach(x=>x.classList.toggle("active",x===b));$("#admin-players").classList.toggle("hidden",b.dataset.adminTab!=="players");$("#admin-matches").classList.toggle("hidden",b.dataset.adminTab!=="matches");}));
  $("#sort-by").addEventListener("change",renderRanking);
  if(!client){$("#ranking-list").innerHTML="<p>Falta la configuración de Supabase.</p>";return;}
  load();
})();