import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bgmi";
const PORT = process.env.PORT || 4000;

await mongoose.connect(MONGODB_URI, { autoIndex: true });

const voteSchema = new mongoose.Schema(
  {
    voterName: { type: String, required: true, trim: true, unique: true, index: true },
    votedFor: { type: String, enum: ["player1", "player2"], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const betSchema = new mongoose.Schema(
  {
    betterName: { type: String, required: true, trim: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    betOn: { type: String, enum: ["player1", "player2"], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const Vote = mongoose.model("Vote", voteSchema);
const Bet = mongoose.model("Bet", betSchema);

async function getVoteTotals() {
  const rows = await Vote.aggregate([{ $group: { _id: "$votedFor", count: { $sum: 1 } } }]);
  const m = Object.fromEntries(rows.map(r => [r._id, r.count]));
  return { player1Votes: m.player1 || 0, player2Votes: m.player2 || 0 };
}

async function getBetTotals() {
  const rows = await Bet.aggregate([{ $group: { _id: "$betOn", sum: { $sum: "$amount" } } }]);
  const m = Object.fromEntries(rows.map(r => [r._id, r.sum]));
  return { player1Bets: m.player1 || 0, player2Bets: m.player2 || 0 };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/votes/totals", async (_req, res) => res.json(await getVoteTotals()));
app.get("/api/bets/totals", async (_req, res) => res.json(await getBetTotals()));

app.get("/api/votes/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = await Vote.find({}, { _id: 0, voterName: 1, votedFor: 1, timestamp: 1 })
    .sort({ timestamp: -1 }).limit(limit).lean();
  res.json(rows);
});

app.get("/api/bets/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = await Bet.find({}, { _id: 0, betterName: 1, amount: 1, betOn: 1, timestamp: 1 })
    .sort({ timestamp: -1 }).limit(limit).lean();
  res.json(rows);
});

app.get("/api/users/:name", async (req, res) => {
  const name = String(req.params.name).trim();
  const vote = await Vote.findOne({ voterName: name }).lean();
  const bet = await Bet.findOne({ betterName: name }).lean();
  res.json({
    hasVoted: vote ? vote.votedFor : null,
    hasBet: bet ? bet.betOn : null,
    userVotes: vote ? [{ voterName: vote.voterName, votedFor: vote.votedFor, timestamp: vote.timestamp }] : [],
    userBets: bet ? [{ betterName: bet.betterName, amount: bet.amount, betOn: bet.betOn, timestamp: bet.timestamp }] : [],
  });
});

app.post("/api/votes", async (req, res) => {
  const { voterName, votedFor } = req.body || {};
  if (!voterName || !["player1", "player2"].includes(votedFor)) return res.status(400).json({ error: "Invalid payload" });
  try {
    await Vote.create({ voterName: String(voterName).trim(), votedFor });
    const totals = await getVoteTotals();
    res.status(201).json({ ok: true, totals });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Already voted" });
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/bets", async (req, res) => {
  const { betterName, betOn, amount } = req.body || {};
  if (!betterName || !["player1", "player2"].includes(betOn) || !(Number(amount) > 0)) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  try {
    await Bet.create({ betterName: String(betterName).trim(), betOn, amount: Number(amount) });
    const totals = await getBetTotals();
    res.status(201).json({ ok: true, totals });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Already placed bet" });
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
