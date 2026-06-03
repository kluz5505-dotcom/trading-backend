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

// MAIN PRICE TICK ROUTE - FETCH ALL MARKETS FROM SUPABASE
router.get("/", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: "Supabase client not initialized" 
      });
    }

    // Fetch all markets from Supabase
    const { data: markets, error } = await supabase
      .from("markets")
      .select("*");

    if (error) {
      console.error("Supabase fetch error:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to fetch markets",
        details: error.message 
      });
    }

    // Update Binance prices for crypto symbols
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
          results.push({ symbol, error: updateError.message });
        } else {
          results.push({ symbol, price, updated: true });
        }
      } catch (symbolErr) {
        console.error("Binance fetch error for", symbol, symbolErr?.message);
        results.push({ symbol, error: symbolErr?.message ?? "unknown error" });
      }
    }

    // Fetch updated markets after price updates
    const { data: updatedMarkets, error: fetchError } = await supabase
      .from("markets")
      .select("*");

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to fetch updated markets",
        details: fetchError.message 
      });
    }

    return res.json({
      ok: true,
      count: updatedMarkets?.length || 0,
      data: updatedMarkets || []
    });
  } catch (err) {
    console.error("Price tick error:", err);
    return res.status(500).json({ 
      success: false, 
      error: "price tick failed", 
      details: err?.message 
    });
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

