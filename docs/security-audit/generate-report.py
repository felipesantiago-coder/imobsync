#!/usr/bin/env python3
"""Gerador do Relatorio de Auditoria de Seguranca - ImobSync"""
import os, sys, hashlib
from datetime import datetime

FONT_DIR = '/usr/share/fonts'
OUT = os.path.dirname(os.path.abspath(__file__))
BODY_PDF = os.path.join(OUT, '_body.pdf')
OUT_PDF = os.path.join(OUT, 'relatorio-auditoria-seguranca.pdf')
CHART_DONUT = os.path.join(OUT, '_chart_donut.png')
CHART_BAR = os.path.join(OUT, '_chart_bar.png')
COVER_HTML = os.path.join(OUT, '_cover.html')
COVER_PDF = os.path.join(OUT, '_cover.pdf')

# ── Charts ──
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
fm.fontManager.addfont(f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf')
plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(figsize=(4.5, 3.5), constrained_layout=True)
labels = ['Critica (4)', 'Alta (5)', 'Media (7)', 'Baixa (6)', 'Informativa (2)']
sizes = [4, 5, 7, 6, 2]
cols = ['#B91C1C', '#EA580C', '#D97706', '#2563EB', '#059669']
w, t, a = ax.pie(sizes, labels=None, colors=cols, autopct='%1.0f%%', startangle=90,
               pctdistance=0.78, wedgeprops=dict(width=0.4, edgecolor='white', linewidth=2))
for x in a:
    x.set_fontsize(8); x.set_fontweight('bold'); x.set_color('white')
ax.legend(w, labels, loc='center left', bbox_to_anchor=(0.92, 0.5), fontsize=7, frameon=False)
ax.set_title('Distribuicao por Severidade', fontsize=10, fontweight='bold', pad=8)
fig.savefig(CHART_DONUT, dpi=200, bbox_inches='tight', facecolor='white')
plt.close(fig)

fig, ax = plt.subplots(figsize=(4.5, 3), constrained_layout=True)
cats = ['Banco sem tranca (RLS)', 'Permissao no navegador', 'IDOR', 'Chaves expostas', 'XSS']
vals = [10, 5, 0, 5, 3]
bcols = ['#4f4836', '#77715d', '#9a833e', '#87702b', '#63a8c0']
bars = ax.barh(cats, vals, color=bcols, edgecolor='white', height=0.55)
for b, v in zip(bars, vals):
    ax.text(b.get_width() + 0.15, b.get_y() + b.get_height() / 2, str(v),
            va='center', fontsize=8, fontweight='bold', color='#191816')
ax.set_xlim(0, max(vals) + 2)
ax.set_title('Achados por Categoria', fontsize=10, fontweight='bold', pad=8)
ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
ax.tick_params(axis='y', labelsize=7); ax.invert_yaxis()
fig.savefig(CHART_BAR, dpi=200, bbox_inches='tight', facecolor='white')
plt.close(fig)
print('[charts] OK')

# ── ReportLab ──
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                               TableStyle, PageBreak, Image, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader, PdfWriter

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold', italic='FreeSerif-Italic')

HF = colors.HexColor('#4f4836')
BD = colors.HexColor('#dad5c6')
TS = colors.HexColor('#f4f3f2')
ACC = colors.HexColor('#87702b')
TP = colors.HexColor('#191816')
TM = colors.HexColor('#78766f')
SEV = {'CRITICA': colors.HexColor('#B91C1C'), 'ALTA': colors.HexColor('#EA580C'),
       'MEDIA': colors.HexColor('#D97706'), 'BAIXA': colors.HexColor('#2563EB'),
       'INFORMATIVA': colors.HexColor('#059669')}

W, H = A4
M = 2 * cm
AW = W - 2 * M

sH1 = ParagraphStyle('H1', fontName='FreeSerif-Bold', fontSize=15, leading=20, textColor=HF, spaceAfter=6, spaceBefore=14)
sH2 = ParagraphStyle('H2', fontName='FreeSerif-Bold', fontSize=12, leading=16, textColor=ACC, spaceAfter=4, spaceBefore=10)
sB = ParagraphStyle('B', fontName='FreeSerif', fontSize=9.5, leading=14, textColor=TP, alignment=TA_JUSTIFY, spaceAfter=5)
sBL = ParagraphStyle('BL', fontName='FreeSerif', fontSize=9.5, leading=14, textColor=TP, spaceAfter=4)
sTH = ParagraphStyle('TH', fontName='FreeSerif-Bold', fontSize=7.5, textColor=colors.white)
sTD = ParagraphStyle('TD', fontName='FreeSerif', fontSize=7.5, leading=10)
sTD2 = ParagraphStyle('TD2', fontName='DejaVuSans', fontSize=7, leading=9)
sT0 = ParagraphStyle('T0', fontName='FreeSerif-Bold', fontSize=11, leading=18, leftIndent=0)
sT1 = ParagraphStyle('T1', fontName='FreeSerif', fontSize=9.5, leading=16, leftIndent=18)


class TocDoc(SimpleDocTemplate):
    def afterFlowable(self, f):
        if hasattr(f, 'bookmark_name'):
            self.notify('TOCEntry', (getattr(f, 'bookmark_level', 0),
                              getattr(f, 'bookmark_text', ''), self.page,
                              getattr(f, 'bookmark_key', '')))


def H(text, style, lvl=0):
    k = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{k}"/>{text}', style)
    p.bookmark_name = k
    p.bookmark_level = lvl
    p.bookmark_text = text
    p.bookmark_key = k
    return p


def badge(sev):
    c = SEV.get(sev.upper(), TM)
    return f'<font color="#ffffff" backColor="{c.hexval()}" size="7">&nbsp;{sev.upper()}&nbsp;</font>'


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TM)
    canvas.drawString(M, 1.1 * cm, 'Relatorio de Auditoria de Seguranca - ImobSync')
    canvas.drawRightString(W - M, 1.1 * cm, f'Pagina {doc.page}')
    canvas.restoreState()


