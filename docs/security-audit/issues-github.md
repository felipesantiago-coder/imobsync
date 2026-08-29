# Issues para o GitHub - Auditoria de Seguranca ImobSync

--- ISSUE 1 ---
## [Seguranca] CRITICA: Remover 3 endpoints de debug sem autenticacao que expoe service_role e Mercado Pago

**Labels:** security, critica

### Problema
Tres endpoints estao acessiveis sem nenhuma verificacao de autenticacao em producao. O middleware passa todas as rotas `/api/*` sem verificacao (middleware.ts:31-34).

1. **GET /api/debug/mp-test** - Usa `createAdminClient()` (service_role) para ler planos ativos e modificar `back_url` no Mercado Pago
2. **GET /api/admin-sistema/planos/debug-mp-plan** - Cria planos de teste reais na API do Mercado Pago
3. **POST /api/admin-sistema/planos/update-mp-pix** - Modifica metodos de pagamento de TODOS os planos ativos

### Evidencia
- `src/app/api/debug/mp-test/route.ts:13` - `export async function GET() {` sem nenhuma chamada de auth antes
- `src/app/api/admin-sistema/planos/debug-mp-plan/route.ts:11` - Mesmo padrao
- `src/app/api/admin-sistema/planos/update-mp-pix/route.ts:11` - Mesmo padrao

### Impacto
- Um atacante pode redirecionar todos os callbacks de pagamento para URL controlada por ele
- Pode desabilitar PIX em todos os planos, quebrando o fluxo de pagamento de todos os clientes
- Leitura de dados sensiveis de planos (precos, IDs internos do Mercado Pago)

### Sugestao de correcao
```typescript
// Adicionar no inicio de cada handler:
import { requireAdminSistema } from '@/lib/admin-auth';

export async function GET() {
  const isAllowed = await requireAdminSistema();
  if (!isAllowed) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  // ... resto do codigo
}
```
Ou, se os endpoints nao sao mais necessarios, simplesmente excluir os arquivos.

### Checklist de aceite
- [ ] Endpoints retornam 401/403 quando acessados sem autenticacao
- [ ] Endpoints retornam 403 quando acessados por usuario sem role admin_sistema
- [ ] Endpoints funcionam normalmente quando acessados por admin_sistema
- [ ] `grep -r "debug-mp\|update-mp-pix\|mp-test" src/` nao retorna resultados em rotas de API

--- FIM ISSUE 1 ---

--- ISSUE 2 ---
## [Seguranca] CRITICA: Reabilitar RLS nas tabelas analytics_events e unit_status_history

**Labels:** security, critica

### Problema
O SQL em `supabase/fix-analytics-and-monitoring.sql` (linhas 22-23) desabilitou o RLS nessas tabelas para corrigir um bug de insert. A `NEXT_PUBLIC_SUPABASE_ANON_KEY` esta exposta no bundle do frontend. Com RLS desabilitado, qualquer pessoa pode:
- `SELECT * FROM analytics_events` via Supabase REST API - ler IPs, user_ids, padroes de navegacao
- `INSERT INTO analytics_events` - injetar dados falsos e distorcer metricas
- `SELECT * FROM unit_status_history` - ler todo historico de mudancas de status

### Evidencia
```sql
-- supabase/fix-analytics-and-monitoring.sql:22-23
ALTER TABLE IF EXISTS analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS unit_status_history DISABLE ROW LEVEL SECURITY;
```

### Impacto
- Vazamento de dados de todos os usuarios (IPs, acoes, horarios)
- Possibilidade de envenenamento de metricas de analytics

### Sugestao de correcao
```sql
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_insert_auth" ON analytics_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "analytics_select_admin" ON analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );

ALTER TABLE unit_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_history_insert_admin" ON unit_status_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "status_history_select_admin" ON unit_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );
```
Os inserts via API route ja usam `createAdminClient()` (service_role, bypassa RLS), entao a mudança nao afeta o funcionamento do tracking.

