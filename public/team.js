
const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let serverClockOffset = 0;
let officialTimer = { running: false, remainingSeconds: 0, remainingMs: 0, duration: 10 };
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

socket.on("auction:bidPulse", ({ team, price }) => {
  const priceEl = $("price");
  const leaderEl = $("leader");
  if (priceEl) {
    priceEl.classList.remove("pricePulse");
    void priceEl.offsetWidth;
    priceEl.classList.add("pricePulse");
  }
  if (leaderEl) {
    leaderEl.classList.remove("leaderPulse");
    void leaderEl.offsetWidth;
    leaderEl.classList.add("leaderPulse");
  }
});
socket.on("team:error", ({ message }) => { toast(message); localStorage.removeItem("fantabuzzerTeam"); });

socket.on("auction:sold", ({ playerName, team, price }) => {
  if (navigator.vibrate) navigator.vibrate([120, 50, 120]);
  showSoldOverlay(playerName, team, price, state?.auction?.playerRole || "");
});

socket.on("auction:closed", ({ playerName }) => {
  toast(`${playerName}: nessuna offerta`);
});

socket.on("timer:tick", tick => {
  officialTimer = tick;
  renderTimer();
});

socket.on("state", s => {
  state = s;
  if (Number.isFinite(s.serverNow)) serverClockOffset = s.serverNow - Date.now();
  const a = s.auction;

  $("player").textContent = a.playerName || "Nessun giocatore";
  renderPlayerAvatar(a.playerName, a.playerRole);
  $("playerRole").textContent = a.playerRole || "-";
  $("price").textContent = a.price;
  $("leader").textContent = a.leader ? `In testa: ${a.leader}` : "Nessuna offerta";

  document.querySelectorAll(".bid").forEach(b => b.disabled = !a.running);

  const t = s.teams[myTeam];
  if (t) {
    $("myTeam").textContent = t.name;
    $("myBudget").textContent = `${t.budget - t.spent} cr`;
    $("myCount").textContent = `${t.roster.length}/25`;

    const remaining = t.budget - t.spent;
    const remainingSlots = Math.max(0, 25 - t.roster.length);
    const maxBid = Math.max(0, remaining - Math.max(0, remainingSlots - 1));
    $("myMaxBid").textContent = `${maxBid} cr`;

    const spend = { P: 0, D: 0, C: 0, A: 0 };
    t.roster.forEach(p => {
      if (spend[p.role] !== undefined) spend[p.role] += Number(p.price || 0);
    });
    $("roleSpendSummary").innerHTML = `
      <div><span>P</span><b>${spend.P}</b></div>
      <div><span>D</span><b>${spend.D}</b></div>
      <div><span>C</span><b>${spend.C}</b></div>
      <div><span>A</span><b>${spend.A}</b></div>
      <div class="totalSpend"><span>Speso</span><b>${t.spent}</b></div>
    `;

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
          <div class="rosterPlayerMain">
            <span class="rosterRolePill role-${esc(p.role)}">${esc(p.role)}</span>
            <div>
              <b>${esc(p.name)}</b>
              <small>${esc(p.club)}</small>
            </div>
          </div>
          <strong>${p.price}</strong>
        </div>`).join("")
      : `<p class="muted">Nessun giocatore acquistato.</p>`;
  }

  renderTimer();
});

function renderTimer() {
  const a = state?.auction;
  const timerEl = $("timer");
  const auctionCard = document.querySelector(".mobileAuctionCard");

  if (!a?.running || !a.endsAt) {
    timerEl.textContent = "--";
    timerEl.classList.remove("timerDanger");
    auctionCard?.classList.remove("auctionClosing");
    return;
  }

  const seconds = Math.max(0, Math.ceil((a.endsAt - Date.now()) / 1000));
  timerEl.textContent = seconds;

  const totalMs = (Number(a.duration) || 10) * 1000;
  const remainingMs = Math.max(0, a.endsAt - Date.now());
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  timerEl.style.setProperty("--progress", pct);

  const danger = seconds <= 3;
  timerEl.classList.toggle("timerDanger", danger);
  auctionCard?.classList.toggle("auctionClosing", danger);
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


function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "--";
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applyRoleAvatar(el, role) {
  if (!el) return;
  el.classList.remove("roleAvatarP","roleAvatarD","roleAvatarC","roleAvatarA","roleAvatarX");
  const cls = ["P","D","C","A"].includes(role) ? `roleAvatar${role}` : "roleAvatarX";
  el.classList.add(cls);
}

function renderPlayerAvatar(name, role) {
  const avatar = $("playerAvatar");
  const initials = $("playerInitials");
  if (!avatar || !initials) return;
  initials.textContent = getInitials(name);
  applyRoleAvatar(avatar, role);
}

function showSoldOverlay(playerName, team, price, role) {
  const overlay = $("soldOverlay");
  if (!overlay) {
    toast(`${playerName} assegnato a ${team} per ${price}`);
    return;
  }
  $("soldPlayer").textContent = playerName;
  $("soldTeam").textContent = team;
  $("soldPrice").textContent = `${price} cr`;
  $("soldInitials").textContent = getInitials(playerName);
  applyRoleAvatar($("soldAvatar"), role);
  overlay.classList.remove("hidden");
  setTimeout(() => overlay.classList.add("hidden"), 2800);
}
