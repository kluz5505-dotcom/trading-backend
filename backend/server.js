import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

console.log("SERVER LOADED");

import priceTick from "./routes/priceTick.js";

console.log("PRICE TICK ROUTE REGISTERED");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "backend running" });
});

app.use("/api/public/price-tick", priceTick);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
