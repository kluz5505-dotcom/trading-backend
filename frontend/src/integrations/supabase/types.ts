export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          decimals: number
          deposit_enabled: boolean
          enabled: boolean
          min_withdrawal: number
          name: string
          networks: Database["public"]["Enums"]["network_type"][]
          symbol: string
          withdrawal_enabled: boolean
          withdrawal_fee: number
        }
        Insert: {
          created_at?: string
          decimals?: number
          deposit_enabled?: boolean
          enabled?: boolean
          min_withdrawal?: number
          name: string
          networks?: Database["public"]["Enums"]["network_type"][]
          symbol: string
          withdrawal_enabled?: boolean
          withdrawal_fee?: number
        }
        Update: {
          created_at?: string
          decimals?: number
          deposit_enabled?: boolean
          enabled?: boolean
          min_withdrawal?: number
          name?: string
          networks?: Database["public"]["Enums"]["network_type"][]
          symbol?: string
          withdrawal_enabled?: boolean
          withdrawal_fee?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      balances: {
        Row: {
          asset: string
          available: number
          id: string
          locked: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: string
          available?: number
          id?: string
          locked?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          available?: number
          id?: string
          locked?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balances_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      deposits: {
        Row: {
          address: string
          admin_note: string | null
          amount: number
          asset: string
          created_at: string
          id: string
          network: Database["public"]["Enums"]["network_type"]
          proof_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          txid: string | null
          user_id: string
        }
        Insert: {
          address: string
          admin_note?: string | null
          amount: number
          asset: string
          created_at?: string
          id?: string
          network: Database["public"]["Enums"]["network_type"]
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          txid?: string | null
          user_id: string
        }
        Update: {
          address?: string
          admin_note?: string | null
          amount?: number
          asset?: string
          created_at?: string
          id?: string
          network?: Database["public"]["Enums"]["network_type"]
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          txid?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          admin_note: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          document_type: string | null
          document_url: string | null
          full_name: string
          id: string
          level: Database["public"]["Enums"]["kyc_level"]
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_type?: string | null
          document_url?: string | null
          full_name: string
          id?: string
          level?: Database["public"]["Enums"]["kyc_level"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          user_id: string
        }
        Update: {
          admin_note?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_type?: string | null
          document_url?: string | null
          full_name?: string
          id?: string
          level?: Database["public"]["Enums"]["kyc_level"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          user_id?: string
        }
        Relationships: []
      }
      login_history: {
        Row: {
          created_at: string
          email: string | null
          event: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          market_id: string | null
          symbol: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          market_id?: string | null
          symbol: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          market_id?: string | null
          symbol?: string
        }
        Relationships: []
      }
      market_price_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          override_price: number
          reason: string | null
          symbol: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          override_price: number
          reason?: string | null
          symbol: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          override_price?: number
          reason?: string | null
          symbol?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          backup_price_source: string | null
          base_asset: string
          buy_enabled: boolean
          category: string
          created_at: string
          display_name: string | null
          external_source: string | null
          flash_crash_protection: boolean
          funding_fee_bps: number
          hidden_from_frontend: boolean
          id: string
          leverage_enabled: boolean
          limit_order_enabled: boolean
          liquidation_threshold_bps: number
          liquidity_factor: number
          maintenance_margin_bps: number
          maintenance_message: string | null
          maintenance_mode: boolean
          maker_fee_bps: number
          market_order_enabled: boolean
          market_type: string
          max_leverage: number
          max_open_positions: number | null
          max_order_size: number | null
          max_position_size: number | null
          min_leverage: number
          min_order_size: number
          price_deviation_max_bps: number
          price_frozen: boolean
          price_source: string
          price_source_symbol: string | null
          quote_asset: string
          sell_enabled: boolean
          session_schedule: Json
          slippage_max_bps: number
          spread_bps: number
          status: Database["public"]["Enums"]["market_status"]
          stop_order_enabled: boolean
          symbol: string
          taker_fee_bps: number
          tp_sl_enabled: boolean
          trailing_stop_enabled: boolean
          updated_at: string
          updated_by: string | null
          weekend_trading: boolean
          last_price: number | null
        }
        Insert: {
          backup_price_source?: string | null
          base_asset: string
          buy_enabled?: boolean
          category?: string
          created_at?: string
          display_name?: string | null
          external_source?: string | null
          flash_crash_protection?: boolean
          funding_fee_bps?: number
          hidden_from_frontend?: boolean
          id?: string
          leverage_enabled?: boolean
          limit_order_enabled?: boolean
          liquidation_threshold_bps?: number
          liquidity_factor?: number
          maintenance_margin_bps?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maker_fee_bps?: number
          market_order_enabled?: boolean
          market_type?: string
          max_leverage?: number
          max_open_positions?: number | null
          max_order_size?: number | null
          max_position_size?: number | null
          min_leverage?: number
          min_order_size?: number
          price_deviation_max_bps?: number
          price_frozen?: boolean
          price_source?: string
          price_source_symbol?: string | null
          quote_asset: string
          sell_enabled?: boolean
          session_schedule?: Json
          slippage_max_bps?: number
          spread_bps?: number
          status?: Database["public"]["Enums"]["market_status"]
          stop_order_enabled?: boolean
          symbol: string
          taker_fee_bps?: number
          tp_sl_enabled?: boolean
          trailing_stop_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weekend_trading?: boolean
          last_price?: number | null
        }
        Update: {
          backup_price_source?: string | null
          base_asset?: string
          buy_enabled?: boolean
          category?: string
          created_at?: string
          display_name?: string | null
          external_source?: string | null
          flash_crash_protection?: boolean
          funding_fee_bps?: number
          hidden_from_frontend?: boolean
          id?: string
          leverage_enabled?: boolean
          limit_order_enabled?: boolean
          liquidation_threshold_bps?: number
          liquidity_factor?: number
          maintenance_margin_bps?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maker_fee_bps?: number
          market_order_enabled?: boolean
          market_type?: string
          max_leverage?: number
          max_open_positions?: number | null
          max_order_size?: number | null
          max_position_size?: number | null
          min_leverage?: number
          min_order_size?: number
          price_deviation_max_bps?: number
          price_frozen?: boolean
          price_source?: string
          price_source_symbol?: string | null
          quote_asset?: string
          sell_enabled?: boolean
          session_schedule?: Json
          slippage_max_bps?: number
          spread_bps?: number
          status?: Database["public"]["Enums"]["market_status"]
          stop_order_enabled?: boolean
          symbol?: string
          taker_fee_bps?: number
          tp_sl_enabled?: boolean
          trailing_stop_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weekend_trading?: boolean
          last_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_base_asset_fkey"
            columns: ["base_asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "markets_quote_asset_fkey"
            columns: ["quote_asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      platform_settings: {
        Row: {
          deposits_enabled: boolean
          emergency_shutdown: boolean
          id: number
          maintenance_message: string | null
          registration_enabled: boolean
          trading_enabled: boolean
          updated_at: string
          updated_by: string | null
          withdrawals_enabled: boolean
        }
        Insert: {
          deposits_enabled?: boolean
          emergency_shutdown?: boolean
          id?: number
          maintenance_message?: string | null
          registration_enabled?: boolean
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          withdrawals_enabled?: boolean
        }
        Update: {
          deposits_enabled?: boolean
          emergency_shutdown?: boolean
          id?: number
          maintenance_message?: string | null
          registration_enabled?: boolean
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          kyc_level: Database["public"]["Enums"]["kyc_level"]
          phone: string | null
          status: Database["public"]["Enums"]["account_status"]
          trading_frozen: boolean
          updated_at: string
          withdrawals_frozen: boolean
        }
        Insert: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          kyc_level?: Database["public"]["Enums"]["kyc_level"]
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          trading_frozen?: boolean
          updated_at?: string
          withdrawals_frozen?: boolean
        }
        Update: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          kyc_level?: Database["public"]["Enums"]["kyc_level"]
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          trading_frozen?: boolean
          updated_at?: string
          withdrawals_frozen?: boolean
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          asset: string
          balance_after: number
          created_at: string
          id: string
          note: string | null
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["txn_type"]
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          balance_after: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["txn_type"]
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_addresses: {
        Row: {
          address: string
          asset: string
          assigned_by: string | null
          created_at: string
          id: string
          memo: string | null
          network: Database["public"]["Enums"]["network_type"]
          user_id: string
        }
        Insert: {
          address: string
          asset: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          network: Database["public"]["Enums"]["network_type"]
          user_id: string
        }
        Update: {
          address?: string
          asset?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          network?: Database["public"]["Enums"]["network_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_addresses_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      pnl_history: {
        Row: {
          id: string
          position_id: string
          user_id: string
          market_id?: string | null
          symbol: string
          realized_pnl: number | null
          unrealized_pnl: number | null
          total_pnl: number | null
          snapshot_price: number
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          position_id: string
          user_id: string
          market_id?: string | null
          symbol: string
          realized_pnl?: number | null
          unrealized_pnl?: number | null
          total_pnl?: number | null
          snapshot_price?: number
          reason?: string
          created_at?: string
        }
        Update: {
          id?: string
          position_id?: string
          user_id?: string
          market_id?: string | null
          symbol?: string
          realized_pnl?: number | null
          unrealized_pnl?: number | null
          total_pnl?: number | null
          snapshot_price?: number
          reason?: string
          created_at?: string
        }
        Relationships: []
      }
      liquidation_events: {
        Row: {
          id: string
          position_id: string
          user_id: string
          symbol: string
          side: string
          mark_price: number
          liquidation_price: number
          margin_ratio: number
          quantity: number
          pnl: number
          liquidation_fee: number
          status: string
          triggered_at: string
          executed_at: string | null
          details: Json
        }
        Insert: {
          id?: string
          position_id: string
          user_id: string
          symbol: string
          side: string
          mark_price: number
          liquidation_price: number
          margin_ratio: number
          quantity: number
          pnl: number
          liquidation_fee?: number
          status?: string
          triggered_at?: string
          executed_at?: string | null
          details?: Json
        }
        Update: {
          id?: string
          position_id?: string
          user_id?: string
          symbol?: string
          side?: string
          mark_price?: number
          liquidation_price?: number
          margin_ratio?: number
          quantity?: number
          pnl?: number
          liquidation_fee?: number
          status?: string
          triggered_at?: string
          executed_at?: string | null
          details?: Json
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          id: string
          user_id: string | null
          symbol: string | null
          event_type: string
          severity: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          symbol?: string | null
          event_type?: string
          severity?: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          symbol?: string | null
          event_type?: string
          severity?: string
          details?: Json
          created_at?: string
        }
        Relationships: []
      }
      insurance_fund: {
        Row: {
          id: string
          symbol: string | null
          amount: number
          source: string
          created_at: string
          details: Json
        }
        Insert: {
          id?: string
          symbol?: string | null
          amount?: number
          source: string
          created_at?: string
          details?: Json
        }
        Update: {
          id?: string
          symbol?: string | null
          amount?: number
          source?: string
          created_at?: string
          details?: Json
        }
        Relationships: []
      }
      margin_transfers: {
        Row: {
          id: string
          user_id: string
          symbol: string | null
          asset: string
          amount: number
          direction: string
          transfer_type: string
          status: string
          created_at: string
          completed_at: string | null
          details: Json
        }
        Insert: {
          id?: string
          user_id: string
          symbol?: string | null
          asset: string
          amount: number
          direction: string
          transfer_type: string
          status?: string
          created_at?: string
          completed_at?: string | null
          details?: Json
        }
        Update: {
          id?: string
          user_id?: string
          symbol?: string | null
          asset?: string
          amount?: number
          direction?: string
          transfer_type?: string
          status?: string
          created_at?: string
          completed_at?: string | null
          details?: Json
        }
        Relationships: []
      }
      security_events: {
        Row: {
          id: string
          user_id: string | null
          session_id: string | null
          event_type: string
          severity: string
          risk_score: number
          ip_address: string | null
          user_agent: string | null
          details: Json
          created_at: string
          resolved_at?: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          event_type?: string
          severity?: string
          risk_score?: number
          ip_address?: string | null
          user_agent?: string | null
          details?: Json
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          event_type?: string
          severity?: string
          risk_score?: number
          ip_address?: string | null
          user_agent?: string | null
          details?: Json
          created_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      monitoring_events: {
        Row: {
          id: string
          service: string
          subsystem?: string | null
          event_type: string
          severity: string
          status: string
          latency_ms: number
          metrics: Json
          details: string | null
          created_at: string
          message?: string | null
          metric_name?: string | null
          metric_value?: number | null
          metadata?: Json | null
        }
        Insert: {
          id?: string
          service?: string
          subsystem?: string | null
          event_type?: string
          severity?: string
          status?: string
          latency_ms?: number
          metrics?: Json
          details?: string | null
          created_at?: string
          message?: string | null
          metric_name?: string | null
          metric_value?: number | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          service?: string
          subsystem?: string | null
          event_type?: string
          severity?: string
          status?: string
          latency_ms?: number
          metrics?: Json
          details?: string | null
          created_at?: string
          message?: string | null
          metric_name?: string | null
          metric_value?: number | null
          metadata?: Json | null
        }
        Relationships: []
      }
      alert_rules: {
        Row: {
          id: string
          name: string
          service: string
          metric_name: string
          threshold: number
          comparison: string
          severity: string
          enabled: boolean
          cooldown_seconds: number
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          service: string
          metric_name: string
          threshold: number
          comparison: string
          severity?: string
          enabled?: boolean
          cooldown_seconds?: number
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          service?: string
          metric_name?: string
          threshold?: number
          comparison?: string
          severity?: string
          enabled?: boolean
          cooldown_seconds?: number
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          id: string
          title: string
          service: string
          severity: string
          status: string
          description: string
          metadata: Json | null
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          service: string
          severity?: string
          status?: string
          description: string
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          service?: string
          severity?: string
          status?: string
          description?: string
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          user_id: string
          market_id?: string | null
          symbol: string
          leverage: number
          side: string
          type: string
          quantity: number
          price: number | null
          status: string
          placed_at: string
          remaining_quantity?: number
          avg_fill_price?: number | null
          fee_paid?: number | null
          total_filled_quantity?: number
          time_in_force?: string | null
          stop_price?: number | null
          locked_notional?: number | null
          reduce_only?: boolean | null
          rejected_reason?: string | null
          cancelled_at?: string | null
          expires_at?: string | null
          filled_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          id?: string
          user_id: string
          market_id?: string | null
          symbol: string
          side: string
          type: string
          quantity: number
          price?: number | null
          status?: string
          placed_at?: string
          remaining_quantity?: number
          avg_fill_price?: number | null
          fee_paid?: number | null
          total_filled_quantity?: number
          time_in_force?: string | null
          stop_price?: number | null
          locked_notional?: number | null
          reduce_only?: boolean | null
          rejected_reason?: string | null
          cancelled_at?: string | null
          expires_at?: string | null
          leverage?: number
          filled_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          market_id?: string | null
          symbol?: string
          side?: string
          type?: string
          quantity?: number
          price?: number | null
          status?: string
          placed_at?: string
          remaining_quantity?: number
          avg_fill_price?: number | null
          fee_paid?: number | null
          total_filled_quantity?: number
          time_in_force?: string | null
          stop_price?: number | null
          locked_notional?: number | null
          reduce_only?: boolean | null
          rejected_reason?: string | null
          cancelled_at?: string | null
          expires_at?: string | null
          leverage?: number
          filled_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          id: string
          user_id: string
          market_id?: string | null
          symbol: string
          side?: string | null
          quantity: number
          average_entry_price: number | null
          unrealized_pnl: number | null
          realized_pnl?: number | null
          current_price?: number | null
          closed_at?: string | null
          updated_at: string
          status?: string
        }
        Insert: {
          id?: string
          user_id: string
          market_id?: string | null
          symbol: string
          side?: string | null
          quantity?: number
          average_entry_price?: number | null
          unrealized_pnl?: number | null
          realized_pnl?: number | null
          current_price?: number | null
          closed_at?: string | null
          updated_at?: string
          status?: string
        }
        Update: {
          id?: string
          user_id?: string
          market_id?: string | null
          symbol?: string
          side?: string | null
          quantity?: number
          average_entry_price?: number | null
          unrealized_pnl?: number | null
          realized_pnl?: number | null
          current_price?: number | null
          closed_at?: string | null
          updated_at?: string
          status?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          id: string
          execution_id?: string | null
          order_id?: string | null
          counter_order_id?: string | null
          user_id: string
          market_id?: string | null
          symbol: string
          side: string
          quantity: number
          price: number
          fee?: number | null
          fee_asset?: string | null
          maker_taker?: string | null
          details?: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          execution_id?: string | null
          order_id?: string | null
          counter_order_id?: string | null
          user_id: string
          market_id?: string | null
          symbol: string
          side: string
          quantity: number
          price: number
          fee?: number | null
          fee_asset?: string | null
          maker_taker?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          execution_id?: string | null
          order_id?: string | null
          counter_order_id?: string | null
          user_id?: string
          market_id?: string | null
          symbol?: string
          side?: string
          quantity?: number
          price?: number
          fee?: number | null
          fee_asset?: string | null
          maker_taker?: string | null
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      executions: {
        Row: {
          id: string
          order_id: string | null
          counter_order_id?: string | null
          user_id: string | null
          market_id?: string | null
          symbol?: string | null
          side?: string | null
          quantity?: number | null
          price?: number | null
          maker_taker?: string | null
          fee?: number | null
          fee_asset?: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          counter_order_id?: string | null
          user_id?: string | null
          market_id?: string | null
          symbol?: string | null
          side?: string | null
          quantity?: number | null
          price?: number | null
          maker_taker?: string | null
          fee?: number | null
          fee_asset?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          counter_order_id?: string | null
          user_id?: string | null
          market_id?: string | null
          symbol?: string | null
          side?: string | null
          quantity?: number | null
          price?: number | null
          maker_taker?: string | null
          fee?: number | null
          fee_asset?: string | null
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      futures_orders: {
        Row: {
          id: string
          user_id: string
          market_id: string
          symbol: string
          side: string
          order_type: string
          status: string
          quantity: number
          remaining_quantity: number
          price: number | null
          trigger_price: number | null
          trailing_distance: number | null
          leverage: number
          margin_mode: string
          reduce_only: boolean
          post_only: boolean
          avg_fill_price: number
          total_filled_quantity: number
          fee_paid: number
          locked_margin: number
          rejected_reason: string | null
          placed_at: string
          updated_at: string
          filled_at: string | null
          cancelled_at: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          market_id: string
          symbol: string
          side: string
          order_type: string
          status?: string
          quantity: number
          remaining_quantity?: number
          price?: number | null
          trigger_price?: number | null
          trailing_distance?: number | null
          leverage?: number
          margin_mode?: string
          reduce_only?: boolean
          post_only?: boolean
          avg_fill_price?: number
          total_filled_quantity?: number
          fee_paid?: number
          locked_margin?: number
          rejected_reason?: string | null
          placed_at?: string
          updated_at?: string
          filled_at?: string | null
          cancelled_at?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          market_id?: string
          symbol?: string
          side?: string
          order_type?: string
          status?: string
          quantity?: number
          remaining_quantity?: number
          price?: number | null
          trigger_price?: number | null
          trailing_distance?: number | null
          leverage?: number
          margin_mode?: string
          reduce_only?: boolean
          post_only?: boolean
          avg_fill_price?: number
          total_filled_quantity?: number
          fee_paid?: number
          locked_margin?: number
          rejected_reason?: string | null
          placed_at?: string
          updated_at?: string
          filled_at?: string | null
          cancelled_at?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      futures_positions: {
        Row: {
          id: string
          user_id: string
          market_id: string
          symbol: string
          side: string
          quantity: number
          average_entry_price: number
          current_price: number
          leverage: number
          margin_mode: string
          initial_margin: number
          maintenance_margin: number
          margin_allocated: number
          unrealized_pnl: number
          realized_pnl: number
          funding_pnl: number
          fee_pnl: number
          total_pnl: number
          liquidation_price: number | null
          margin_ratio: number
          status: string
          opened_at: string
          updated_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          market_id: string
          symbol: string
          side?: string
          quantity?: number
          average_entry_price?: number
          current_price?: number
          leverage?: number
          margin_mode?: string
          initial_margin?: number
          maintenance_margin?: number
          margin_allocated?: number
          unrealized_pnl?: number
          realized_pnl?: number
          funding_pnl?: number
          fee_pnl?: number
          total_pnl?: number
          liquidation_price?: number | null
          margin_ratio?: number
          status?: string
          opened_at?: string
          updated_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          market_id?: string
          symbol?: string
          side?: string
          quantity?: number
          average_entry_price?: number
          current_price?: number
          leverage?: number
          margin_mode?: string
          initial_margin?: number
          maintenance_margin?: number
          margin_allocated?: number
          unrealized_pnl?: number
          realized_pnl?: number
          funding_pnl?: number
          fee_pnl?: number
          total_pnl?: number
          liquidation_price?: number | null
          margin_ratio?: number
          status?: string
          opened_at?: string
          updated_at?: string
          closed_at?: string | null
        }
        Relationships: []
      }
      funding_history: {
        Row: {
          id: string
          position_id: string
          user_id: string
          symbol: string
          funding_rate: number
          funding_fee: number
          interval_start: string
          interval_end: string
          settled_at: string
          details: Json
        }
        Insert: {
          id?: string
          position_id: string
          user_id: string
          symbol: string
          funding_rate?: number
          funding_fee?: number
          interval_start?: string
          interval_end?: string
          settled_at?: string
          details?: Json
        }
        Update: {
          id?: string
          position_id?: string
          user_id?: string
          symbol?: string
          funding_rate?: number
          funding_fee?: number
          interval_start?: string
          interval_end?: string
          settled_at?: string
          details?: Json
        }
        Relationships: []
      }
      order_events: {
        Row: {
          id: string
          order_id: string
          event_type: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          event_type: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          event_type?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_email: string | null
          action: string
          target_type: string | null
          target_id: string | null
          severity: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_email?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          severity?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          actor_email?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          severity?: string | null
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          id: string
          security_event_id: string | null
          user_id: string | null
          flag_type: string
          severity: string
          confidence: number | null
          notes: string | null
          assigned_to: string | null
          status: string
          created_at: string
          details: Json | null
        }
        Insert: {
          id?: string
          security_event_id?: string | null
          user_id?: string | null
          flag_type: string
          severity?: string
          confidence?: number | null
          notes?: string | null
          assigned_to?: string | null
          status?: string
          created_at?: string
          details?: Json | null
        }
        Update: {
          id?: string
          security_event_id?: string | null
          user_id?: string | null
          flag_type?: string
          severity?: string
          confidence?: number | null
          notes?: string | null
          assigned_to?: string | null
          status?: string
          created_at?: string
          details?: Json | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          session_id: string
          user_id: string
          ip_address: string | null
          user_agent: string | null
          device_fingerprint?: string | null
          status: string
          login_at: string
          last_seen_at: string
          expires_at?: string | null
          country?: string | null
          risk_score: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          ip_address?: string | null
          user_agent?: string | null
          device_fingerprint?: string | null
          status?: string
          login_at?: string
          last_seen_at?: string
          expires_at?: string | null
          country?: string | null
          risk_score?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          ip_address?: string | null
          user_agent?: string | null
          device_fingerprint?: string | null
          status?: string
          login_at?: string
          last_seen_at?: string
          expires_at?: string | null
          country?: string | null
          risk_score?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_wallets: {
        Row: {
          id: string
          wallet_type: string
          asset: string
          address: string
          label?: string | null
          status: string
          balance: number
          available_balance: number
          reserved_balance: number
          min_balance: number
          max_balance?: number | null
          last_synced_at?: string | null
          risk_score: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          wallet_type: string
          asset: string
          address: string
          label?: string | null
          status?: string
          balance?: number
          available_balance?: number
          reserved_balance?: number
          min_balance?: number
          max_balance?: number | null
          last_synced_at?: string | null
          risk_score?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          wallet_type?: string
          asset?: string
          address?: string
          label?: string | null
          status?: string
          balance?: number
          available_balance?: number
          reserved_balance?: number
          min_balance?: number
          max_balance?: number | null
          last_synced_at?: string | null
          risk_score?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_transfers: {
        Row: {
          id: string
          from_wallet_id: string
          to_wallet_id: string
          amount: number
          asset?: string | null
          transfer_type?: string | null
          status?: string | null
          initiated_by?: string | null
          notes?: string | null
          metadata?: Json | null
          created_at: string
          completed_at?: string | null
          updated_at: string
          balance_before?: number | null
          balance_after?: number | null
        }
        Insert: {
          id?: string
          from_wallet_id: string
          to_wallet_id: string
          amount: number
          asset?: string | null
          transfer_type?: string | null
          status?: string | null
          initiated_by?: string | null
          notes?: string | null
          metadata?: Json | null
          created_at?: string
          completed_at?: string | null
          updated_at?: string
          balance_before?: number | null
          balance_after?: number | null
        }
        Update: {
          id?: string
          from_wallet_id?: string
          to_wallet_id?: string
          amount?: number
          asset?: string | null
          transfer_type?: string | null
          status?: string | null
          initiated_by?: string | null
          notes?: string | null
          metadata?: Json | null
          created_at?: string
          completed_at?: string | null
          updated_at?: string
          balance_before?: number | null
          balance_after?: number | null
        }
        Relationships: []
      }
      reserve_snapshots: {
        Row: {
          id: string
          snapshot_time: string
          hot_balance: number
          cold_balance: number
          total_reserve: number
          liabilities: number
          net_treasury: number
          exposure: number
          source: string
          metrics: Json
          generated_at: string
          created_at?: string
        }
        Insert: {
          id?: string
          snapshot_time?: string
          hot_balance?: number
          cold_balance?: number
          total_reserve?: number
          liabilities?: number
          net_treasury?: number
          exposure?: number
          source?: string
          metrics?: Json
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          snapshot_time?: string
          hot_balance?: number
          cold_balance?: number
          total_reserve?: number
          liabilities?: number
          net_treasury?: number
          exposure?: number
          source?: string
          metrics?: Json
          generated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          admin_note: string | null
          amount: number
          asset: string
          created_at: string
          fee: number
          id: string
          ip_address: string | null
          memo: string | null
          network: Database["public"]["Enums"]["network_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          to_address: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          asset: string
          created_at?: string
          fee?: number
          id?: string
          ip_address?: string | null
          memo?: string | null
          network: Database["public"]["Enums"]["network_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          to_address: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          asset?: string
          created_at?: string
          fee?: number
          id?: string
          ip_address?: string | null
          memo?: string | null
          network?: Database["public"]["Enums"]["network_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          to_address?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lock_balance_for_order: {
        Args: {
          p_user_id: string
          p_asset: string
          p_amount: number
        }
        Returns: { available: number; locked: number }[]
      }
      release_locked_balance: {
        Args: {
          p_user_id: string
          p_asset: string
          p_amount: number
        }
        Returns: { available: number; locked: number }[]
      }
      adjust_balance_atomic: {
        Args: {
          p_user_id: string
          p_asset: string
          p_available_delta: number
          p_locked_delta: number
        }
        Returns: { available: number; locked: number }[]
      }
    }
    Enums: {
      account_status: "active" | "frozen" | "banned"
      app_role: "admin" | "user" | "moderator"
      deposit_status: "pending" | "approved" | "rejected" | "hold"
      kyc_level: "none" | "basic" | "advanced"
      kyc_status: "pending" | "approved" | "rejected"
      market_status: "active" | "paused" | "disabled"
      network_type: "BTC" | "ERC20" | "TRC20" | "BEP20" | "SOL"
      txn_type:
        | "deposit"
        | "withdrawal"
        | "trade_buy"
        | "trade_sell"
        | "fee"
        | "adjustment"
        | "transfer"
      withdrawal_status: "pending" | "approved" | "rejected" | "hold"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "frozen", "banned"],
      app_role: ["admin", "user", "moderator"],
      deposit_status: ["pending", "approved", "rejected", "hold"],
      kyc_level: ["none", "basic", "advanced"],
      kyc_status: ["pending", "approved", "rejected"],
      market_status: ["active", "paused", "disabled"],
      network_type: ["BTC", "ERC20", "TRC20", "BEP20", "SOL"],
      txn_type: [
        "deposit",
        "withdrawal",
        "trade_buy",
        "trade_sell",
        "fee",
        "adjustment",
        "transfer",
      ],
      withdrawal_status: ["pending", "approved", "rejected", "hold"],
    },
  },
} as const
