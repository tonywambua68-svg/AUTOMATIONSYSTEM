/**
 * Supabase Client Configuration
 * 
 * This connects to the actual database for persistent storage.
 * Environment variables must be set in .env file:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 * 
 * If not configured, the system falls back to in-memory storage
 * and logs a warning that persistence is unavailable.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let isConfigured = false;

export function initializeSupabase(): SupabaseClient | null {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      '[ConversationEngine] Supabase not configured. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for persistence. ' +
      'Falling back to in-memory storage (data will not survive restarts).'
    );
    return null;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    isConfigured = true;
    return supabaseInstance;
  } catch (error) {
    console.error('[ConversationEngine] Failed to initialize Supabase:', error);
    return null;
  }
}

export function getSupabase(): SupabaseClient | null {
  if (!supabaseInstance) {
    initializeSupabase();
  }
  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

/**
 * Database schema required for full persistence:
 * 
 * CREATE TABLE workspaces (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   name TEXT NOT NULL,
 *   currency TEXT NOT NULL DEFAULT 'USD',
 *   greeting_message TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE products (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   name TEXT NOT NULL,
 *   category TEXT NOT NULL,
 *   description TEXT,
 *   price DECIMAL(12,2) NOT NULL,
 *   currency TEXT NOT NULL,
 *   in_stock BOOLEAN DEFAULT true,
 *   stock_quantity INTEGER DEFAULT 0,
 *   tags TEXT[] DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE conversations (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   customer_phone TEXT NOT NULL,
 *   status TEXT DEFAULT 'active',
 *   context JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE conversation_messages (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   sender TEXT NOT NULL CHECK (sender IN ('customer', 'business')),
 *   content TEXT NOT NULL,
 *   intent TEXT,
 *   confidence DECIMAL(3,2),
 *   metadata JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE learning_insights (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   category TEXT NOT NULL,
 *   description TEXT NOT NULL,
 *   suggestion TEXT,
 *   evidence TEXT[] DEFAULT '{}',
 *   approved BOOLEAN DEFAULT false,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE learning_records (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   type TEXT NOT NULL,
 *   pattern TEXT NOT NULL,
 *   learned_from TEXT,
 *   confidence DECIMAL(3,2),
 *   approved BOOLEAN DEFAULT false,
 *   usage_count INTEGER DEFAULT 0,
 *   success_rate DECIMAL(3,2) DEFAULT 0,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * CREATE TABLE workflow_configs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 *   config JSONB NOT NULL,
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * -- Row Level Security for tenant isolation
 * ALTER TABLE products ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE learning_insights ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE learning_records ENABLE ROW LEVEL SECURITY;
 */
