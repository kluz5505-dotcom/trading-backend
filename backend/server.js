import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import priceTick from "./routes/priceTick.js";

dotenv.config();

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
