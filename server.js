
const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ROLE_LIMITS = { P: 3, D: 8, C: 8, A: 6 };
const DEFAULT_BUDGET = 500;

const state = {
  auction: {
    playerId: null,
    playerName: "",
    playerRole: "",
    price: 0,
    leader: "",
    running: false,
    endsAt: null,
    duration: 7,
    history: []
  },
  players: [],
  teams: {},
  purchases: []
};

function norm(v) {
  return String(v ?? "").trim();
}

function key(v) {
  return norm(v).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function rowValue(row, candidates) {
  const map = {};
  Object.keys(row).forEach(k => map[key(k)] = row[k]);
  for (const c of candidates) {
    const v = map[key(c)];
    if (v !== undefined) return v;
  }
  return "";
}

function normalizeRole(v) {
  const x = key(v).toUpperCase();
  if (["P", "POR", "PORTIERE", "PORTIERI"].includes(x)) return "P";
  if (["D", "DIF", "DIFENSORE", "DIFENSORI"].includes(x)) return "D";
  if (["C", "CEN", "CENTROCAMPISTA", "CENTROCAMPISTI"].includes(x)) return "C";
  if (["A", "ATT", "ATTACCANTE", "ATTACCANTI"].includes(x)) return "A";
  return norm(v).toUpperCase();
}

function roleCount(team, role) {
  return team.roster.filter(p => p.role === role).length;
}

function canTakeRole(team, role) {
  const limit = ROLE_LIMITS[role];
  if (!limit) return true;
  return roleCount(team, role) < limit;
}

function remainingBudget(team) {
  return team.budget - team.spent;
}

function broadcast() {
  io.emit("state", state);
}

let timer = null;

function clearAuction() {
  const duration = state.auction.duration || 7;
  state.auction = {
    playerId: null,
    playerName: "",
    playerRole: "",
    price: 0,
    leader: "",
    running: false,
    endsAt: null,
    duration,
    history: []
  };
  if (timer) clearTimeout(timer);
}

function autoAssign() {
  const a = state.auction;
  if (!a.playerId) return;

  const player = state.players.find(p => p.id === a.playerId);
  if (!player || player.status !== "available") {
    clearAuction();
    broadcast();
    return;
  }

  if (!a.leader) {
    io.emit("auction:closed", {
      type: "no-bid",
      playerName: player.name
    });
    clearAuction();
    broadcast();
    return;
  }

  const team = state.teams[a.leader];
  if (!team) {
    clearAuction();
    broadcast();
    return;
  }

  if (!canTakeRole(team, player.role)) {
    io.emit("auction:error", {
      message: `${team.name} ha già raggiunto il limite per il ruolo ${player.role}`
    });
    clearAuction();
    broadcast();
    return;
  }

  if (remainingBudget(team) < a.price) {
    io.emit("auction:error", {
      message: `${team.name} non ha abbastanza crediti per completare l'acquisto`
    });
    clearAuction();
    broadcast();
    return;
  }

  player.status = "bought";
  player.boughtBy = team.name;
  player.boughtPrice = a.price;

  team.spent += a.price;
  team.roster.push({
    playerId: player.id,
    name: player.name,
    role: player.role,
    club: player.club,
    price: a.price
  });

  state.purchases.unshift({
    playerId: player.id,
    player: player.name,
    role: player.role,
    team: team.name,
    price: a.price,
    t: Date.now()
  });

  io.emit("auction:sold", {
    playerName: player.name,
    team: team.name,
    price: a.price
  });

  clearAuction();
  broadcast();
}

function armTimer() {
  if (timer) clearTimeout(timer);
  const a = state.auction;
  if (!a.running || !a.endsAt) return;

  const ms = Math.max(0, a.endsAt - Date.now());
  timer = setTimeout(() => {
    if (state.auction.running &&
        state.auction.endsAt &&
        Date.now() >= state.auction.endsAt) {
      state.auction.running = false;
      autoAssign();
    }
  }, ms + 70);
}

app.post("/api/import-players", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File mancante" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    state.players = rows.map((row, i) => {
      const name = norm(rowValue(row, ["nome", "giocatore", "calciatore", "player"]));
      if (!name) return null;
      return {
        id: `${Date.now()}-${i}`,
        name,
        club: norm(rowValue(row, ["squadra", "club", "team"])),
        role: normalizeRole(rowValue(row, ["ruolo", "role"])),
        quote: Number(rowValue(row, ["quotazione", "quota", "valore", "price"])) || 0,
        status: "available",
        boughtBy: "",
        boughtPrice: 0
      };
    }).filter(Boolean);

    state.purchases = [];
    Object.values(state.teams).forEach(t => {
      t.spent = 0;
      t.roster = [];
    });
    clearAuction();
    broadcast();

    res.json({ ok: true, count: state.players.length });
  } catch (e) {
    res.status(500).json({ error: "Errore durante la lettura del file Excel" });
  }
});