doc = TocDoc(BODY_PDF, pagesize=A4, leftMargin=M, rightMargin=M,
              topMargin=M, bottomMargin=2 * cm)
story = []

# ── TOC ──
toc = TableOfContents()
toc.levelStyles = [sT0, sT1]
story.append(Paragraph('<b>Sumario</b>', ParagraphStyle(
    'TT', fontName='FreeSerif-Bold', fontSize=17, leading=22, textColor=HF, spaceAfter=10)))
story.append(toc)
story.append(PageBreak())

# ── 1. Resumo Executivo ──
story.append(H('1. Resumo Executivo', sH1, 0))
story.append(Paragraph(
    'Esta auditoria avaliou a seguranca da aplicacao ImobSync, uma plataforma de gestao imobiliaria '
    'construida com Next.js 16, Supabase (PostgreSQL com RLS) e integracao com Mercado Pago para '
    'pagamentos recorrentes. O escopo abrangeu cinco categorias de vulnerabilidade: isolamento '
    'de banco de dados (RLS), verificacao de permissoes no backend, IDOR, exposicao de chaves '
    'e tratamento de entradas (XSS). Foram analisadas sistematicamente todas as 62 rotas de API, '
    '4 arquivos de schema SQL, 3 arquivos de guardas de autenticacao e todo o codigo-fonte do '
    'frontend relacionado a renderizacao de dados de usuarios. O mapeamento de cada categoria '
    'para a stack do projeto foi: RLS do Supabase para isolamento de dados, requireAdminSistema() '
    'e requireWriteAccess() para permissoes, filtros por user.id para IDOR, process.env sem '
    'hardcodes para chaves, e React JSX auto-escape para XSS.', sB))
story.append(Spacer(1*cm, 6))

# KPI table
kh = [Paragraph(f'<b>{t}</b>', sTH) for t in
      ['Total', 'Criticos', 'Altos', 'Medios', 'Baixos', 'Informativos']]
kv = ['24', '4', '5', '7', '6', '2']
kvc = [TP, colors.HexColor('#B91C1C'), colors.HexColor('#EA580C'),
       colors.HexColor('#D97706'), colors.HexColor('#2563EB'), colors.HexColor('#059669')]
kr = [kh, [Paragraph(f'<b><font color="{c.hexval()}">{v}</font></b>',
              ParagraphStyle('kv', fontName='FreeSerif-Bold', fontSize=13, alignment=TA_CENTER))
        for v, c in zip(kv, kvc)]]
