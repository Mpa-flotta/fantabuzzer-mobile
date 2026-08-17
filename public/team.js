
const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let myTeam = localStorage.getItem("fantabuzzerTeam") || "";

$("team").value = myTeam;

function join() {
  const name = $("team").value.trim();
  if (!name) return;
  myTeam = name;
  localStorage.setItem("fantabuzzerTeam", name);
  socket.emit("team:join", { team: name });
  $("joinCard").classList.add("hidden");
  $("teamCard").classList.remove("hidden");
}

$("joinBtn").onclick = join;

$("logoutBtn").onclick = () => {
  localStorage.removeItem("fantabuzzerTeam");
  myTeam = "";
  $("teamCard").classList.add("hidden");
  $("joinCard").classList.remove("hidden");
  $("team").value = "";
};

if (myTeam) {
  socket.emit("team:join", { team: myTeam });
  $("joinCard").classList.add("hidden");
  $("teamCard").classList.remove("hidden");
}

document.querySelectorAll(".bid").forEach(btn => {
  btn.onclick = () => {
    if (navigator.vibrate) navigator.vibrate(25);
    socket.emit("team:bid", { amount: Number(btn.dataset.inc) });
  };
});

socket.on("bid:error", ({ message }) => toast(message));
socket.on("team:error", ({ message }) => { toast(message); localStorage.removeItem("fantabuzzerTeam"); });

socket.on("auction:sold", ({ playerName, team, price }) => {
  if (navigator.vibrate) navigator.vibrate([120, 50, 120]);
  toast(`${playerName} assegnato a ${team} per ${price}`);
});

socket.on("auction:closed", ({ playerName }) => {
  toast(`${playerName}: nessuna offerta`);
});

socket.on("state", s => {
  state = s;
  const a = s.auction;

  $("player").textContent = a.playerName || "Nessun giocatore";
  $("playerRole").textContent = a.playerRole || "-";
  $("price").textContent = a.price;
  $("leader").textContent = a.leader ? `In testa: ${a.leader}` : "Nessuna offerta";

  document.querySelectorAll(".bid").forEach(b => b.disabled = !a.running);

  const t = s.teams[myTeam];
  if (t) {
    $("myTeam").textContent = t.name;
    $("myBudget").textContent = `${t.budget - t.spent} cr`;
    $("myCount").textContent = `${t.roster.length}/25`;

    const counts = { P: 0, D: 0, C: 0, A: 0 };
    t.roster.forEach(p => {
      if (counts[p.role] !== undefined) counts[p.role]++;
    });

    $("cntP").textContent = `${counts.P}/3`;
    $("cntD").textContent = `${counts.D}/8`;
    $("cntC").textContent = `${counts.C}/8`;
    $("cntA").textContent = `${counts.A}/6`;

    $("roster").innerHTML = t.roster.length
      ? t.roster.map(p => `
        <div class="rowItem">
          <div>
            <b>${esc(p.name)}</b>
            <small>${esc(p.role)} · ${esc(p.club)}</small>
          </div>
          <strong>${p.price}</strong>
        </div>`).join("")
      : `<p class="muted">Nessun giocatore acquistato.</p>`;
  }

  renderTimer();
});

function renderTimer() {
  const a = state?.auction;
  if (!a?.running || !a.endsAt) {
    $("timer").textContent = "--";
    return;
  }
  $("timer").textContent = Math.max(0, Math.ceil((a.endsAt - Date.now()) / 1000));
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
