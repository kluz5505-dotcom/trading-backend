import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import priceTick from "./routes/priceTick.js";

// Load env before using any env-dependent runtime logic
dotenv.config();

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "LOADED" : "MISSING");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/public/price-tick", priceTick);

app.get("/", (req, res) => {
  res.json({ status: "backend running" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
