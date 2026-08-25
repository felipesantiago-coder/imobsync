-- Migration: Corrigir unique constraint para incluir 'bloco'
-- Antes: UNIQUE(empreendimento_id, unidade) — causava colisão entre blocos
-- Depois: UNIQUE(empreendimento_id, bloco, unidade) com bloco DEFAULT ''

-- 1. Garantir que bloco nunca seja NULL (necessário para unique constraint)
ALTER TABLE public.projeto_units ALTER COLUMN bloco SET DEFAULT '';
UPDATE public.projeto_units SET bloco = '' WHERE bloco IS NULL;
ALTER TABLE public.projeto_units ALTER COLUMN bloco SET NOT NULL;

-- 2. Remover duplicatas existentes mantendo a primeira ocorrência por (empreendimento_id, bloco, unidade)
DELETE FROM public.projeto_units a
USING public.projeto_units b
WHERE a.id > b.id
  AND a.empreendimento_id = b.empreendimento_id
  AND a.bloco = b.bloco
  AND a.unidade = b.unidade;

-- 3. Remover índice unique antigo
DROP INDEX IF EXISTS public.idx_projeto_units_emp_unidade;

-- 4. Criar novo índice unique incluindo bloco
CREATE UNIQUE INDEX IF NOT EXISTS idx_projeto_units_emp_bloco_unidade
  ON public.projeto_units(empreendimento_id, bloco, unidade);
