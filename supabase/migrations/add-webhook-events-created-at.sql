-- =============================================================================
-- Migration: add-webhook-events-created-at.sql
-- Data: 2026-09-12
-- Autor: agente (via harden-cron-cleanup-record-usage)
--
-- CONTEXTO
-- A tabela webhook_events foi criada manualmente no banco, sem a coluna
-- created_at (nenhuma migration no repo a cria). Descoberto em 2026-09-12
-- ao endurecer o cron /api/cron/cleanup-analytics: o DELETE por
-- created_at < cutoff falhava com "column webhook_events.created_at does
-- not exist" (42703) e o erro era engolido silenciosamente — a rota
-- respondia 200 com zeros falsos. Com a hardenização, a falha ficou
-- visível (500 + motivo na resposta).
--
-- Esta migration também corrige a rota /api/admin-sistema/analytics/cleanup,
-- que deleta webhook_events pela mesma coluna.
--
-- EFEITO
-- - Linhas já existentes recebem created_at = momento da migration; sairão
--   pela retention de 30 dias a partir da execução (comportamento aceito —
--   não há como reconstruir a idade real de linhas sem timestamp).
-- - INSERTs novos (rota /api/webhooks/mercadopago) não precisam mudar: o
--   default agora() preenche a coluna automaticamente.
--
-- EXECUTAR NO: Supabase Dashboard → SQL Editor (idempotente).
-- =============================================================================

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Índice para o DELETE por cutoff do cleanup diário (e da rota admin).
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON public.webhook_events (created_at);