kt = Table(kr, colWidths=[AW / 6] * 6)
kt.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HF),
    ('GRID', (0, 0), (-1, -1), 0.5, BD),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
story.append(kt)
story.append(Spacer(1*cm, 10))

# Charts
id_ = Image(CHART_DONUT, width=AW * 0.46, height=AW * 0.36)
ib = Image(CHART_BAR, width=AW * 0.46, height=AW * 0.31)
ct = Table([[id_, ib]], colWidths=[AW * 0.5] * 2)
ct.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                       ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
story.append(ct)
story.append(Spacer(1*cm, 10))

story.append(Paragraph(
    'A analise revelou <b>4 vulnerabilidades criticas</b> que exigem acao imediata: tres endpoints '
    'de debug/configuracao sem autenticacao que permitem manipulacao direta de planos de pagamento '
    'no Mercado Pago e leitura de dados sensiveis com a service_role key, alem de RLS desabilitado '
    'em tabelas de analytics que expoe dados de usuarios via API REST do Supabase. Tambem foram '
    'identificados 5 achados de severidade alta, 7 medios e 6 baixos. A aplicacao demonstrou '
    'fortalezas significativas em varias areas, especialmente a ausencia total de vulnerabilidades '
    'IDOR e a verificacao HMAC correta no webhook de pagamento. A categoria IDOR retornou zero '
    'achados, o que indica um modelo de autorizacao bem implementado nas operacoes CRUD.', sB))

# ── 2. Pontos Fortes e Fracos ──
story.append(H('2. Pontos Fortes e Pontos Fracos', sH1, 0))
story.append(H('2.1 Pontos Fortes', sH2, 1))
for t, d in [
    ('Zero IDOR', 'Todas as 62 rotas de API foram auditadas sistematicamente. Nenhuma vulnerabilidade '
     'IDOR encontrada. Todas as rotas que acessam objetos por ID verificam posse via user.id '
     'da sessao ou requerem a funcao requireAdminSistema(). Este e um ponto forte significativo.'),
    ('HMAC no Webhook', 'O endpoint /api/webhooks/mercadopago verifica a assinatura x-signature via HMAC-SHA256 '
     'antes de processar qualquer notificacao de pagamento, impedindo notificacoes forjadas.'),
    ('Protecao CAS em Assinaturas', 'As rotas de cancelamento de assinatura usam Compare-And-Swap com a clausula '
     '.eq("status", "active") para prevenir condicoes de corrida durante cancelamentos simultaneos.'),
    ('Validacao de Admin Consistente', 'Todas as 20+ rotas sob /api/admin-sistema/ validam requireAdminSistema() antes de '
     'qualquer operacao, exceto os 3 endpoints de debug identificados nesta auditoria.'),
    ('Expiracao Preguicosa de Assinaturas', 'O subscription-guard.ts expira automaticamente assinaturas vencidas mesmo que o '
     'cron falhe, garantindo que acessos expirados sejam bloqueados na proxima verificacao.'),
    ('Sem XSS no Frontend React', 'Nenhum uso de dangerouslySetInnerHTML com dados de usuarios. O unico uso '
     'esta em chart.tsx com dados estaticos. Todos os dados de usuarios sao renderizados via '
     'JSX que auto-escapa, e nenhum eval/new Function/innerHTML foi encontrado.'),
    ('Analytics Nao Vaza Erros', 'O endpoint de tracking sempre retorna {ok:true} sem vazar detalhes de erros, '
     'evitando informacao discriminante.'),
]:
    story.append(Paragraph(f'<b>{t}:</b> {d}', sBL))

story.append(H('2.2 Pontos Fracos Centrais', sH2, 1))
story.append(Paragraph(
    '<b>Risco 1 - Endpoints de debug expostos:</b> Tres endpoints acessiveis sem autenticacao '
    'permitem ler dados sensiveis (planos, precos) e modificar planos de pagamento no Mercado Pago. '
    'O pior caso (/api/debug/mp-test) usa a service_role key para alterar URLs de callback, podendo '
    'redirecionar pagamentos de todos os clientes para uma URL controlada pelo atacante. A correcao '
    'e trivial: adicionar requireAdminSistema() ou excluir os endpoints que ja estavam marcados '
    'para remocao com comentarios "REMOVER apos confirmar que tudo funciona".', sBL))
