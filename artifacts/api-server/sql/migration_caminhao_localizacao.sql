-- Migration: adicionar colunas de rastreamento GPS na tabela caminhao_localizacao_atual
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/trlwbwqnuxbqmefdrzls/sql

-- Adicionar colunas caso não existam (preserva dados existentes)
ALTER TABLE caminhao_localizacao_atual
  ADD COLUMN IF NOT EXISTS imei TEXT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS velocidade DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS data_gps TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_recebimento TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS raw_data TEXT;

-- Índice para busca por IMEI (performance)
CREATE INDEX IF NOT EXISTS idx_caminhao_localizacao_imei
  ON caminhao_localizacao_atual (imei);

-- Índice para busca temporal
CREATE INDEX IF NOT EXISTS idx_caminhao_localizacao_data
  ON caminhao_localizacao_atual (data_recebimento DESC);
