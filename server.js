
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const state = {
  player: "",
  price: 0,
  leader: "",
  running: false,
  endsAt: null,
  duration: 7,
  history: []
};

const teams = new Map();

function publicState() {
  return {
    ...state,
    teams: Array.from(teams.values())
  };
}

function broadcast() {
  io.emit("state", publicState());
}

let timer = null;
function armTimer() {
  if (timer) clearTimeout(timer);
  if (!state.running || !state.endsAt) return;
  const ms = Math.max(0, state.endsAt - Date.now());
  timer = setTimeout(() => {
    if (state.running && state.endsAt && Date.now() >= state.endsAt) {
      state.running = false;
      io.emit("sold", {
        player: state.player,
        price: state.price,
        leader: state.leader
      });
      broadcast();
    }
  }, ms + 50);
}

io.on("connection", (socket) => {
  socket.emit("state", publicState());

  socket.on("join", ({ team }) => {
    const clean = String(team || "").trim().slice(0, 24);
    if (!clean) return;
    teams.set(socket.id, { id: socket.id, team: clean });
    socket.data.team = clean;
    broadcast();
  });

  socket.on("bid", ({ amount }) => {
    if (!state.running || !state.player) return;
    const team = socket.data.team;
    if (!team) return;
    const inc = Number(amount);
    if (![1,2,5].includes(inc)) return;

    state.price += inc;
    state.leader = team;
    state.endsAt = Date.now() + state.duration * 1000;
    state.history.unshift({
      t: Date.now(),
      team,
      amount: inc,
      price: state.price
    });
    state.history = state.history.slice(0, 50);
    armTimer();
    broadcast();
  });

  socket.on("admin:start", ({ player, startPrice, duration }) => {
    const p = String(player || "").trim().slice(0, 60);
    if (!p) return;
    state.player = p;
    state.price = Math.max(0, Number(startPrice) || 0);
    state.leader = "";
    state.duration = Math.min(30, Math.max(3, Number(duration) || 7));
    state.running = true;
    state.endsAt = Date.now() + state.duration * 1000;
    state.history = [];
    armTimer();
    broadcast();
  });

  socket.on("admin:pause", () => {
    state.running = false;
    state.endsAt = null;
    if (timer) clearTimeout(timer);
    broadcast();
  });

  socket.on("admin:resume", () => {
    if (!state.player) return;
    state.running = true;
    state.endsAt = Date.now() + state.duration * 1000;
    armTimer();
    broadcast();
  });

  socket.on("admin:reset", () => {
    state.player = "";
    state.price = 0;
    state.leader = "";
    state.running = false;
    state.endsAt = null;
    state.history = [];
    if (timer) clearTimeout(timer);
    broadcast();
  });

  socket.on("disconnect", () => {
    teams.delete(socket.id);
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Fantabuzzer attivo su http://localhost:${PORT}`);
});
