import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.warn("⚠️ Supabase credentials not found");
    return null;
  }

  return createClient(url, serviceRoleKey);
};

// Binance symbols to update
const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT"
];

// MAIN PRICE TICK ROUTE
router.get("/", async (req, res) => {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return res.status(500).json({ ok: false, error: "Supabase client unavailable" });
    }

    // Fetch live prices from Binance and update markets table
    for (const symbol of symbols) {
      try {
        const { data } = await axios.get(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
        );

        const price = parseFloat(data.lastPrice);
        const change = parseFloat(data.priceChangePercent);
        const volume = parseFloat(data.volume);

        if (Number.isNaN(price) || Number.isNaN(change) || Number.isNaN(volume)) {
          throw new Error("Invalid Binance response for " + symbol);
        }

        const { error: updateError } = await supabase
          .from("markets")
          .update({
            price,
            change_24h: change,
            volume_24h: volume
          })
          .eq("symbol", symbol);

        if (updateError) {
          console.error("Supabase update failed for", symbol, updateError);
        }
      } catch (symbolErr) {
        console.error("priceTick error for", symbol, symbolErr);
      }
    }

    // Fetch all markets and return full dataset
    const { data: markets, error: fetchError } = await supabase
      .from("markets")
      .select("*");

    if (fetchError) {
      console.error("Failed to fetch markets", fetchError);
      return res.status(500).json({ ok: false, error: "Failed to fetch markets", details: fetchError.message });
    }

    return res.json({
      ok: true,
      count: markets.length,
      data: markets
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "price tick failed", details: err?.message });
  }
});

export default router;
