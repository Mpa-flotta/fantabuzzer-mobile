
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
const DEFAULT_BUDGET = 1000;
const MAX_TEAMS = 10;
const MIN_CREDIT_PER_REMAINING_SLOT = 1;

const state = {
  auction: {
    playerId: null,
    playerName: "",
    playerRole: "",
    price: 0,
    leader: "",
    running: false,
    endsAt: null,
    duration: 10, history: []
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

function remainingSlotsAfterPurchase(team) {
  return Math.max(0, 25 - (team.roster.length + 1));
}

function minimumReserveAfterPurchase(team) {
  return remainingSlotsAfterPurchase(team) * MIN_CREDIT_PER_REMAINING_SLOT;
}

function canAffordPurchase(team, price) {
  const afterPurchase = remainingBudget(team) - price;
  return afterPurchase >= minimumReserveAfterPurchase(team);
}

function clientState() {
  return {
    ...state,
    serverNow: Date.now()
  };
}

function broadcast() {
  io.emit("state", clientState());
}

let timer = null;

function clearAuction() {
  const duration = state.auction.duration || 10;
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

  if (!canAffordPurchase(team, a.price)) {
    io.emit("auction:error", {
      message: `${team.name} non può completare l'acquisto: deve conservare almeno 1 credito per ogni posto ancora libero`
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
    sourceId: player.sourceId,
    name: player.name,
    role: player.role,
    club: player.club,
    price: a.price
  });

  state.purchases.unshift({
    playerId: player.id,
    sourceId: player.sourceId,
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
    const requiredSheets = ["Portieri", "Difensori", "Centrocampisti", "Attaccanti"];
    const missing = requiredSheets.filter(name => !wb.Sheets[name]);
    if (missing.length) {
      return res.status(400).json({
        error: `Nel file mancano i fogli: ${missing.join(", ")}`
      });
    }

    const imported = [];
    for (const sheetName of requiredSheets) {
      const ws = wb.Sheets[sheetName];
      // Riga 1 = titolo; riga 2 = intestazioni reali del file Fantacalcio.
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "", range: 1 });

      rows.forEach((row, i) => {
        const name = norm(rowValue(row, ["Nome", "Giocatore", "Calciatore", "Player"]));
        if (!name) return;

        const sourceId = norm(rowValue(row, ["Id", "ID"]));
        imported.push({
          id: sourceId ? `${sheetName}-${sourceId}` : `${sheetName}-${Date.now()}-${i}`,
          sourceId,
          name,
          club: norm(rowValue(row, ["Squadra", "Club", "Team"])),
          role: normalizeRole(rowValue(row, ["R", "Ruolo", "Role"])),
          status: "available",
          boughtBy: "",
          boughtPrice: 0
        });
      });
    }

    state.players = imported;
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


function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

app.get("/api/export-auction-csv", (req, res) => {
  const lines = [];
  const teams = Object.values(state.teams);

  teams.forEach(team => {
    if (!team.roster.length) return;

    // Il file di riferimento usa una riga $,$,$ come separatore tra le squadre.
    lines.push("$,$,$");

    team.roster.forEach(player => {
      const sourceId = norm(player.sourceId);
      if (!sourceId) return;
      lines.push([
        csvCell(team.name),
        csvCell(sourceId),
        csvCell(player.price)
      ].join(","));
    });
  });

  const csv = lines.join("\n") + (lines.length ? "\n" : "");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="fanta-asta-rosters.csv"');
  res.send(csv);
});

io.on("connection", socket => {
  socket.emit("state", clientState());

  socket.on("team:join", ({ team }) => {
    const name = norm(team).slice(0, 30);
    if (!name) return;

    if (!state.teams[name]) {
      if (Object.keys(state.teams).length >= MAX_TEAMS) {
        socket.emit("team:error", { message: "Sono già registrate 10 squadre" });
        return;
      }
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
    if (!canAffordPurchase(team, newPrice)) {
      socket.emit("bid:error", {
        message: "Rilancio non consentito: devi conservare almeno 1 credito per ogni posto ancora libero"
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
    io.emit("auction:bidPulse", {
      team: teamName,
      price: newPrice,
      amount: inc
    });

    armTimer();
    broadcast();
  });

  socket.on("admin:createTeam", ({ name, budget }) => {
    const teamName = norm(name).slice(0, 30);
    if (!teamName) return;

    if (!state.teams[teamName]) {
      if (Object.keys(state.teams).length >= MAX_TEAMS) {
        socket.emit("admin:error", { message: "Hai già raggiunto il limite di 10 squadre" });
        return;
      }
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

    const d = Math.min(30, Math.max(3, Number(duration) || 10));

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


  socket.on("admin:reopenLast", () => {
    const last = state.purchases.shift();
    if (!last) return;

    const player = state.players.find(p => p.id === last.playerId);
    const team = state.teams[last.team];

    if (!player || !team) return;

    team.spent = Math.max(0, team.spent - last.price);
    team.roster = team.roster.filter(p => p.playerId !== last.playerId);

    player.status = "available";
    player.boughtBy = "";
    player.boughtPrice = 0;

    const d = state.auction.duration || 10;
    state.auction = {
      playerId: player.id,
      playerName: player.name,
      playerRole: player.role,
      price: Math.max(1, last.price),
      leader: "",
      running: false,
      endsAt: null,
      duration: d,
      history: []
    };

    io.emit("auction:reopened", {
      playerName: player.name,
      previousTeam: last.team,
      previousPrice: last.price
    });

    broadcast();
  });


  socket.on("admin:newAuction", () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    state.players.forEach(player => {
      player.status = "available";
      player.boughtBy = "";
      player.boughtPrice = 0;
    });

    state.purchases = [];
    state.teams = {};

    state.auction = {
      playerId: null,
      playerName: "",
      playerRole: "",
      price: 0,
      leader: "",
      running: false,
      endsAt: null,
      duration: 10,
      history: []
    };

    io.emit("auction:new", {
      message: "Nuova asta avviata: squadre e rose cancellate"
    });

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


// Timer ufficiale calcolato esclusivamente dal server.
// Dashboard e telefoni ricevono esattamente lo stesso valore.
setInterval(() => {
  const a = state.auction;
  let remainingMs = 0;
  let remainingSeconds = 0;

  if (a.running && a.endsAt) {
    remainingMs = Math.max(0, a.endsAt - Date.now());
    remainingSeconds = Math.ceil(remainingMs / 1000);
  }

  io.emit("timer:tick", {
    running: Boolean(a.running && a.endsAt),
    remainingMs,
    remainingSeconds,
    duration: Number(a.duration) || 10
  });
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Fantabuzzer V3 attivo sulla porta ${PORT}`);
});
