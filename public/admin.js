
const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let selected = null;
let serverClockOffset = 0;
let officialTimer = { running: false, remainingSeconds: 0, remainingMs: 0, duration: 10 };

$("importBtn").onclick = async () => {
  const file = $("file").files[0];
  if (!file) return toast("Scegli prima un file Excel");

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/import-players", {
    method: "POST",
    body: fd
  });

  const data = await res.json();
  if (!res.ok) return toast(data.error || "Errore importazione");

  $("importInfo").textContent = `Importati ${data.count} giocatori`;
  toast(`Importati ${data.count} giocatori`);
};

$("search").oninput = renderResults;
$("poolFilter").oninput = renderPlayers;

$("startBtn").onclick = () => {
  if (!selected) return toast("Seleziona prima un giocatore");

  socket.emit("admin:start", {
    playerId: selected,
    startPrice: Number($("startPrice").value),
    duration: Number($("duration").value)
  });
};

$("pauseBtn").onclick = () => socket.emit("admin:pause");
$("resumeBtn").onclick = () => socket.emit("admin:resume");
$("resetBtn").onclick = () => socket.emit("admin:resetAuction");

$("newAuctionBtn").onclick = () => {
  const ok = confirm("Vuoi iniziare una nuova asta? Verranno azzerate tutte le rose, gli acquisti e i crediti spesi. Le squadre resteranno create e torneranno a 1000 crediti.");
  if (!ok) return;
  socket.emit("admin:newAuction");
};

socket.on("auction:new", ({ message }) => {
  toast(message || "Nuova asta avviata");
});

$("undoBtn").onclick = () => socket.emit("admin:undoLast");

$("createTeamBtn").onclick = () => {
  socket.emit("admin:createTeam", {
    name: $("newTeam").value.trim(),
    budget: Number($("newBudget").value)
  });
  $("newTeam").value = "";
};

socket.on("admin:error", ({ message }) => toast(message));

socket.on("auction:sold", ({ playerName, team, price }) => {
  toast(`${playerName} assegnato automaticamente a ${team} per ${price}`);
});

socket.on("auction:closed", ({ playerName }) => {
  toast(`${playerName}: nessuna offerta, resta disponibile`);
});

socket.on("auction:error", ({ message }) => toast(message));

socket.on("timer:tick", tick => {
  officialTimer = tick;
  renderTimer();
});

socket.on("state", s => {
  state = s;
  if (Number.isFinite(s.serverNow)) serverClockOffset = s.serverNow - Date.now();
  const a = s.auction;

  $("aPlayer").textContent = a.playerName || "Nessun giocatore";
  $("aRole").textContent = a.playerRole || "-";
  $("aPrice").textContent = a.price;
  $("aLeader").textContent = a.leader ? `In testa: ${a.leader}` : "Nessuna offerta";

  const stageText = document.getElementById("stageStatusText");
  if (stageText) {
    if (a.running) stageText.textContent = "ASTA IN CORSO";
    else if (a.playerId) stageText.textContent = "ASTA TERMINATA";
    else stageText.textContent = "ASTA PRONTA";
  }

  renderResults();
  renderTeams();
  renderTeamGrid();
  renderPlayers();
  renderPurchases();
  renderTimer();
});

function renderResults() {
  if (!state) return;
  const q = $("search").value.trim().toLowerCase();

  const list = state.players.filter(p =>
    p.status === "available" &&
    (!q ||
      p.name.toLowerCase().includes(q) ||
      p.club.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q))
  ).slice(0, 25);

  $("results").innerHTML = list.length
    ? list.map(p => `
      <button class="result ${selected === p.id ? "sel" : ""}" data-id="${p.id}">
        <b>${esc(p.name)}</b>
        <span>${esc(p.role)} · ${esc(p.club)}</span>
      </button>`).join("")
    : `<p class="muted">Nessun giocatore disponibile.</p>`;

  document.querySelectorAll(".result").forEach(btn => {
    btn.onclick = () => {
      selected = btn.dataset.id;
      const p = state.players.find(x => x.id === selected);
      $("search").value = p?.name || "";
      renderResults();
    };
  });
}

