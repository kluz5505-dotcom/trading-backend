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

// Binance symbols
const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT"
];

// MAIN PRICE TICK ROUTE - FETCH BINANCE DATA
router.get("/", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const results = [];

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

        // Only update Supabase if client is available
        if (supabase) {
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
            results.push({ symbol, price, error: updateError.message });
            continue;
          }
        }

        results.push({ symbol, price, updated: true });
      } catch (symbolErr) {
        console.error("priceTick error for", symbol, symbolErr);
        results.push({ symbol, error: symbolErr?.message ?? "unknown error" });
      }
    }

    const updatedCount = results.filter((entry) => entry.updated).length;
    const success = updatedCount > 0;

    return res.json({
      success,
      updated: updatedCount,
      data: results
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "price tick failed", details: err?.message });
  }
});

// EXTENDED PRICE TICK WITH BINANCE DATA (kept for backward compatibility)
router.get("/binance", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const results = [];

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

        // Only update Supabase if client is available
        if (supabase) {
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
            results.push({ symbol, price, error: updateError.message });
            continue;
          }
        }

        results.push({ symbol, price, updated: true });
      } catch (symbolErr) {
        console.error("priceTick error for", symbol, symbolErr);
        results.push({ symbol, error: symbolErr?.message ?? "unknown error" });
      }
    }

    const updatedCount = results.filter((entry) => entry.updated).length;
    const success = updatedCount > 0;

    return res.json({
      success,
      updated: updatedCount,
      data: results
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "price tick failed", details: err?.message });
  }
});

export default router;

