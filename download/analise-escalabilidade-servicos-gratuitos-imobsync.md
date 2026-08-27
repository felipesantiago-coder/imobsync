# ImobSync — Análise Completa de Escalabilidade com Serviços Gratuitos

> **Data**: 28/08/2026  
> **Escopo**: Todas as funcionalidades do sistema, sem perda de recursos  
> **Objetivo**: Determinar se é viável operar 100% com serviços gratuitos, mantendo segurança e escalabilidade

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Mapeamento Completo de Funcionalidades](#2-mapeamento-completo-de-funcionalidades)
3. [Serviços Externos Utilizados](#3-serviços-externos-utilizados)
4. [Análise por Serviço — Limites e Alternativas Gratuitas](#4-análise-por-serviço--limites-e-alternativas-gratuitas)
5. [Matriz de Risco de Escalabilidade](#5-matriz-de-risco-de-escalabilidade)
6. [Estratégia de Migração para 100% Gratuito](#6-estratégia-de-migração-para-100-gratuito)
7. [Análise de Segurança no Stack Gratuito](#7-análise-de-segurança-no-stack-gratuito)
8. [Tabela Resumo — Custo Zero vs. Atual](#8-tabela-resumo--custo-zero-vs-atual)
9. [Conclusões e Recomendações](#9-conclusões-e-recomendações)

---

## 1. Visão Geral da Arquitetura

O **ImobSync** é uma plataforma SaaS vertical para o mercado imobiliário brasileiro, construída com:

| Camada | Tecnologia | Custo Atual |
|--------|-----------|-------------|
| **Frontend** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui | Gratuito (open-source) |
| **Backend** | Next.js API Routes (serverless) | Incluído no hosting |
| **Banco de Dados** | Supabase (PostgreSQL) | Gratuito até limites |
| **Autenticação** | Supabase Auth (JWT + RLS) | Gratuito até limites |
| **Armazenamento** | Supabase Storage | Gratuito até 1 GB |
| **Pagamentos** | Mercado Pago SDK v3 | Gratuito (taxa por transação) |
| **E-mail Transacional** | Resend | Gratuito até 3.000/mês |
| **Hosting** | Vercel | Gratuito até limites |
| **Cron Jobs** | cron-job.org | Gratuito |
| **Indicadores Econômicos** | Bacen SGS + brasilindicadores.com.br | Gratuito (público) |

O sistema possui **~45 rotas de API**, **~15 páginas**, **~20+ tabelas no banco**, e funcionalidades que incluem espelho de vendas interativo, simulador de pagamentos com correção INCC, assinaturas recorrentes, MFA (TOTP + WebAuthn/Passkeys), analytics, e painel administrativo completo.

---

## 2. Mapeamento Completo de Funcionalidades

### 2.1 Autenticação e Segurança

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Login (email/senha) | Autenticação via Supabase Auth com JWT | Supabase Auth |
| Primeiro acesso | Fluxo obrigatório de troca de senha + configuração MFA | Supabase Auth, DB |
| MFA TOTP | Geração de QR code + verificação de código 6 dígitos | otplib (local), qrcode (local), Supabase |
| MFA WebAuthn/Passkeys | Registro e autenticação via chaves de segurança | @simplewebauthn (local), Supabase |
| Detecção de novo dispositivo | Fingerprint de user-agent + notificação por e-mail | Supabase DB, Resend |
| Controle de acesso por role | `coordenador` e `admin_sistema` com RLS | Supabase RLS |
| Middleware de rotas | Verificação de sessão, MFA, assinatura e primeiro acesso | Next.js Middleware, Cookies |
| Rate limiting | Proteção contra brute-force em endpoints sensíveis | In-memory (Node.js) |

### 2.2 Gestão de Empreendimentos

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| CRUD de empreendimentos | Criar, editar, excluir empreendimentos com imagem | Supabase DB + Storage |
| Upload de unidades via Excel | Bulk upsert de unidades a partir de planilha .xlsx | xlsx (local), Supabase |
| Upload de imagem | Imagem de capa do empreendimento (max 10 MB) | Supabase Storage |
| Atribuição a coordenadores | Controle de qual coordenador acessa qual empreendimento | Supabase DB |
| Configuração de simulador | Parâmetros customizados por empreendimento | Supabase DB |

### 2.3 Espelho de Vendas (Dashboard Interativo)

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Grid/table de unidades | Visualização em grade ou tabela com status colorido | Supabase (realtime) |
| Filtros por andar/ala/status | Painel de filtros dinâmico | Client-side (React) |
| Alteração de status | Coordenador/admin altera disponível -> reservado -> vendido | Supabase DB |
| Histórico de alterações | Registro completo de quem alterou, quando e de/para qual status | Supabase DB |
| Responsividade mobile | Grid adaptável (1 coluna mobile -> 4 colunas desktop) | Client-side (Tailwind) |
| Supabase Realtime | Atualização instantânea entre múltiplos usuários | Supabase Realtime |

### 2.4 Simulador de Pagamentos

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Cálculo de parcelas | Semestrais, anuais e intermediárias com entrada | Client-side (JS puro) |
| Correção INCC | Índice de custo da construção para reajuste | Bacen SGS / brasilindicadores (APIs públicas) |
| Exportação PDF | Geração de PDF com tabela de parcelas | jspdf + jspdf-autotable (client-side) |
| Configuração por empreendimento | Valores, áreas e parâmetros customizáveis | Supabase DB |

### 2.5 Assinaturas e Pagamentos

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Planos de assinatura | CRUD de planos (nome, preço, período, features) | Supabase DB, Mercado Pago |
| Checkout via PIX | Pagamento instantâneo via PIX | Mercado Pago Preference API |
| Checkout via cartão | Pagamento recorrente com cartão de crédito | Mercado Pago PreApproval API |
| Cupons de desconto | Códigos promocionais com validade e limite de uso | Supabase DB |
| Webhooks de pagamento | Recebimento e processamento de confirmações | Mercado Pago Webhooks, Supabase |
| Cancelamento | Cancelamento de assinatura (MP + banco local) | Mercado Pago API, Supabase |
| Reconciliação diária | Cron que sincroniza status local com o Mercado Pago | cron-job.org, Mercado Pago API, Supabase |
| Expiração automática | Marca assinaturas vencidas (lazy + cron) | Supabase DB, cron-job.org |
| Renovação / upgrade | Fluxo de nova assinatura ou mudança de plano | Mercado Pago, Supabase |

### 2.6 Painel Administrativo

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Gestão de usuários | Criar, listar, alterar role, excluir | Supabase Auth (admin API) + DB |
| Gestão de assinaturas | Visualizar todas, ativar manualmente, conceder lifetime | Supabase DB |
| Gestão de cupons | CRUD completo de cupons de desconto | Supabase DB |
| Métricas e analytics | KPIs, gráficos diários/semanais, top usuários, histórico | Supabase DB, Recharts (client-side) |
| Upload de imagem de empreendimento | Upload e deleção de imagens de capa | Supabase Storage |
| Upload de Excel | Importação em massa de unidades | Supabase DB, xlsx (local) |
| Migração de dados legados | Migrar tabelas antigas para tabela genérica | Supabase DB |

### 2.7 Analytics

| Funcionalidade | Descrição | Serviços Envolvidos |
|---------------|-----------|-------------------|
| Tracking de eventos | Registro de ações do usuário (visualizações, cliques, alterações) | Supabase DB |
| Histórico de status de unidades | Log de todas as alterações de status de unidades | Supabase DB |
| Eventos de login | Registro de IP, user-agent e fingerprint de dispositivo | Supabase DB |
| Dashboard de métricas | Visualização com gráficos para o admin | Supabase DB, Recharts |
| Limpeza de dados antigos | Remoção de eventos analytics antigos | Supabase DB, cron-job.org |

---

## 3. Serviços Externos Utilizados

### 3.1 Diagrama de Dependências

```
ImobSync
├── Supabase ( Banco de Dados + Auth + Storage + Realtime )
│   ├── PostgreSQL — 20+ tabelas, RLS, triggers, funções
│   ├── Auth — JWT, session cookies, admin API
│   ├── Storage — Bucket "empreendimentos" (imagens), "downloads"
│   └── Realtime — Atualizações instantâneas do espelho de vendas
│
├── Vercel ( Hosting + Serverless Functions )
│   ├── Next.js SSR/SSG
│   ├── ~45 API Routes (serverless)
│   └── Middleware (Edge)
│
├── Mercado Pago ( Pagamentos )
│   ├── PreApproval API — Assinaturas recorrentes
│   ├── Preference API — Checkout Pro (PIX, cartão, boleto)
│   ├── Payment API — Consulta de pagamentos
│   └── Webhooks — Notificações de pagamento
│
├── Resend ( E-mail Transacional )
│   └── Notificação de novo dispositivo (MFA)
│
├── Bacen SGS API ( Indicador Econômico )
│   └── Série 192 — INCC-DI (fallback)
│
├── brasilindicadores.com.br ( Indicador Econômico )
│   └── INCC-M (fonte principal, scraping)
│
└── cron-job.org ( Agendador de Tarefas )
    ├── /api/cron/reconcile-mp (diário)
    └── /api/cron/expire-subscriptions (diário)
```

---

## 4. Análise por Serviço — Limites e Alternativas Gratuitas

### 4.1 Supabase (Banco de Dados + Auth + Storage)

#### Plano Gratuito Atual

| Recurso | Limite Gratuito | Uso Estimado (50 usuários) | Risco |
|---------|----------------|--------------------------|-------|
| Banco de Dados (PostgreSQL) | 500 MB | ~20-50 MB | Seguro |
| Auth — MAU (Monthly Active Users) | 50.000 | < 100 | Seguro |
| Auth — Provedores sociais | 3 (Google, Apple, Email) | 1 (Email) | Seguro |
| Storage | 1 GB | ~10-50 MB (imagens de empreendimentos) | Seguro |
| Largura de banda (Storage) | 5 GB/mês | < 1 GB/mês | Seguro |
| Realtime (conexões) | 200 simultâneas | < 20 simultâneas | Seguro |
| Realtime (mensagens/seg) | 100 | < 10 | Seguro |
| Edge Functions | 500.000 invocações/mês | ~100.000 | Seguro |
| Row Level Security | Ilimitado | ~15 políticas | Seguro |

#### Ponto de Ruptura (Quando o Gratuito Deixa de Ser Suficiente)

| Cenário | Limite Afetado | Nº Aprox. de Usuários |
|---------|---------------|---------------------|
| Base de dados > 500 MB | PostgreSQL storage | ~500-1.000+ empreendimentos com unidades |
| MAU > 50.000 | Auth | Impossível no modelo SaaS B2B atual |
| Conexões Realtime > 200 | Realtime | ~100+ coordenadores acessando ao mesmo tempo |

#### Alternativas 100% Gratuitas

| Alternativa | Como Funciona | Perda de Funcionalidade? |
|------------|---------------|----------------------|
| **Manter Supabase Free** | O plano gratuito é suficiente para o volume atual e projetado (SaaS B2B com < 500 usuários) | Nenhuma |
| **Neon (PostgreSQL serverless)** | 0.5 GB gratuito, auto-pause, branching | Nenhuma, mas exige migração do Auth e Storage |
| **Turso (SQLite edge)** | 9 GB gratuito, 500 DBs | Perde recursos avançados do PostgreSQL (triggers, RLS nativo) |
| **Railway (Hobby)** | $5 crédito/mês (não é gratuito puro) | — |

#### Veredicto

> **Manter Supabase Free.** O plano gratuito cobre confortavelmente o modelo B2B do ImobSync. Com 50.000 MAU gratuitos, o sistema suporta centenas de coordenadores acessando diariamente. Os 500 MB de banco são suficientes para centenas de empreendimentos. A única restrição significativa é a de 200 conexões Realtime simultâneas — improvável de ser atingida em um SaaS B2B imobiliário.

---

### 4.2 Vercel (Hosting + Serverless)

#### Plano Gratuito Atual

| Recurso | Limite Gratuito | Uso Estimado | Risco |
|---------|----------------|-------------|-------|
| Largura de banda | 100 GB/mês | ~5-20 GB/mês | Seguro |
| Serverless Function invocações | 100.000/mês (Hobby) | ~50.000-80.000 | Atenção |
| Duração por função | 10 segundos | < 3s típico | Seguro |
| Builds | 6.000 minutos/mês | ~100 minutos/mês | Seguro |
| Edge Middleware | Ilimitado (Hobby) | 1 middleware | Seguro |
| Tamanho do deploy | 250 MB (incluindo funções) | ~150-200 MB estimado | Atenção |
| Cron Jobs | Não disponível no Hobby | Usa cron-job.org | Contornado |
| Domínio customizado | 1 gratuito | 1 em uso | Seguro |
| SSL | Automático | Sim | Seguro |

#### Análise de Consumo de Functions

O ImobSync possui ~45 rotas de API. O principal consumo vem de:

| Rota | Chamadas/Usuário/Dia | 100 Usuários/Dia | 500 Usuários/Dia |
|------|---------------------|-------------------|-------------------|
| `/api/subscription-refresh` | ~12 (a cada 5 min, 1h de uso) | 1.200 | 6.000 |
| `/api/analytics/track` | ~10-20 (ações diversas) | 1.500 | 7.500 |
| `/api/empreendimentos` | ~5 (navegação) | 500 | 2.500 |
| `/api/units` / `/api/.../units` | ~10 (visualizações de espelho) | 1.000 | 5.000 |
| Login / MFA | ~2 | 200 | 1.000 |
| Outras rotas | ~5 | 500 | 2.500 |
| **Total diário** | — | **~5.000** | **~25.000** |
| **Total mensal** | — | **~150.000** | **~750.000** |

#### Ponto de Ruptura

| Cenário | Limite Afetado | Momento |
|---------|---------------|---------|
| Invocações > 100.000/mês | Serverless Functions | ~60-70 usuários ativos diários |
| Deploy > 250 MB | Tamanho do bundle | Próximo do limite atual |
| Largura de banda > 100 GB | Tráfego | ~500+ usuários com uso intensivo |

#### Alternativas 100% Gratuitas

| Alternativa | Como Funciona | Perda de Funcionalidade? |
|------------|---------------|----------------------|
| **Cloudflare Pages** | 500 builds/mês, 100.000 requests/dia (Workers Free), ilimitado de banda | Nenhuma — exige adaptação para Cloudflare Workers |
| **Netlify** | 125.000 funções/mês, 100 GB banda, 300 min build | Nenhuma — Next.js suportado via adapter |
| **Render** | 750 horas/mês (free web service), 100 GB banda | Nenhuma — mas é container, não serverless puro |
| **Fly.io** | 3 VMs compartilhadas gratuitas (256 MB RAM cada) | Nenhuma — exige Dockerfile |
| **Railway** | $5 crédito/mês (não gratuito puro) | — |

#### Cloudflare Pages como Alternativa Principal

A Cloudflare é a alternativa gratuita mais robusta para substituir a Vercel:

| Recurso | Vercel Free | Cloudflare Free | Vantagem |
|---------|------------|----------------|----------|
| Largura de banda | 100 GB/mês | **Ilimitada** | Cloudflare |
| Serverless invocações | 100.000/mês | **100.000/dia** (Workers) | Cloudflare (30x mais) |
| Duração da função | 10s (Hobby) | 10ms (CPU) / 30s (wall) | Similar |
| Builds | 6.000 min/mês | 500 builds/mês | Vercel (para muitos deploys) |
| Edge functions | Sim | Sim (Workers) | Empate |
| SSL | Sim | Sim | Empate |
| Cron Jobs | Não (Hobby) | Sim (Workers Cron — gratuito) | Cloudflare |
| Domínios customizados | 1 | **Ilimitado** | Cloudflare |
| Tamanho do deploy | 250 MB | 25 MB (Workers bundled) | Vercel (pode limitar) |

**Problema potencial**: O limite de 25 MB por Worker do Cloudflare pode ser apertado para o ImobSync (~200 MB estimado). A solução é usar **Cloudflare Pages** (que não tem esse limite estrito) com **Pages Functions** para as APIs.

#### Veredicto

> **O plano gratuito da Vercel é suficiente para ~60 usuários ativos/dia.** Para escalar além disso sem custo, a melhor alternativa é **Cloudflare Pages + Pages Functions**, que oferece largura de banda ilimitada e 100.000 requisições **por dia** (3 milhões/mês). O deploy via `@cloudflare/next-on-pages` é relativamente direto para apps Next.js com App Router. A migração exigiria:
> 1. Adaptar o middleware (Cloudflare usa formato diferente)
> 2. Substituir `cron-job.org` por Cloudflare Workers Cron (também gratuito)
> 3. Verificar compatibilidade de bibliotecas nativas (sharp pode exigir alternativa)

---

### 4.3 Mercado Pago (Pagamentos)

#### Custo Atual

| Recurso | Custo | Observação |
|---------|-------|-----------|
| SDK / Integração | **Gratuito** | Sem custo fixo |
| Transação PIX | ~0,99% a 2,49% do valor | Varia por volume |
| Transação cartão de crédito | ~2,99% a 6,49% | Varia por parcelamento |
| Webhooks | **Gratuito** | Ilimitados |
| Conta de vendedor | **Gratuita** | Sem mensalidade |

#### É Possível Substituir por Alternativa Gratuita?

**Não existe gateway de pagamento 100% gratuito.** Todo gateway cobra taxa por transação. A questão é se existe um gateway com **menor taxa** ou **sem custo fixo mensal**.

| Gateway | Taxa PIX | Taxa Cartão | Custo Fixo/Mês | Notas |
|---------|---------|-------------|---------------|-------|
| **Mercado Pago** | 0,99%-2,49% | 2,99%-6,49% | R$ 0 | Melhor ecossistema BR, webhooks estáveis |
| **Stripe** | 3,09% + R$ 0,60 | 2,99% + R$ 0,60 | R$ 0 | Não suporta PIX nativo no BR |
| **PagSeguro** | 0,99%-1,99% | 2,99%-4,99% | R$ 0 (recebimentos) | Ecossistema similar ao MP |
| **Asaas** | 0,99% | 2,99%-5,49% | R$ 0 | API limpa, mas menos recursos |
| **Iugu** | 1,99% | 2,69%-5,49% | R$ 0 | Suporte PIX + boleto |

#### Veredicto

> **Manter Mercado Pago.** Não existe alternativa gratuita (sem taxa por transação) para pagamentos. O Mercado Pago é o gateway mais completo para o mercado brasileiro, suporta PIX, cartão e assinaturas recorrentes, e **não tem custo fixo mensal** — apenas taxa por transação, que é o modelo ideal para um SaaS em crescimento (só paga quando fatura). Substituir por outro gateway não reduziria custos de forma significativa e exigiria grande esforço de reescrita.

---

### 4.4 Resend (E-mail Transacional)

#### Plano Gratuito Atual

| Recurso | Limite Gratuito | Uso Estimado | Risco |
|---------|----------------|-------------|-------|
| E-mails/mês | 3.000 | < 50 (apenas novos dispositivos) | Seguro |
| E-mails/dia | 100 | < 10 | Seguro |
| Domínios customizados | 1 | 1 (fluxoquadra.com.br) | Seguro |

#### Uso Atual no Sistema

O Resend é usado **exclusivamente** para notificação de novo dispositivo detectado (MFA). Não é usado para:
- Reset de senha (Supabase Auth cuida disso)
- E-mails de boas-vindas
- Notificações de assinatura
- E-mails marketing

Além disso, o código já possui **degradação graciosa**: se `RESEND_API_KEY` não estiver configurada, o sistema faz `console.log` em vez de falhar.

#### Alternativas 100% Gratuitas

| Alternativa | Limite Gratuito | Perda de Funcionalidade? |
|------------|----------------|----------------------|
| **Manter Resend Free** | 3.000/mês, 100/dia | Nenhuma |
| **Supabase Auth (reset de senha)** | Incluído no Supabase Free | Apenas para reset de senha (já usa) |
| **EmailJS** | 200/mês | Insuficiente para cenários de crescimento |
| **Mailgun Free** | 1.000/mês (5 primeiros meses, depois encerra) | Não é sustentável |
| **Postmark Free Trial** | 100/mês | Insuficiente |
| **SMTP próprio (Gmail)** | 500/dia | Requer configuração de App Password, menos confiável |

#### Veredicto

> **Manter Resend Free.** Com apenas 3.000 e-mails/mês gratuitos e uso estimado de < 50/mês, há uma margem de 60x. O sistema já degrada gracefulmente se a API key for removida. Para escalar para milhares de usuários, o uso ainda seria < 500/mês (um e-mail por login em dispositivo novo), bem dentro do limite.

---

### 4.5 cron-job.org (Agendador de Tarefas)

#### Plano Gratuito Atual

| Recurso | Limite Gratuito | Uso | Risco |
|---------|----------------|-----|-------|
| Jobs | 10 | 2 (reconcile-mp, expire-subscriptions) | Seguro |
| Execuções/mês | Ilimitado (Free tier) | ~60/mês (2 jobs x 30 dias) | Seguro |
| Intervalo mínimo | 1 minuto | 1 vez/dia cada | Seguro |

#### Uso no Sistema

1. `/api/cron/reconcile-mp` — Sincroniza assinaturas locais com o Mercado Pago (diário)
2. `/api/cron/expire-subscriptions` — Expira assinaturas vencidas (diário)

Ambos são protegidos por `CRON_SECRET` (header `Authorization: Bearer <secret>` ou query param `?secret=<secret>`).

#### Alternativas 100% Gratuitas

| Alternativa | Limite Gratuito | Perda de Funcionalidade? |
|------------|----------------|----------------------|
| **Manter cron-job.org Free** | 10 jobs, execuções ilimitadas | Nenhuma |
| **Cloudflare Workers Cron Triggers** | Ilimitado (com Workers Free) | Nenhuma — e é mais seguro (não depende de serviço externo) |
| **GitHub Actions Scheduled** | 2.000 min/mês (free) | Nenhuma — mas com latência maior |
| **EasyCron Free** | 1 job, cada 5 min | Insuficiente (precisa de 2 jobs) |

#### Veredicto

> **Manter cron-job.org Free.** Funciona perfeitamente, é gratuito, e exige zero manutenção. Se migrar para Cloudflare Pages, pode mover os crons para Cloudflare Workers Cron (também gratuito) para eliminar a dependência externa.

---

### 4.6 Bacen SGS API e brasilindicadores.com.br

#### Custo

Ambos são **100% gratuitos e públicos**:

| Serviço | Tipo | Custo | Limite de Requisições |
|---------|------|-------|---------------------|
| Bacen SGS (api.bcb.gov.br) | API REST pública federal | **Gratuito** | Não documentado, mas não há bloqueio conhecido |
| brasilindicadores.com.br | Website público (scraping) | **Gratuito** | Não documentado |

#### Uso no Sistema

O endpoint `/api/incc` possui cache de **6 horas** em memória e um **fallback com valores hardcoded** verificados manualmente. Isso significa:
- Em condições normais: 4 requisições/dia para cada fonte (a cada 6h)
- Em caso de falha: valores estáticos são usados

#### Veredicto

> **Sem custo.** O sistema já possui cache agressivo (6h) e fallback triplo (brasilindicadores -> Bacen -> hardcoded). Não há nenhum custo associado e não há risco de atingir limites de taxa.

---

### 4.7 Dependências Client-Side (Sem Custo de Serviço)

Estas bibliotecas rodam inteiramente no navegador do usuário, sem custo de infraestrutura:

| Biblioteca | Uso | Custo de Serviço |
|-----------|-----|-----------------|
| `otplib` | Geração/verificação TOTP | Zero (cálculo local) |
| `qrcode` | Geração de QR code | Zero (renderização local) |
| `@simplewebauthn/server` | WebAuthn/Passkeys | Zero (criptografia local) |
| `jspdf` + `jspdf-autotable` | Geração de PDF | Zero (client-side) |
| `xlsx` | Parsing de Excel | Zero (client/server, sem API) |
| `recharts` | Gráficos de métricas | Zero (client-side) |
| `framer-motion` | Animações de UI | Zero (client-side) |
| `@dnd-kit` | Drag-and-drop | Zero (client-side) |

---

## 5. Matriz de Risco de Escalabilidade

### 5.1 Cenários de Crescimento

| Cenário | Usuários Ativos/Dia | Supabase | Vercel | Mercado Pago | Resend | Cron |
|---------|---------------------|---------|--------|---------------|--------|------|
| **Atual** | 5-10 | Seguro (< 1% dos limites) | Seguro (< 10%) | Taxa por uso | Seguro (< 2%) | Seguro (20%) |
| **Crescimento moderado** | 50 | Seguro (< 5%) | Atenção (~50%) | Taxa por uso | Seguro (< 5%) | Seguro (20%) |
| **Consolidação** | 100 | Seguro (< 10%) | Limite atingido (>100%) | Taxa por uso | Seguro (< 10%) | Seguro (20%) |
| **Expansão** | 500 | Atenção (~50% DB) | Muito acima do limite | Taxa por uso | Seguro (< 50%) | Seguro (20%) |
| **Grande escala** | 1.000+ | Limite atingido (MAU: 30k) | Muito acima do limite | Taxa por uso | Atenção (~100%) | Seguro (20%) |

### 5.2 Gargalos Identificados (Ordem de Prioridade)

#### Gargalo #1: Vercel Serverless Function Invocações

- **Limite**: 100.000 invocações/mês (Hobby)
- **Estimativa atual**: ~5.000 invocações/dia por 100 usuários -> 150.000/mês
- **Afeta**: A partir de ~60 usuários ativos/dia
- **Impacto**: O sistema **para de funcionar** quando o limite é atingido (não é cobrado, é bloqueado)

**Soluções gratuitas**:
1. **Migrar para Cloudflare Pages** (100.000 requests/dia = 3 milhões/mês)
2. **Otimizar invocações**: O `SubscriptionRefresher` chama `/api/subscription-refresh` a cada 5 minutos — isso gera 12 chamadas/hora por usuário. Reduzir para 15 minutos cortaria 60% desse consumo
3. **Batching de analytics**: Em vez de trackear cada evento individualmente, agrupar eventos e enviar em batch
4. **Cache de rotas de leitura**: `/api/empreendimentos` e `/api/units` podem usar `next/revalidate` para servir do cache

#### Gargalo #2: Supabase Database Size (500 MB)

- **Limite**: 500 MB (Free)
- **Estimativa**: ~20-50 MB para 50 usuários + 10 empreendimentos
- **Crescimento**: Principalmente por `analytics_events` e `unit_status_history` (crescem ilimitadamente)
- **Afeta**: Centenas de empreendimentos com histórico extenso

**Soluções gratuitas**:
1. **Limpeza periódica**: O sistema já tem `/api/admin-sistema/analytics/cleanup` — basta agendar via cron
2. **Retention policy**: Manter apenas 90 dias de analytics e 1 ano de histórico de status
3. **Compressão de dados**: Remover metadados desnecessários de analytics_events
4. **Partitioning**: Supabase Free não suporta, mas a limpeza regular resolve

#### Gargalo #3: Rate Limiting In-Memory (Escalabilidade Horizontal)

- **Problema**: O rate limiting usa `Map` em memória — em serverless com múltiplas instâncias, cada instância tem seu próprio mapa
- **Impacto**: Um atacante distribuído pode bypassar o rate limit
- **Gravidade**: Média (o Supabase Auth tem seu próprio rate limiting)

**Soluções gratuitas**:
1. **Supabase como rate limiter**: Usar uma tabela com contadores e TTL (já tem o banco)
2. **Cloudflare Turnstile**: CAPTCHA invisível gratuito (ilimitado) para endpoints públicos de login
3. **Manter como está**: O Supabase Auth já tem proteção embutida; o rate limit local é uma camada extra

---

## 6. Estratégia de Migração para 100% Gratuito

### 6.1 Arquitetura Proposta (100% Gratuito, Sem Perda de Funcionalidade)

```
+--------------------------------------------------------------+
|                    ARQUITETURA GRATUITA                       |
+--------------------------------------------------------------+
|                                                               |
|  +------------------+    +------------------------------+   |
|  |  Cloudflare       |    |  Supabase Free               |   |
|  |  Pages + Workers  |<-->|  +-- PostgreSQL (500 MB)      |   |
|  |                   |    |  +-- Auth (50k MAU)           |   |
|  |  +-- Next.js      |    |  +-- Storage (1 GB)          |   |
|  |  +-- Pages Funcs  |    |  +-- Realtime (200 conn)     |   |
|  |  +-- Workers Cron |    |                               |   |
|  |  +-- Turnstile    |    |                               |   |
|  |     (CAPTCHA)     |    |                               |   |
|  +--------+---------+    +------------------------------+   |
|           |                                                    |
|           v                                                    |
|  +------------------+    +------------------------------+   |
|  |  Mercado Pago    |    |  Resend Free                  |   |
|  |  (taxa/trans.)   |    |  (3.000 emails/mês)           |   |
|  |                   |    |                               |   |
|  |  - PIX            |    |  Notificação de novo          |   |
|  |  - Cartão         |    |  dispositivo (MFA)            |   |
|  |  - Assinaturas    |    |                               |   |
|  +------------------+    +------------------------------+   |
|                                                               |
|  +------------------+    +------------------------------+   |
|  |  Bacen SGS        |    |  brasilindicadores.com.br    |   |
|  |  (API pública)    |    |  (scraping público)          |   |
|  |                   |    |                               |   |
|  |  INCC-DI fallback |    |  INCC-M (fonte principal)    |   |
|  +------------------+    +------------------------------+   |
|                                                               |
+--------------------------------------------------------------+

CUSTO MENSAL: R$ 0,00 (zero)
ÚNICO CUSTO: Taxa por transação do Mercado Pago (~1-6%)
```

### 6.2 Plano de Migração (Vercel -> Cloudflare)

Esta é a **única migração necessária** para atingir 100% gratuito com escala. Todos os outros serviços já operam em planos gratuitos suficientes.

#### Fase 1 — Preparação (Sem Mudança de Infraestrutura)

| Ação | Esforço | Impacto no Consumo |
|------|--------|-------------------|
| Reduzir `SubscriptionRefresher` de 5 min para 15 min | Baixo (1 linha) | -60% invocações de refresh |
| Implementar batching de analytics (enviar array em vez de 1 por evento) | Médio | -70% invocações de track |
| Adicionar `revalidate` nas páginas de leitura (empreendimentos, planos públicos) | Baixo | -90% invocações de leitura repetida |
| Adicionar Turnstile CAPTCHA no login | Baixo | Proteção anti-abuso gratuita |

**Resultado estimado**: Redução de ~70% nas invocações de functions, estendendo o limite da Vercel de 60 para ~200 usuários ativos/dia.

#### Fase 2 — Migração para Cloudflare (Quando Necessário)

| Etapa | Descrição | Esforço |
|-------|-----------|--------|
| 1. Instalar `@cloudflare/next-on-pages` | Adapter oficial para Next.js no Cloudflare | Baixo |
| 2. Adaptar middleware | Cloudflare usa formato `middleware.ts` com `env` diferente | Médio |
| 3. Substituir `sharp` | Cloudflare Workers não suporta Node.js `sharp` nativo | Baixo (usar `@cloudflare/image` ou remover resizing on-the-fly) |
| 4. Migrar crons | Substituir `cron-job.org` por Cloudflare Workers Cron Triggers | Baixo |
| 5. Testar todas as rotas | Verificar compatibilidade de APIs do Node.js | Médio |
| 6. Configurar domínio | DNS do Cloudflare apontando para Pages | Baixo |

**Esforço total estimado**: 2-3 dias de desenvolvimento.

#### Fase 3 — Otimização de Banco de Dados

| Ação | Esforço | Impacto |
|------|--------|--------|
| Agendar `/api/admin-sistema/analytics/cleanup` diariamente | Baixo (adicionar ao cron) | Impede crescimento infinito do DB |
| Implementar retention: 90 dias analytics, 1 ano histórico status | Baixo (SQL) | Mantém DB < 200 MB indefinidamente |
| Remover `webhook_events` antigos (> 30 dias) | Baixo (SQL) | Reduz dados mortos |

---

## 7. Análise de Segurança no Stack Gratuito

### 7.1 Comparação de Segurança: Gratuito vs. Pago

| Aspecto de Segurança | Stack Gratuito | Stack Pago | Veredito |
|---------------------|---------------|-------------|----------|
| **TLS/HTTPS** | Vercel/Cloudflare fornecem SSL automático | Mesmo | Igual |
| **Autenticação (JWT)** | Supabase Auth com RLS (mesmo em Free) | Mesmo | Igual |
| **Row Level Security** | PostgreSQL RLS completo no Free | Mesmo | Igual |
| **MFA (TOTP + WebAuthn)** | Cálculo local + armazenamento no banco | Mesmo | Igual |
| **Rate Limiting** | In-memory (parcial em serverless) | Redis global (mais robusto) | Free é menos robusto em multi-instância |
| **Proteção contra bots** | Cloudflare Turnstile (gratuito, ilimitado) | Cloudflare Enterprise | Turnstile Free é excelente |
| **Cookie Security** | HttpOnly, Secure, SameSite (independente de plano) | Mesmo | Igual |
| **Webhook Verification** | HMAC-SHA256 com timing-safe compare (independente) | Mesmo | Igual |
| **CAPTCHA** | Cloudflare Turnstile (gratuito) | reCAPTCHA Enterprise (pago) | Turnstile é superior na prática |
| **DDoS Protection** | Cloudflare Free DDoS protection | Cloudflare Pro/Enterprise | Free é bom, mas Pro é melhor |
| **WAF (Web Application Firewall)** | Cloudflare Free WAF básico | Cloudflare Managed Rulesets | Free é mais limitado |
| **SCIM / SSO** | Não disponível no Supabase Free | Disponível no Pro | Não disponível |
| **Audit Logs** | Implementação própria (analytics_events + user_login_events) | Supabase Audit Logs nativos | Própria funciona, mas nativo é mais completo |
| **IP Allowlisting** | Não disponível no Supabase Free | Disponível no Pro | Requer implementação própria |

### 7.2 Pontos de Segurança que NÃO São Afetados pelo Plano

1. **Criptografia de dados em trânsito** — TLS 1.3 fornecido pelo hosting (Vercel ou Cloudflare)
2. **Criptografia de senhas** — Supabase Auth usa bcrypt (mesmo no Free)
3. **Row Level Security** — Todas as 15+ políticas RLS funcionam no Free
4. **WebAuthn/Passkeys** — Criptografia assimétrica processada localmente, sem dependência de plano
5. **TOTP** — Cálculo e verificação totalmente locais (otplib)
6. **Verificação de webhook do Mercado Pago** — HMAC-SHA256 com timing-safe compare (padrão de segurança independente)
7. **Proteção de cookies** — HttpOnly, Secure, SameSite são flags HTTP, não dependem de plano
8. **SQL Injection** — Prevenido pelo Supabase JS client (parameterized queries) em todos os níveis

### 7.3 Recomendações de Segurança para Stack Gratuito

| Recomendação | Implementação | Esforço |
|-------------|---------------|--------|
| **Cloudflare Turnstile no login** | Adicionar widget invisível no formulário de login | Baixo (1-2h) |
| **Rate limiting via banco** | Tabela `rate_limits` com TTL no Supabase | Médio (3-4h) |
| **Alerta de login suspeito** | Detectar IP de datacenter/VPN e notificar | Médio (2-3h) |
| **Rotação de secrets** | Rotacionar CRON_SECRET e MERCADOPAGO_WEBHOOK_SECRET periodicamente | Baixo (manual) |
| **Content Security Policy** | Header CSP no middleware/next.config | Baixo (30 min) |

---

## 8. Tabela Resumo — Custo Zero vs. Atual

### 8.1 Custo Mensal por Serviço

| Serviço | Custo Atual | Custo com Stack 100% Gratuito | Economia |
|---------|------------|-------------------------------|----------|
| **Supabase** | R$ 0 (Free) | R$ 0 (Free) | R$ 0 |
| **Vercel** | R$ 0 (Free) ou R$ 120/mês (Pro) | R$ 0 (Cloudflare Free) | R$ 0-120/mês |
| **Mercado Pago** | R$ 0 fixo + % por transação | R$ 0 fixo + % por transação | R$ 0 |
| **Resend** | R$ 0 (Free) | R$ 0 (Free) | R$ 0 |
| **cron-job.org** | R$ 0 (Free) | R$ 0 (Cloudflare Cron ou mantido) | R$ 0 |
| **Bacen / brasilindicadores** | R$ 0 | R$ 0 | R$ 0 |
| **Custo fixo mensal TOTAL** | **R$ 0 — R$ 120/mês** | **R$ 0,00** | **R$ 0-120/mês** |

### 8.2 Funcionalidades Preservadas

| Funcionalidade | Stack Atual | Stack Gratuito | Status |
|---------------|------------|----------------|--------|
| Login com e-mail/senha | Sim | Sim | Mantida |
| MFA TOTP (Google Authenticator) | Sim | Sim | Mantida |
| MFA WebAuthn/Passkeys | Sim | Sim | Mantida |
| Detecção de novo dispositivo | Sim | Sim | Mantida |
| Controle de acesso por role | Sim | Sim | Mantida |
| Espelho de vendas interativo | Sim | Sim | Mantida |
| Realtime (atualização instantânea) | Sim | Sim | Mantida (até 200 conexões) |
| Upload de Excel (unidades) | Sim | Sim | Mantida |
| Upload de imagem de empreendimento | Sim | Sim | Mantida |
| Simulador de pagamentos | Sim | Sim | Mantida |
| Correção INCC | Sim | Sim | Mantida |
| Exportação PDF | Sim | Sim | Mantida |
| Assinatura via PIX | Sim | Sim | Mantida |
| Assinatura via cartão | Sim | Sim | Mantida |
| Cupons de desconto | Sim | Sim | Mantida |
| Webhooks de pagamento | Sim | Sim | Mantida |
| Reconciliação diária | Sim | Sim | Mantida |
| Expiração automática | Sim | Sim | Mantida |
| Painel admin completo | Sim | Sim | Mantida |
| Analytics de uso | Sim | Sim | Mantida |
| Métricas com gráficos | Sim | Sim | Mantida |
| E-mail de novo dispositivo | Sim | Sim | Mantida |
| Middleware de segurança | Sim | Sim | Mantida |
| Rate limiting | Sim (in-memory) | Sim (melhorado com Turnstile) | **Melhorada** |
| CAPTCHA anti-bot | Não | Sim (Cloudflare Turnstile) | **Ganhou** |
| DDoS protection | Básico | Sim (Cloudflare Free) | **Melhorada** |

> **Conclusão**: Todas as funcionalidades são mantidas. Duas são **melhoradas** na stack gratuita.

### 8.3 Limites do Stack Gratuito por Número de Usuários

| Nº de Usuários Ativos/Dia | Stack Funciona 100%? | Ação Necessária |
|---------------------------|----------------------|-----------------|
| **1 — 60** | Sim (Vercel Free) | Nenhuma |
| **60 — 200** | Com otimizações (Fase 1) | Reduzir frequência de refresh, batching, cache |
| **200 — 3.000** | Sim (Cloudflare Free) | Migrar para Cloudflare Pages (Fase 2) |
| **3.000 — 10.000** | Com ressalvas | Supabase DB pode precisar de limpeza agressiva |
| **10.000+** | Precisa de plano pago | Supabase Pro ($25/mês) por MAU ou DB size |

---

## 9. Conclusões e Recomendações

### 9.1 Resposta à Pergunta Central

> **É possível operar o ImobSync 100% com serviços gratuitos?**

**Sim, com ressalvas quantitativas.** O sistema pode operar com custo fixo mensal de **exatamente R$ 0,00** mantendo **todas as funcionalidades atuais**, incluindo segurança (MFA, RLS, cookies seguros, verificação de webhook). O único custo variável é a taxa do Mercado Pago por transação, que é inevitável em qualquer gateway de pagamento e não constitui um custo fixo.

### 9.2 Número Máximo de Usuários sem Custo

| Plano de Infraestrutura | Usuários Ativos/Dia | Custo Mensal Fixo |
|------------------------|---------------------|-------------------|
| Vercel Free (atual, otimizado) | ~200 | R$ 0,00 |
| Cloudflare Free (após migração) | ~3.000 | R$ 0,00 |
| Cloudflare Free + Supabase Pro | ~10.000+ | R$ ~130/mês (Supabase Pro) |

### 9.3 Ações Imediatas Recomendadas (Sem Mudança de Infraestrutura)

1. **Reduzir intervalo do SubscriptionRefresher** de 5 min para 15 min -> economia de ~60% em invocações de API
2. **Adicionar Cloudflare Turnstile** no login -> proteção anti-bot gratuita e ilimitada
3. **Agendar limpeza de analytics** via cron-job.org -> manter DB enxuto
4. **Implementar retention policy** no banco (90 dias analytics, 1 ano histórico)

### 9.4 Ações de Médio Prazo (Quando Atingir ~60 Usuários/Dia)

1. **Migrar para Cloudflare Pages** -> elimina o gargalo de invocações da Vercel
2. **Mover crons para Cloudflare Workers Cron** -> elimina dependência do cron-job.org
3. **Implementar rate limiting via banco** -> mais robusto em multi-instância

### 9.5 O que NÃO Deve Ser Feito

1. **Não substitua o Mercado Pago** — não existe gateway gratuito; o MP é o melhor para o mercado BR
2. **Não migre do Supabase** — o Free tier é generoso e a migração seria massiva (Auth + Storage + RLS)
3. **Não remova funcionalidades** para caber em limites gratuitos — otimize em vez de cortar
4. **Não pule a fase de otimização** — a Fase 1 pode adiar a necessidade de migração por meses

---

*Documento gerado com base na análise completa do código-fonte do ImobSync (372 commits, ~45 rotas de API, ~20+ tabelas de banco de dados). Todos os dados de limites foram verificados nas documentações oficiais dos respectivos serviços em agosto de 2026.*