function renderTeams() {
  if (!state) return;

  const teams = Object.values(state.teams);

  $("teams").innerHTML = teams.length
    ? teams.map(t => {
        const counts = { P: 0, D: 0, C: 0, A: 0 };
        t.roster.forEach(p => {
          if (counts[p.role] !== undefined) counts[p.role]++;
        });

        const remaining = t.budget - t.spent;
        const remainingSlots = Math.max(0, 25 - t.roster.length);
        const maxBid = Math.max(0, remaining - Math.max(0, remainingSlots - 1));
        const isLeader = state.auction.leader === t.name;

        const rosterHtml = t.roster.length
          ? t.roster.map(p => `
              <div class="tvRosterRow">
                <span class="tvRosterRole">${esc(p.role)}</span>
                <span class="tvRosterName">${esc(p.name)}</span>
                <strong class="tvRosterPrice">${p.price}</strong>
              </div>
            `).join("")
          : `<div class="tvRosterEmpty">Nessun acquisto</div>`;

        return `
          <article class="tvTeamCard ${isLeader ? "currentLeader" : ""}">
            <div class="tvTeamHeader">
              <div class="tvTeamName">${esc(t.name)}</div>
              ${isLeader ? `<div class="leadingBadge">IN TESTA</div>` : ``}
            </div>

            <div class="tvTeamStats">
              <div><span>Budget</span><strong>${remaining}</strong></div>
              <div><span>Max</span><strong>${maxBid}</strong></div>
              <div><span>Rosa</span><strong>${t.roster.length}/25</strong></div>
            </div>

            <div class="tvRoles">
              <div><span>P</span><b>${counts.P}/3</b></div>
              <div><span>D</span><b>${counts.D}/8</b></div>
              <div><span>C</span><b>${counts.C}/8</b></div>
              <div><span>A</span><b>${counts.A}/6</b></div>
            </div>

            <div class="tvRoster">
              ${rosterHtml}
            </div>
          </article>
        `;
      }).join("")
    : `<div class="emptyTeams">Nessuna squadra collegata</div>`;
}

function renderTeamGrid() {
  if (!state) return;
  const teams = Object.values(state.teams);
  const leader = state.auction.leader;
  $("teamGrid").innerHTML = teams.length ? teams.map(t => {
    const counts = {P:0,D:0,C:0,A:0};
    t.roster.forEach(p => { if (counts[p.role] !== undefined) counts[p.role]++; });
    const remaining = t.budget - t.spent;
    const slotsLeft = Math.max(0, 25 - t.roster.length);
    const maxBid = slotsLeft ? Math.max(0, remaining - Math.max(0, slotsLeft - 1)) : 0;
    const last = t.roster.length ? t.roster[t.roster.length - 1] : null;
    return `<div class="teamTile ${leader === t.name ? "leading" : ""}">
      <div><div class="teamName">${esc(t.name)}</div><div class="lastPlayer">${last ? `Ultimo: <b>${esc(last.name)}</b> · ${last.price}` : "Nessun calciatore acquistato"}</div></div>
      <div><div class="teamStats"><span>P<b>${counts.P}/3</b></span><span>D<b>${counts.D}/8</b></span><span>C<b>${counts.C}/8</b></span><span>A<b>${counts.A}/6</b></span></div>
      <div class="teamBudget"><span>Budget<br><b>${remaining}</b></span><span>Max rilancio<br><b>${maxBid}</b></span><span>Rosa<br><b>${t.roster.length}/25</b></span></div></div>
    </div>`;
  }).join("") : `<p class="muted">Le squadre compariranno qui quando entreranno.</p>`;
}

function renderPlayers() {
  if (!state) return;
  const q = $("poolFilter").value.trim().toLowerCase();

  const list = state.players.filter(p =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.club.toLowerCase().includes(q) ||
    p.role.toLowerCase().includes(q) ||
    (p.boughtBy || "").toLowerCase().includes(q)
  );

  const available = state.players.filter(p => p.status === "available").length;
  $("counts").textContent = `${available} disponibili / ${state.players.length} totali`;

  $("players").innerHTML = list.slice(0, 300).map(p => `
    <div class="rowItem ${p.status}">
      <div>
        <b>${esc(p.name)}</b>
        <small>${esc(p.role)} · ${esc(p.club)}</small>
      </div>
      <strong>
        ${p.status === "bought"
          ? `${esc(p.boughtBy)} · ${p.boughtPrice}`
          : "Disponibile"
        }
      </strong>
    </div>`).join("");
}

function renderPurchases() {
  $("purchases").innerHTML = state.purchases.length
    ? state.purchases.map(x => `
      <div class="rowItem">
        <div>
          <b>${esc(x.player)}</b>
          <small>${esc(x.team)} · ${esc(x.role)}</small>
        </div>
        <strong>${x.price}</strong>
      </div>`).join("")
    : `<p class="muted">Nessun acquisto.</p>`;
}

function renderTimer() {
  const timerEl = $("aTimer");
  const ringEl = $("timerRing");
  if (!timerEl) return;

  if (!officialTimer.running) {
    timerEl.textContent = "--";
    if (ringEl) ringEl.style.setProperty("--progress", "0");
    return;
  }

  timerEl.textContent = officialTimer.remainingSeconds;

  const totalMs = Math.max(1, Number(officialTimer.duration || 10) * 1000);
  const fraction = Math.max(0, Math.min(1, officialTimer.remainingMs / totalMs));
  if (ringEl) ringEl.style.setProperty("--progress", String(fraction * 100));
}

setInterval(renderTimer, 100);

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 4000);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function cssEscape(s) {
  return CSS.escape(s);
}