io.on("connection", socket => {
  socket.emit("state", state);

  socket.on("team:join", ({ team }) => {
    const name = norm(team).slice(0, 30);
    if (!name) return;

    if (!state.teams[name]) {
      state.teams[name] = {
        name,
        budget: DEFAULT_BUDGET,
        spent: 0,
        roster: []
      };
    }

    socket.data.team = name;
    broadcast();
  });

  socket.on("team:bid", ({ amount }) => {
    const a = state.auction;
    const teamName = socket.data.team;
    if (!a.running || !a.playerId || !teamName) return;

    const inc = Number(amount);
    if (![1, 5, 10, 50, 100].includes(inc)) return;

    const team = state.teams[teamName];
    const player = state.players.find(p => p.id === a.playerId);
    if (!team || !player) return;

    if (!canTakeRole(team, player.role)) {
      socket.emit("bid:error", {
        message: `Hai già raggiunto il limite per il ruolo ${player.role}`
      });
      return;
    }

    const newPrice = a.price + inc;
    if (newPrice > remainingBudget(team)) {
      socket.emit("bid:error", {
        message: "Budget insufficiente per questo rilancio"
      });
      return;
    }

    a.price = newPrice;
    a.leader = teamName;
    a.endsAt = Date.now() + a.duration * 1000;
    a.history.unshift({
      t: Date.now(),
      team: teamName,
      amount: inc,
      price: newPrice
    });
    a.history = a.history.slice(0, 100);

    armTimer();
    broadcast();
  });

  socket.on("admin:createTeam", ({ name, budget }) => {
    const teamName = norm(name).slice(0, 30);
    if (!teamName) return;

    if (!state.teams[teamName]) {
      state.teams[teamName] = {
        name: teamName,
        budget: Math.max(1, Number(budget) || DEFAULT_BUDGET),
        spent: 0,
        roster: []
      };
    }
    broadcast();
  });

  socket.on("admin:setBudget", ({ team, budget }) => {
    const t = state.teams[team];
    if (!t) return;

    const value = Number(budget);
    if (!Number.isFinite(value)) return;

    if (value < t.spent) {
      socket.emit("admin:error", {
        message: `Il budget non può essere inferiore ai ${t.spent} crediti già spesi`
      });
      return;
    }

    t.budget = value;
    broadcast();
  });

  socket.on("admin:adjustBudget", ({ team, delta }) => {
    const t = state.teams[team];
    if (!t) return;

    const next = t.budget + Number(delta || 0);
    if (next < t.spent) {
      socket.emit("admin:error", {
        message: "Non puoi scendere sotto i crediti già spesi"
      });
      return;
    }

    t.budget = next;
    broadcast();
  });

  socket.on("admin:start", ({ playerId, startPrice, duration }) => {
    const player = state.players.find(p => p.id === playerId && p.status === "available");
    if (!player) return;

    const d = Math.min(30, Math.max(3, Number(duration) || 7));

    state.auction = {
      playerId: player.id,
      playerName: player.name,
      playerRole: player.role,
      price: Math.max(0, Number(startPrice) || 0),
      leader: "",
      running: true,
      endsAt: Date.now() + d * 1000,
      duration: d,
      history: []
    };

    armTimer();
    broadcast();
  });

  socket.on("admin:pause", () => {
    state.auction.running = false;
    state.auction.endsAt = null;
    if (timer) clearTimeout(timer);
    broadcast();
  });

  socket.on("admin:resume", () => {
    if (!state.auction.playerId) return;
    state.auction.running = true;
    state.auction.endsAt = Date.now() + state.auction.duration * 1000;
    armTimer();
    broadcast();
  });

  socket.on("admin:resetAuction", () => {
    clearAuction();
    broadcast();
  });

  socket.on("admin:undoLast", () => {
    const last = state.purchases.shift();
    if (!last) return;

    const player = state.players.find(p => p.id === last.playerId);
    const team = state.teams[last.team];

    if (player) {
      player.status = "available";
      player.boughtBy = "";
      player.boughtPrice = 0;
    }

    if (team) {
      team.spent = Math.max(0, team.spent - last.price);
      team.roster = team.roster.filter(p => p.playerId !== last.playerId);
    }

    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Fantabuzzer V3 attivo sulla porta ${PORT}`);
});