story.append(Paragraph(
    '<b>Risco 2 - RLS com buracos criticos:</b> A tabela units possui uma politica UPDATE cujo '
    'nome diz "Apenas admin pode editar" mas cuja implementacao concede permissao a qualquer '
    'usuario autenticado (auth.role() = authenticated). Alem disso, 13 tabelas criadas via '
    'dashboard do Supabase nao possuem schema versionado, tornando suas politicas RLS inauditaveis '
    'no codigo. A combinacao da anon key publica (exposta no bundle JS) com RLS ausente ou '
    'desabilitado cria um vetor de acesso direto ao banco que bypassa toda a logica de aplicacao.', sBL))
story.append(Paragraph(
    '<b>Risco 3 - Limitacoes inerentes ao serverless:</b> O armazenamento de desafios WebAuthn em '
    'memoria (Map) e o rate limiting por instancia sao ineficazes no Vercel serverless, onde cada '
    'cold start cria uma nova instancia. A funcao coordenador-access.ts adota design fail-open: '
    'se a tabela de mapeamento nao existir, acesso total e concedido por default, quando deveria '
    'falhar fechado para proteger os dados.', sBL))

# ── 3. Tabela de Achados ──
story.append(H('3. Tabela de Achados Detalhada', sH1, 0))
story.append(Paragraph(
    'A tabela abaixo lista todos os 24 achados identificados, organizados por categoria. '
    'Achados marcados como Informativa nao constituem vulnerabilidades exploraveis mas '
    'representam observacoes relevantes para auditorias futuras. A coluna Arquivo:Linha '
    'indica a localizacao exata no codigo-fonte. Para cada achado, a descricao inclui o '
    'contexto de explorabilidade e o impacto potencial.', sB))
story.append(Spacer(1*cm, 6))

