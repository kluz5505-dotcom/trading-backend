import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure this file always loads the .env located next to this server file,
// even when the process is started from the repository root.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

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
