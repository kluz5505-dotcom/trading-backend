import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Binance symbols
const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT"
];

router.get("/", async (req, res) => {
  try {
    const results = [];

    for (const symbol of symbols) {
      const { data } = await axios.get(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
      );

      const price = parseFloat(data.lastPrice);
      const change = parseFloat(data.priceChangePercent);
      const volume = parseFloat(data.volume);

      // update Supabase market table
      await supabase
        .from("markets")
        .update({
          price,
          change_24h: change,
          volume_24h: volume
        })
        .eq("symbol", symbol);

      results.push({ symbol, price });
    }

    res.json({
      success: true,
      updated: results.length,
      data: results
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "price tick failed" });
  }
});

export default router;