FINDINGS = [
    ('CAT 1 - Banco sem Tranca (RLS)', [
        ('CRITICA', 'supabase/fix-analytics-and-monitoring.sql:22-23',
         'RLS desabilitado em analytics_events e unit_status_history. Com a anon key publica exposta no bundle, qualquer pessoa pode ler todos os eventos de usuarios (IPs, acoes, padroes de navegacao) e inserir dados falsos via API REST do Supabase, distorcendo metricas.'),
        ('CRITICA', 'src/app/api/debug/mp-test/route.ts:13',
         'GET /api/debug/mp-test sem autenticacao. Usa createAdminClient() (service_role) para ler todos os planos ativos e modificar o back_url no Mercado Pago, permitindo a um atacante redirecionar callbacks de pagamento.'),
        ('ALTA', 'supabase/schema.sql:41-44',
         'Politica UPDATE de units com clausula USING auth.role() = authenticated permite que QUALQUER usuario logado modifique unidades via Supabase REST API. O nome da politica diz "Apenas admin" mas a logica nao verifica admin.'),
        ('ALTA', 'supabase/schema-admin.sql:143-148',
         'Politica projeto_units_coordenador nao verifica isolamento por empreendimento. Coordenador do Empreendimento A pode modificar unidades de B diretamente via REST API do Supabase, bypassando a logica de coordinator-access.ts.'),
        ('ALTA', 'supabase/schema-admin.sql:49-60',
         'profiles sem politica UPDATE para usuarios comuns. O fluxo first-login/change-password usa createClient() (anon) e o UPDATE falha silenciosamente. Flags must_change_password e must_setup_mfa nunca sao limpos para nao-admins.'),
        ('ALTA', 'src/lib/subscription-guard.ts:68',
         'Coordenadores bypassam TODAS as validacoes de assinatura (tratados como admin). Se coordenadores deveriam requerer assinatura ativa, isto e um bypass de logica de negocio que permite acesso gratuito.'),
        ('MEDIA', '13 tabelas sem schema SQL versionado',
         'assinaturas, pagamentos, user_totp, user_passkeys, planos, cupons e 7 outras tabelas criadas via dashboard. RLS pode estar habilitado sem politicas, ou desabilitado. Nenhuma politica e auditavel no codigo-fonte.'),
        ('MEDIA', 'src/lib/coordinator-access.ts:24-27',
         'Design fail-open: se a tabela coordenador_empreendimentos nao existir (erro 42P01), a funcao retorna null que e interpretado como acesso concedido. Seguranca deveria falhar fechado (deny-all).'),
        ('MEDIA', 'src/app/api/villa-bianco-units/route.ts:13',
         'Tabelas legadas (villa_bianco_units, vitta_units, moment_units) sem schema SQL. RLS e desconhecido. Se desabilitado, a anon key permite leitura e escrita irrestrita.'),
        ('MEDIA', 'src/app/api/subscriptions/cancel/route.ts:16',
         'Rota de cancelamento usa anon client para UPDATE em assinaturas. Se RLS estiver desabilitado, a anon key permite cancelar qualquer assinatura via REST API, bypassando o filtro user.id.'),
        ('BAIXA', 'src/app/api/download/route.ts:10-19',
         'Parse manual do cookie de autenticacao em vez de usar createClient(). Fragil a mudancas de formato de cookie do Supabase.'),
        ('BAIXA', 'src/app/api/signup-subscribe/route.ts:324',
         'Campo _debug na resposta expoe informacoes internas: preco do plano, preference ID do MP e nome interno do plano.'),
        ('INFORMATIVA', 'supabase/schema.sql + schema-admin.sql',
         'units e projeto_units sem DELETE via RLS. Delecao so e possivel via service_role. Defense-in-depth positivo e intencional.'),
    ]),
    ('CAT 2 - Permissao no Navegador', [
        ('CRITICA', 'src/app/api/admin-sistema/planos/debug-mp-plan/route.ts:11',
         'GET sem autenticacao cria planos reais de teste na API do Mercado Pago e os inativa. Pode ser usada para probe da integracao ou spam de planos.'),
        ('CRITICA', 'src/app/api/admin-sistema/planos/update-mp-pix/route.ts:11',
         'POST sem autenticacao modifica metodos de pagamento de TODOS os planos ativos no Mercado Pago. Um atacante pode desabilitar PIX e quebrar o fluxo de pagamento.'),
        ('MEDIA', 'src/app/api/vitta-units/route.ts:39',
         'Rotas legadas usam requireWriteAccess() que so permite admin_sistema, mas o frontend concede UI de admin para coordenadores. Coordenadores recebem 403 em dashboards legados (UX bug).'),
        ('BAIXA', 'src/lib/api-auth.ts:56-59',
         'Fallback ADMIN_EMAILS em requireWriteAccess() ja removido de requireAdminSistema(). Inconsistencia: email na env var ganha acesso sem role=admin_sistema.'),
        ('BAIXA', 'src/app/api/cron/record-usage/route.ts:24',
         'Comparacao !== (timing-unsafe) para CRON_SECRET. Outros 3 endpoints cron usam timingSafeEqual(). Diferenca de timing pode facilitar brute-force.'),
    ]),
    ('CAT 3 - IDOR (Insecure Direct Object Reference)', [
        ('INFORMATIVA', 'Todas as 62 rotas auditadas',
         'Zero vulnerabilidades IDOR encontradas. Rotas por ID verificam posse via sessao (user.id) ou admin. Rotas com path params verificam coordenador_hasAccess(). Ponto forte da aplicacao.'),
    ]),
    ('CAT 4 - Chaves Expostas', [
        ('MEDIA', 'src/app/api/admin-sistema/seed-admin/route.ts:6',
         'Email admin hardcoded: "prosperosdirecional@gmail.com" como default. Se SEED_ADMIN_EMAIL ausente, um usuario nao-intencionado pode ser elevado a admin_sistema.'),
        ('MEDIA', 'src/app/page.tsx:117 + 2 outros .tsx',
         'Email do admin hardcoded no bundle JS do frontend (3 arquivos). Facilita enumeracao de conta privilegiada e ataques de phishing direcionados.'),
        ('BAIXA', 'Historico git (commit 82d010b)',
         'Arquivo .env commitado (valores eram placeholders). .gitignore adicionado depois. Risco de futuros commits acidentais com valores reais permanecerem no historico.'),
        ('BAIXA', 'src/lib/db.ts:1',
         'Arquivo morto importa @prisma/client (ausente das dependencias). Se importado, build falha. log:[query] pode vazar SQL em producao.'),
        ('INFORMATIVA', 'diretorio imobsync/',
         'Copia completa do source. Dobra superficie de ataque e duplica emails hardcoded.'),
    ]),
    ('CAT 5 - Inputs sem Tratamento (XSS)', [
        ('ALTA', 'src/lib/mfa/email.ts:38',
         'displayName do usuario injetado sem escape no HTML do email MFA. A funcao escapeHtml() existe (linha 67) mas nao e aplicada a displayName. Usuario pode definir display_name com HTML malicioso.'),
        ('MEDIA', 'next.config.ts:34',
         'CSP permite unsafe-inline e unsafe-eval em script-src. Anula protecao contra XSS. Se um vetor de injecao for encontrado, o CSP nao bloqueara execucao.'),
        ('MEDIA', 'package.json (ausencia)',
         'Sem biblioteca de sanitizacao HTML (DOMPurify, sanitize-html). Sem protecao para cenarios futuros de renderizacao de HTML de usuarios (descricoes, emails).'),
    ]),
]

