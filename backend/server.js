console.log("🔥 SERVER STARTED FILE:", __filename);

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import priceTick from "./routes/priceTick.js";

console.log("🔥 ROUTES LOADING - priceTick should register now");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/public/price-tick", priceTick);

app.get("/", (req, res) => {
  res.json({ status: "backend running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
