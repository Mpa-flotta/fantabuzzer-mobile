
const socket=io();
const $=id=>document.getElementById(id);
let state=null, selected=null;

$("importBtn").onclick=async()=>{
  const f=$("file").files[0];
  if(!f)return toast("Scegli un file Excel");
  const fd=new FormData();fd.append("file",f);
  const r=await fetch("/api/import-players",{method:"POST",body:fd});
  const d=await r.json();
  if(!r.ok)return toast(d.error||"Errore");
  $("importInfo").textContent=`Importati ${d.count} giocatori`;
  toast(`Importati ${d.count} giocatori`);
};

$("search").oninput=renderResults;
$("poolFilter").oninput=renderPlayers;

$("startBtn").onclick=()=>{
  if(!selected)return toast("Seleziona un giocatore");
  socket.emit("admin:start",{
    playerId:selected,
    startPrice:Number($("startPrice").value),
    duration:Number($("duration").value)
  });
};
$("pauseBtn").onclick=()=>socket.emit("admin:pause");
$("resumeBtn").onclick=()=>socket.emit("admin:resume");
$("resetBtn").onclick=()=>socket.emit("admin:resetAuction");
$("undoBtn").onclick=()=>socket.emit("admin:undoLast");
$("createTeamBtn").onclick=()=>{
  socket.emit("admin:createTeam",{
    name:$("newTeam").value,
    budget:Number($("newBudget").value)
  });
  $("newTeam").value="";
};

socket.on("auction:sold",({playerName,team,price})=>toast(`${playerName} assegnato automaticamente a ${team} per ${price}`));
socket.on("auction:closed",({playerName})=>toast(`${playerName}: nessuna offerta, resta disponibile`));

socket.on("state",s=>{
  state=s;
  const a=s.auction;
  $("aPlayer").textContent=a.playerName||"Nessun giocatore";
  $("aPrice").textContent=a.price;
  $("aLeader").textContent=a.leader?`In testa: ${a.leader}`:"Nessuna offerta";
  renderResults();renderTeams();renderPlayers();renderPurchases();renderTimer();
});

function renderResults(){
  if(!state)return;
  const q=$("search").value.trim().toLowerCase();
  const list=state.players.filter(p=>p.status==="available"&&(!q||p.name.toLowerCase().includes(q)||p.club.toLowerCase().includes(q)||p.role.toLowerCase().includes(q))).slice(0,25);
  $("results").innerHTML=list.map(p=>`<button class="result ${selected===p.id?"sel":""}" data-id="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.role)} · ${esc(p.club)} · Q ${p.quote}</span></button>`).join("")||`<p class="muted">Nessun giocatore disponibile.</p>`;
  document.querySelectorAll(".result").forEach(b=>b.onclick=()=>{
    selected=b.dataset.id;
    const p=state.players.find(x=>x.id===selected);
    $("search").value=p?.name||"";
    renderResults();
  });
}

function renderTeams(){
  const teams=Object.values(state.teams);
  $("teams").innerHTML=teams.length?teams.map(t=>`
    <details class="teamBox">
      <summary><b>${esc(t.name)}</b> · ${t.budget-t.spent} cr · ${t.roster.length} giocatori</summary>
      ${t.roster.length?t.roster.map(p=>`<div class="rowItem"><div><b>${esc(p.name)}</b><small>${esc(p.role)} ${esc(p.club)}</small></div><strong>${p.price}</strong></div>`).join(""):`<p class="muted">Rosa vuota</p>`}
    </details>`).join(""):`<p class="muted">Nessuna squadra.</p>`;
}

function renderPlayers(){
  const q=$("poolFilter").value.trim().toLowerCase();
  const list=state.players.filter(p=>!q||p.name.toLowerCase().includes(q)||p.club.toLowerCase().includes(q)||p.role.toLowerCase().includes(q)||(p.boughtBy||"").toLowerCase().includes(q));
  const av=state.players.filter(p=>p.status==="available").length;
  $("counts").textContent=`${av} disponibili / ${state.players.length} totali`;
  $("players").innerHTML=list.slice(0,300).map(p=>`
    <div class="rowItem ${p.status}">
      <div><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc(p.club)} · Q ${p.quote}</small></div>
      <strong>${p.status==="bought"?`${esc(p.boughtBy)} · ${p.boughtPrice}`:"Disponibile"}</strong>
    </div>`).join("");
}

function renderPurchases(){
  $("purchases").innerHTML=state.purchases.length?state.purchases.map(x=>`<div class="rowItem"><div><b>${esc(x.player)}</b><small>${esc(x.team)}</small></div><strong>${x.price}</strong></div>`).join(""):`<p class="muted">Nessun acquisto.</p>`;
}

function renderTimer(){
  const a=state?.auction;
  if(!a?.running||!a.endsAt){$("aTimer").textContent="--";return;}
  $("aTimer").textContent=Math.max(0,Math.ceil((a.endsAt-Date.now())/1000));
}
setInterval(renderTimer,150);

function toast(m){$("toast").textContent=m;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),4000);}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