### Checklist de aceite
- [ ] RLS reabilitado em ambas as tabelas
- [ ] Politicas de INSERT e SELECT criadas e testadas
- [ ] API de tracking continua funcionando (testar login + navegacao)
- [ ] Aba de metricas do admin continua exibindo dados
- [ ] Tentativa de SELECT via anon key retorna 0 resultados
- [ ] Tentativa de INSERT via anon key e bloqueada

--- FIM ISSUE 2 ---

--- ISSUE 3 ---
## [Seguranca] ALTA: Corrigir politica RLS UPDATE da tabela units e adicionar isolamento de coordenadores

**Labels:** security, alta

### Problema
Dois problemas nas politicas RLS:

**3a - units UPDATE permite qualquer usuario autenticado:**
`supabase/schema.sql:41-44` - A politica se chama "Apenas admin pode editar" mas a clausula USING e `auth.role() = 'authenticated'`, concedendo UPDATE a qualquer usuario logado via Supabase REST API.

**3b - projeto_units UPDATE sem isolamento por empreendimento:**
`supabase/schema-admin.sql:143-148` - A politica para coordenadores verifica apenas se o usuario tem role=coordenador, sem verificar se o empreendimento lhe foi atribuido via `coordenador_empreendimentos`.

### Evidencia
```sql
-- schema.sql:41-44 (ERRADO)
CREATE POLICY "Apenas admin pode editar"
ON units FOR UPDATE
USING (auth.role() = 'authenticated');  -- qualquer logado!

-- schema-admin.sql:143-148 (FALTANDO isolamento)
CREATE POLICY "projeto_units_coordenador" ON public.projeto_units
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coordenador', 'admin_sistema'))
  );
```

### Impacto
- Qualquer usuario logado pode alterar status de unidades (disponivel/vendido) via REST API direta
- Coordenador de um empreendimento pode modificar unidades de qualquer outro

### Sugestao de correcao
```sql
-- Fix units
DROP POLICY "Apenas admin pode editar" ON units;
CREATE POLICY "Apenas admin pode editar" ON units
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );

-- Fix projeto_units
DROP POLICY "projeto_units_coordenador" ON projeto_units;
CREATE POLICY "projeto_units_coordenador" ON projeto_units
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN coordenador_empreendimentos ce ON ce.coordenador_id = p.id
      WHERE p.id = auth.uid() AND p.role = 'coordenador'
        AND ce.empreendimento_id = projeto_units.empreendimento_id
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
    )
  );
```

### Checklist de aceite
- [ ] Testar UPDATE em units via Supabase REST com usuario comum - deve ser bloqueado
- [ ] Testar UPDATE em units via Supabase REST com admin_sistema - deve funcionar
- [ ] Testar coordenador do Emp A tentando modificar unidade do Emp B - deve ser bloqueado
- [ ] Testar coordenador do Emp A modificando unidade do Emp A - deve funcionar

--- FIM ISSUE 3 ---

--- ISSUE 4 ---
## [Seguranca] ALTA: Criar politica profiles_update_own e escapar displayName no email MFA

**Labels:** security, alta

### Problema
**4a - profiles sem UPDATE para usuarios comuns:** Nao existe politica RLS que permita usuarios comuns atualizarem seu proprio perfil. O fluxo `first-login/change-password` usa `createClient()` (anon, RLS aplica) e o UPDATE silenciosamente falha para nao-admins. Flags `must_change_password` e `must_setup_mfa` nunca sao limpos.

**4b - XSS em email MFA:** `src/lib/mfa/email.ts:38` injeta `displayName` sem escape no HTML. A funcao `escapeHtml()` existe (linha 67) mas so e usada para `userAgent`. `displayName` vem do perfil do usuario e e controlado por ele.

