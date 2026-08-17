
const socket = io();
let joined = false;
let current = null;
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);
const bids = [...document.querySelectorAll(".bid")];

$("joinBtn").onclick = () => {
  const team = $("team").value.trim();
  if (!team) return;
  localStorage.setItem("fantabuzzerTeam", team);
  socket.emit("join", { team });
  joined = true;
  $("joinCard").classList.add("hidden");
  $("auctionCard").classList.remove("hidden");
};

$("team").value = localStorage.getItem("fantabuzzerTeam") || "";

bids.forEach(btn => {
  btn.onclick = () => {
    if (navigator.vibrate) navigator.vibrate(35);
    socket.emit("bid", { amount: Number(btn.dataset.inc) });
  };
});

$("startBtn").onclick = () => {
  socket.emit("admin:start", {
    player: $("adminPlayer").value,
    startPrice: Number($("startPrice").value),
    duration: Number($("duration").value)
  });
};
$("pauseBtn").onclick = () => socket.emit("admin:pause");
$("resumeBtn").onclick = () => socket.emit("admin:resume");
$("resetBtn").onclick = () => socket.emit("admin:reset");

function renderTimer(){
  if (!current || !current.running || !current.endsAt) {
    $("timer").textContent = "--";
    return;
  }
  const sec = Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000));
  $("timer").textContent = sec;
}

socket.on("state", (s) => {
  current = s;
  $("player").textContent = s.player || "Nessun giocatore";
  $("price").textContent = s.price;
  $("leader").textContent = s.leader ? `In testa: ${s.leader}` : "Nessuna offerta";
  $("status").textContent = s.running ? "Rilanci aperti" : (s.player ? "Asta ferma / conclusa" : "Asta ferma");
  bids.forEach(b => b.disabled = !joined || !s.running);

  $("teams").innerHTML = s.teams.length
    ? s.teams.map(t => `<span>${escapeHtml(t.team)}</span>`).join("")
    : `<span class="muted">Nessuno connesso</span>`;

  $("history").innerHTML = s.history.length
    ? s.history.map(h => `<div class="item"><b>${escapeHtml(h.team)}</b> +${h.amount} → <b>${h.price}</b></div>`).join("")
    : `<span class="muted">Ancora nessun rilancio</span>`;

  renderTimer();
});

socket.on("sold", ({player, price, leader}) => {
  if (navigator.vibrate) navigator.vibrate([120,60,120]);
  const msg = leader
    ? `AGGIUDICATO! ${player} a ${leader} per ${price}`
    : `Asta chiusa: ${player}, nessuna offerta`;
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 5000);
});

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[m]);
}

setInterval(renderTimer, 150);

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
