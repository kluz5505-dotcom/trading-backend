import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load env before importing any modules that depend on it
dotenv.config();

// Dynamically import routes after env is loaded so they can read process.env
const priceTickModule = await import("./routes/priceTick.js");
const priceTick = priceTickModule.default;

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "LOADED" : "MISSING");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/public/price-tick", priceTick);

app.get("/", (req, res) => {
  res.json({ status: "backend running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
