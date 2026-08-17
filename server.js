
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

const state = {
  auction: {
    playerId: null,
    playerName: "",
    price: 0,
    leader: "",
    running: false,
    endsAt: null,
    duration: 7,
    history: []
  },
  players: [],
  teams: {},
  purchases: [],
  defaultBudget: 500
};

function norm(v){ return String(v ?? "").trim(); }
function k(v){
  return norm(v).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]/g,"");
}
function rowVal(row, names){
  const m = {};
  Object.keys(row).forEach(x => m[k(x)] = row[x]);
  for (const n of names) if (m[k(n)] !== undefined) return m[k(n)];
  return "";
}
function broadcast(){ io.emit("state", state); }

let timer = null;

function clearAuction(keepDuration=true){
  const d = keepDuration ? (state.auction.duration || 7) : 7;
  state.auction = {
    playerId:null, playerName:"", price:0, leader:"",
    running:false, endsAt:null, duration:d, history:[]
  };
  if (timer) clearTimeout(timer);
}

function autoAssignAtEnd(){
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

  const finalPrice = a.price;
  const remaining = team.budget - team.spent;

  if (remaining < finalPrice) {
    io.emit("auction:error", {
      message: "Assegnazione annullata: budget insufficiente."
    });
    clearAuction();
    broadcast();
    return;
  }

  player.status = "bought";
  player.boughtBy = team.name;
  player.boughtPrice = finalPrice;

  team.spent += finalPrice;
  team.roster.push({
    playerId: player.id,
    name: player.name,
    role: player.role,
    club: player.club,
    price: finalPrice
  });

  state.purchases.unshift({
    playerId: player.id,
    player: player.name,
    team: team.name,
    price: finalPrice,
    t: Date.now()
  });

  io.emit("auction:sold", {
    playerName: player.name,
    team: team.name,
    price: finalPrice
  });

  clearAuction();
  broadcast();
}

function armTimer(){
  if (timer) clearTimeout(timer);
  const a = state.auction;
  if (!a.running || !a.endsAt) return;

  const ms = Math.max(0, a.endsAt - Date.now());
  timer = setTimeout(() => {
    if (state.auction.running &&
        state.auction.endsAt &&
        Date.now() >= state.auction.endsAt) {
      state.auction.running = false;
      autoAssignAtEnd();
    }
  }, ms + 60);
}

app.post("/api/import-players", upload.single("file"), (req,res) => {
  try{
    if (!req.file) return res.status(400).json({error:"File mancante"});
    const wb = XLSX.read(req.file.buffer,{type:"buffer"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{defval:""});

    state.players = rows.map((row,i) => {
      const name = norm(rowVal(row,["nome","giocatore","calciatore","player"]));
      if (!name) return null;
      return {
        id: `${Date.now()}-${i}`,
        name,
        club: norm(rowVal(row,["squadra","club","team"])),
        role: norm(rowVal(row,["ruolo","role"])).toUpperCase(),
        quote: Number(rowVal(row,["quotazione","quota","valore","price"])) || 0,
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
    clearAuction(false);
    broadcast();
    res.json({ok:true,count:state.players.length});
  }catch(e){
    res.status(500).json({error:"Errore lettura Excel",detail:e.message});
  }
});

io.on("connection", socket => {
  socket.emit("state", state);

  socket.on("team:join", ({team}) => {
    const name = norm(team).slice(0,30);
    if (!name) return;
    if (!state.teams[name]) {
      state.teams[name] = {
        name,
        budget: state.defaultBudget,
        spent: 0,
        roster: []
      };
    }
    socket.data.team = name;
    broadcast();
  });

  socket.on("team:bid", ({amount}) => {
    const a = state.auction;
    const teamName = socket.data.team;
    if (!a.running || !a.playerId || !teamName) return;

    const inc = Number(amount);
    if (![1,2,5].includes(inc)) return;

    const team = state.teams[teamName];
    if (!team) return;

    const newPrice = a.price + inc;
    const remaining = team.budget - team.spent;

    if (newPrice > remaining) {
      socket.emit("bid:error",{message:"Budget insufficiente"});
      return;
    }

    a.price = newPrice;
    a.leader = teamName;
    a.endsAt = Date.now() + a.duration * 1000;
    a.history.unshift({
      t:Date.now(), team:teamName, amount:inc, price:newPrice
    });
    a.history = a.history.slice(0,100);

    armTimer();
    broadcast();
  });

  socket.on("admin:createTeam", ({name,budget}) => {
    const n = norm(name).slice(0,30);
    if (!n) return;
    if (!state.teams[n]) {
      state.teams[n] = {
        name:n,
        budget:Math.max(1,Number(budget)||state.defaultBudget),
        spent:0,
        roster:[]
      };
    }
    broadcast();
  });

  socket.on("admin:start", ({playerId,startPrice,duration}) => {
    const p = state.players.find(x => x.id === playerId && x.status === "available");
    if (!p) return;

    const d = Math.min(30,Math.max(3,Number(duration)||7));
    state.auction = {
      playerId:p.id,
      playerName:p.name,
      price:Math.max(0,Number(startPrice)||0),
      leader:"",
      running:true,
      endsAt:Date.now()+d*1000,
      duration:d,
      history:[]
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
    state.auction.endsAt = Date.now()+state.auction.duration*1000;
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
    const p = state.players.find(x => x.id === last.playerId);
    const t = state.teams[last.team];

    if (p) {
      p.status = "available";
      p.boughtBy = "";
      p.boughtPrice = 0;
    }
    if (t) {
      t.spent = Math.max(0,t.spent-last.price);
      t.roster = t.roster.filter(x => x.playerId !== last.playerId);
    }
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,"0.0.0.0",()=>{
  console.log(`Fantabuzzer V2 Auto attivo sulla porta ${PORT}`);
});
