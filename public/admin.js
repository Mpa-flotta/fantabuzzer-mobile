
const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let selected = null;

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

socket.on("state", s => {
  state = s;
  const a = s.auction;

  $("aPlayer").textContent = a.playerName || "Nessun giocatore";
  $("aRole").textContent = a.playerRole || "-";
  $("aPrice").textContent = a.price;
  $("aLeader").textContent = a.leader ? `In testa: ${a.leader}` : "Nessuna offerta";

  renderResults();
  renderTeams();
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
  const teams = Object.values(state.teams);

  $("teams").innerHTML = teams.length
    ? teams.map(t => {
        const counts = { P: 0, D: 0, C: 0, A: 0 };
        t.roster.forEach(p => {
          if (counts[p.role] !== undefined) counts[p.role]++;
        });

        return `
        <details class="teamBox">
          <summary>
            <b>${esc(t.name)}</b> · ${t.budget - t.spent} cr · ${t.roster.length}/25
          </summary>

          <div class="roleLine">
            P ${counts.P}/3 · D ${counts.D}/8 · C ${counts.C}/8 · A ${counts.A}/6
          </div>

          <div class="budgetBox">
            <input type="number" min="${t.spent}" value="${t.budget}" data-budget-input="${escAttr(t.name)}">
            <button data-save-budget="${escAttr(t.name)}">Salva budget</button>
          </div>

          ${t.roster.length
            ? t.roster.map(p => `
              <div class="rowItem">
                <div>
                  <b>${esc(p.name)}</b>
                  <small>${esc(p.role)} · ${esc(p.club)}</small>
                </div>
                <strong>${p.price}</strong>
              </div>`).join("")
            : `<p class="muted">Rosa vuota</p>`
          }
        </details>`;
      }).join("")
    : `<p class="muted">Nessuna squadra.</p>`;

  document.querySelectorAll("[data-save-budget]").forEach(btn => {
    btn.onclick = () => {
      const team = btn.dataset.saveBudget;
      const input = document.querySelector(`[data-budget-input="${cssEscape(team)}"]`);
      socket.emit("admin:setBudget", {
        team,
        budget: Number(input.value)
      });
    };
  });
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
  const a = state?.auction;
  if (!a?.running || !a.endsAt) {
    $("aTimer").textContent = "--";
    return;
  }

  $("aTimer").textContent = Math.max(0, Math.ceil((a.endsAt - Date.now()) / 1000));
}

setInterval(renderTimer, 150);

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