for cn, items in FINDINGS:
    story.append(H(cn, sH2, 1))
    hdr = [Paragraph(f'<b>{t}</b>', sTH) for t in ['Severidade', 'Arquivo:Linha', 'Descricao']]
    rows = [hdr]
    for s, loc, d in items:
        rows.append([badge(s), Paragraph(loc, sTD2), Paragraph(d, sTD)])
    t = Table(rows, colWidths=[AW * 0.13, AW * 0.27, AW * 0.60])
    sc = [('BACKGROUND', (0, 0), (-1, 0), HF),
          ('GRID', (0, 0), (-1, -1), 0.3, BD),
          ('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('TOPPADDING', (0, 0), (-1, -1), 3),
          ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
          ('LEFTPADDING', (0, 0), (-1, -1), 3),
          ('RIGHTPADDING', (0, 0), (-1, -1), 3)]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            sc.append(('BACKGROUND', (0, i), (-1, i), TS))
    t.setStyle(TableStyle(sc))
    story.append(t)
    story.append(Spacer(1*cm, 6))

# ── 4. Recomendacoes ──
story.append(H('4. Recomendacoes Priorizadas', sH1, 0))
RECS = [
    ('P1', 'CRITICA', 'Excluir 3 endpoints de debug sem autenticacao',
     'Remover /api/debug/mp-test, /api/admin-sistema/planos/debug-mp-plan e update-mp-pix. Se necessario, adicionar requireAdminSistema(). Esses endpoints permitem manipulacao real de planos de pagamento e leitura de dados com service_role key.'),
    ('P1', 'CRITICA', 'Reabilitar RLS em analytics_events e unit_status_history',
     'Criar politicas: INSERT para autenticados, SELECT para admin_sistema. Os inserts via API ja usam admin client (bypassa RLS), entao a mudança nao afeta o tracking. A API REST direta com anon key sera bloqueada.'),
    ('P1', 'ALTA', 'Corrigir politica UPDATE da tabela units',
     'Alterar USING de auth.role()=authenticated para subquery verificando profiles.role=admin_sistema. A politica tem nome enganoso que mascara o bug.'),
    ('P1', 'ALTA', 'Adicionar isolamento por empreendimento para coordenadores',
     'Atualizar RLS projeto_units_coordenador com JOIN em coordenador_empreendimentos para garantir que cada coordenador so modifique unidades de seus empreendimentos atribuidos.'),
    ('P1', 'ALTA', 'Criar politica profiles_update_own',
     'Adicionar FOR UPDATE USING (auth.uid()=id) WITH CHECK (auth.uid()=id) para que o fluxo first-login/change-password funcione para usuarios comuns (nao-admins).'),
    ('P1', 'ALTA', 'Escapar displayName no template de email MFA',
     'Aplicar escapeHtml(data.displayName) em email.ts:38, consistente com o tratamento ja dado ao userAgent na linha 51.'),
    ('P2', 'MEDIA', 'Exportar schema completo e auditar RLS de 13 tabelas',
     'Executar supabase db dump, commitar schemas como migracoes SQL. Documentar politicas RLS de cada tabela e corrigir qualquer ausencia.'),
    ('P2', 'MEDIA', 'Corrigir design fail-open em coordinator-access.ts',
     'Alterar retorno de null (acesso concedido) para [] (acesso negado) quando a tabela coordenador_empreendimentos nao existir. Seguranca deve falhar fechado.'),
    ('P2', 'MEDIA', 'Restringir CSP: remover unsafe-inline e unsafe-eval',
     'Migrar para nonces ou hashes no next.config.ts. Verificar se deps exigem unsafe-eval (Tailwind v4 nao exige). Usar script-src-elem para separacao.'),
    ('P2', 'MEDIA', 'Adicionar DOMPurify e remover email admin do frontend',
     'Instalar biblioteca de sanitizacao para uso em templates de email e cenarios futuros. Mover verificacao de admin para server-side, remover emails hardcoded do bundle.'),
    ('P3', 'BAIXA', 'Limpeza: remover fallback ADMIN_EMAILS e arquivos obsoletos',
     'Remover fallback de api-auth.ts, corrigir timing-unsafe em record-usage, excluir db.ts morto e adicionar imobsync/ ao .gitignore.'),
]
for p, s, t, d in RECS:
    story.append(KeepTogether([
        Paragraph(f'{badge(s)} <b>{p}</b> - {t}', sBL),
        Paragraph(d, sB), Spacer(0, 3*mm)]))

# ── 5. Issues GitHub ──
story.append(H('5. Issues para o GitHub', sH1, 0))
story.append(Paragraph(
    'Foram geradas 6 issues prontas para copiar e colar no GitHub, agrupando os 24 achados em '
    'tickets acionaveis. As issues estao no arquivo <b>issues-github.md</b> neste mesmo '
    'diretorio (docs/security-audit/), com texto completo em Markdown incluindo titulo, '
    'labels, descricao do problema, evidencia com trecho de codigo, impacto, sugestao de '
    'correcao com exemplos, e checklist de aceite verificavel.', sB))
story.append(Spacer(1*cm, 6))
story.append(Paragraph(
    '<b>Resumo das issues geradas:</b>', sBL))
story.append(Paragraph(
    'Issue 1 [critica]: Remover 3 endpoints de debug sem autenticacao que expoe service_role '
    'e Mercado Pago. Abrange os achados F-02, C2-01a, C2-01b e SEC-4.01.', sBL))
story.append(Paragraph(
    'Issue 2 [critica]: Reabilitar RLS nas tabelas analytics_events e unit_status_history. '
    'Abrange o achado F-01.', sBL))
story.append(Paragraph(
    'Issue 3 [alta]: Corrigir politica RLS UPDATE da tabela units e adicionar isolamento '
    'de coordenadores por empreendimento. Abrange os achados F-04 e F-05.', sBL))
story.append(Paragraph(
    'Issue 4 [alta]: Criar politica profiles_update_own e escapar displayName no email MFA. '
    'Abrange os achados F-06 e XSS-5.01.', sBL))
story.append(Paragraph(
    'Issue 5 [media]: Exportar schema completo, corrigir fail-open, restringir CSP e remover '
    'emails hardcoded. Abrange F-03, F-08, SEC-4.02, SEC-4.03, XSS-5.02 e XSS-5.03.', sBL))
story.append(Paragraph(
    'Issue 6 [baixa]: Limpeza geral - remover fallback ADMIN_EMAILS, corrigir timing-unsafe, '
    'excluir db.ts e diretorio imobsync. Abrange C2-03, C2-04, SEC-4.04, SEC-4.05 e SEC-4.06.', sBL))

# ── Build ──
doc.multiBuild(story, onLaterPages=footer, onFirstPage=footer)
print(f'[body] {BODY_PDF} OK')

# ── Cover ──
cover_html = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
@page {{ size: 210mm 297mm; margin: 0; }}
html, body {{ margin: 0; padding: 0; width: 210mm; height: 297mm; background: #1a1916; }}
.cover {{ width: 210mm; height: 297mm; position: relative; box-sizing: border-box; padding: 60mm 25mm 30mm 25mm; }}
.label {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 9pt; color: #9a833e; letter-spacing: 3pt; text-transform: uppercase; margin-bottom: 12mm; }}
.title {{ font-family: serif; font-size: 28pt; font-weight: bold; color: #f5f5f5; line-height: 1.2; margin-bottom: 8mm; }}
.subtitle {{ font-family: serif; font-size: 13pt; color: #b0ad9e; line-height: 1.5; margin-bottom: 15mm; max-width: 140mm; }}
.line {{ width: 50mm; height: 1px; background: #9a833e; margin-bottom: 10mm; }}
.meta {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 9pt; color: #78766f; line-height: 1.8; }}
</style>
</head>
<body>
<div class="cover">
  <div class="label">Relatorio Tecnico</div>
  <div class="title">Auditoria de<br>Seguranca</div>
  <div class="line"></div>
  <div class="subtitle">
    Analise de vulnerabilidades em 5 categorias<br>
    aplicacao ImobSync<br><br>
    Stack: Next.js 16 + Supabase + Mercado Pago<br>
    Escopo: 62 rotas de API, schemas RLS, frontend<br>
    Metodologia: revisao linha a linha com evidencia verificada
  </div>
  <div class="meta">
    Data: 29 de agosto de 2026<br>
    Versao: 1.0<br>
    Classificacao: Confidencial
  </div>
</div>
</body>
</html>'''
with open(COVER_HTML, 'w') as f:
    f.write(cover_html)
print(f'[cover HTML] {COVER_HTML} OK')

# Render cover
from subprocess import run
PDF_SKILL = os.path.expanduser('~/my-project/skills/pdf')
result = run(['node', f'{PDF_SKILL}/scripts/html2poster.js', COVER_HTML,
               '--output', COVER_PDF, '--width', '794px'], capture_output=True, text=True, timeout=30)
print(f'[cover PDF] {result.stdout.strip()[-80:] if result.stdout else result.stderr[-120:]}')
if not os.path.exists(COVER_PDF):
    # Fallback: use pypdf to create a simple cover page
    print('[cover] html2poster failed, creating minimal cover')
    from reportlab.pdfgen import canvas as cv
    c = cv.Canvas(COVER_PDF, pagesize=A4)
    c.setFillColor(colors.HexColor('#1a1916')); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#9a833e'))
    c.setFont('DejaVuSans', 9)
    c.drawString(M, H - 60*mm, 'RELATORIO TECNICO')
    c.setFillColor(colors.white)
    c.setFont('FreeSerif-Bold', 28)
    c.drawString(M, H - 90*mm, 'Auditoria de Seguranca')
    c.setStrokeColor(colors.HexColor('#9a833e'))
    c.setLineWidth(1)
    c.line(M, H - 100*mm, M + 50*mm, H - 100*mm)
    c.setFillColor(colors.HexColor('#b0ad9e'))
    c.setFont('FreeSerif', 12)
    c.drawString(M, H - 115*mm, 'Aplicacao ImobSync | Next.js 16 + Supabase + Mercado Pago')
    c.drawString(M, H - 125*mm, 'Escopo: 62 rotas de API, schemas RLS, frontend')
    c.setFillColor(colors.HexColor('#78766f'))
    c.setFont('DejaVuSans', 9)
    c.drawString(M, 2*cm, f'Data: 29 de agosto de 2026  |  Versao: 1.0  |  Confidencial')
    c.save()

# ── Merge cover + body ──
reader_body = PdfReader(BODY_PDF)
reader_cover = PdfReader(COVER_PDF)
writer = PdfWriter()
writer.append_pages_from_reader(reader_cover)
writer.append_pages_from_reader(reader_body)
with open(OUT_PDF, 'wb') as f:
    writer.write(f)
print(f'[merged] {OUT_PDF} ({os.path.getsize(OUT_PDF)} bytes, {reader_body.get_num_pages() + reader_cover.get_num_pages()} pages)')

# Cleanup temp files
for f in [BODY_PDF, COVER_HTML, COVER_PDF, CHART_DONUT, CHART_BAR]:
    if os.path.exists(f):
        os.remove(f)
print('[done]')