### Evidencia
```typescript
// email.ts:38 - displayName NAO escapado:
<p>Ola${data.displayName ? ` ${data.displayName}` : ""},</p>

// email.ts:51 - userAgent ESCAPADO corretamente:
<td>${escapeHtml(data.userAgent)}</td>
```

### Sugestao de correcao
```sql
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```
```typescript
// email.ts:38 - aplicar escapeHtml
<p>Ola${data.displayName ? ` ${escapeHtml(data.displayName)}` : ""},</p>
```

### Checklist de aceite
- [ ] Novo usuario consegue completar fluxo de change-password com sucesso
- [ ] Flag must_change_password e limpa apos troca de senha
- [ ] Flag must_setup_mfa e definida apos troca de senha
- [ ] Email MFA com display_name contendo HTML exibe texto plano, nao renderiza HTML

--- FIM ISSUE 4 ---

--- ISSUE 5 ---
## [Seguranca] MEDIA: Exportar schema completo, corrigir fail-open, CSP e remover emails hardcoded

**Labels:** security, media

### Problema
Multiplos achados de severidade media agrupados:

**5a - 13 tabelas sem schema versionado:** assinaturas, pagamentos, user_totp, user_passkeys, planos, cupons, cupom_usos, simulador_configs, webhook_events, coordenador_empreendimentos, villa_bianco_units, vitta_units, moment_units foram criadas via dashboard Supabase sem SQL versionado. RLS e politicas nao sao auditaveis.

**5b - coordinator-access.ts fail-open:** Se a tabela coordenador_empreendimentos nao existir, retorna null que e interpretado como acesso concedido (linha 46-48).

**5c - CSP com unsafe-inline e unsafe-eval:** next.config.ts:34 permite esses diretivas, anulando a protecao do CSP contra XSS.

**5d - Email admin hardcoded no frontend:** 3 arquivos .tsx comparam email hardcoded "prosperosdirecional@gmail.com" no bundle JS.

**5e - seed-admin com email default:** route.ts:6 usa fallback hardcoded se env var ausente.

### Sugestao de correcao
- Executar `supabase db dump` e commitar schemas como migrations
- Alterar fail-open para fail-closed em coordinator-access.ts
- Migrar CSP para nonces
- Mover verificacao de admin para API, remover emails do frontend
- Remover fallback de email em seed-admin

### Checklist de aceite
- [ ] Arquivos de migracao SQL commitados para todas as tabelas
- [ ] Politicas RLS de todas as tabelas documentadas
- [ ] coordinator-access.ts retorna false quando tabela nao existe
- [ ] CSP nao contem unsafe-inline nem unsafe-eval
- [ ] Nenhum email hardcoded encontrado com `grep -r "@gmail" src/ --include="*.tsx"`
- [ ] seed-admin falha se SEED_ADMIN_EMAIL nao definido

--- FIM ISSUE 5 ---

--- ISSUE 6 ---
## [Seguranca] BAIXA: Limpeza - remover fallback ADMIN_EMAILS, timing-unsafe cron, db.ts morto e diretorio imobsync

**Labels:** security, baixa

### Problema
Achados menores de limpeza:

- `api-auth.ts:56-59` ainda tem fallback ADMIN_EMAILS que foi removido de admin-auth.ts
- `record-usage/route.ts:24` usa `!==` para comparar CRON_SECRET (timing-unsafe)
- `src/lib/db.ts` importa @prisma/client (nao esta nas dependencias)
- Diretorio `imobsync/` e copia desatualizada do source

### Sugestao de correcao
- Remover bloco ADMIN_EMAILS de api-auth.ts
- Substituir `!==` por `crypto.timingSafeEqual()`
- Excluir db.ts
- Adicionar imobsync/ ao .gitignore ou excluir

### Checklist de aceite
- [ ] requireWriteAccess nao referencia ADMIN_EMAILS
- [ ] record-usage usa timingSafeEqual
- [ ] db.ts nao existe mais
- [ ] imobsync/ esta no .gitignore ou foi removido

--- FIM ISSUE 6 ---
