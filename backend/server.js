import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import priceTick from "./routes/priceTick.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "backend running" });
});

// MUST BE EXACT MOUNT PATH
app.use("/api/public/price-tick", priceTick);

// DEBUG ROUTE
app.get("/test", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
