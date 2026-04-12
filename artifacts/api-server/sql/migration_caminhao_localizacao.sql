-- Migration: adicionar colunas de rastreamento GPS na tabela caminhao_localizacao_atual
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/trlwbwqnuxbqmefdrzls/sql

-- 1. Adicionar colunas caso não existam (preserva dados existentes)
ALTER TABLE caminhao_localizacao_atual
  ADD COLUMN IF NOT EXISTS imei TEXT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS velocidade DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS data_gps TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_recebimento TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS raw_data TEXT;

-- 2. Permitir caminhao_id nulo para registros de rastreadores sem caminhão cadastrado
ALTER TABLE caminhao_localizacao_atual
  ALTER COLUMN caminhao_id DROP NOT NULL;

-- 3. Índice para busca por IMEI (performance)
CREATE INDEX IF NOT EXISTS idx_caminhao_localizacao_imei
  ON caminhao_localizacao_atual (imei);

-- 4. Índice para busca temporal
CREATE INDEX IF NOT EXISTS idx_caminhao_localizacao_data
  ON caminhao_localizacao_atual (data_recebimento DESC);
