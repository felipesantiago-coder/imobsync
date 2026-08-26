#!/usr/bin/env bash
# ============================================
# setup-storage-download.sh
#
# Cria o bucket 'downloads' no Supabase Storage
# e faz upload do projeto.zip para lá.
#
# Uso: bash scripts/setup-storage-download.sh
# ============================================

set -euo pipefail

# Verificar se as env vars estão configuradas
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERRO: Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
  echo "  export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co"
  echo "  export SUPABASE_SERVICE_ROLE_KEY=eyJ..."
  exit 1
fi

ZIP_PATH="public/projeto.zip"

if [ ! -f "$ZIP_PATH" ]; then
  echo "ERRO: Arquivo $ZIP_PATH não encontrado"
  exit 1
fi

echo "=== ImobSync Storage Setup ==="
echo "1. Criando bucket 'downloads' (se não existir)..."

# Criar bucket (ignora erro se já existir)
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/create_bucket_if_not_exists" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"downloads","name":"downloads","public":false,"file_size_limit":52428800}' \
  > /dev/null 2>&1 || true

# Tentar via API do Supabase Storage
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"downloads","name":"downloads","public":false,"file_size_limit":52428800}')

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "409" ]; then
  echo "   Bucket 'downloads' pronto."
else
  echo "   Bucket pode já existir (status $HTTP_STATUS). Continuando..."
fi

echo "2. Fazendo upload de projeto.zip ($(du -h "$ZIP_PATH" | cut -f1))..."

UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/downloads/projeto.zip" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/zip" \
  --data-binary "@$ZIP_PATH")

if [ "$UPLOAD_STATUS" = "200" ] || [ "$UPLOAD_STATUS" = "201" ]; then
  echo "   Upload concluído com sucesso!"
else
  echo "   ERRO no upload (HTTP $UPLOAD_STATUS). Verifique as credenciais."
  exit 1
fi

echo "3. Testando URL assinada..."
SIGNED=$(curl -s \
  -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/sign/downloads/projeto.zip" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn":60}')

echo "$SIGNED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   URL: {d.get("signedUrl", "ERRO")[:80]}...')" 2>/dev/null \
  || echo "   (Não foi possível verificar a URL — pode estar ok)"

echo ""
echo "=== Setup concluído ==="
echo ""
echo "PRÓXIMO PASSO: Remova o arquivo do /public com:"
echo "  git rm public/projeto.zip"
echo ""
echo "O endpoint /api/download agora usa Supabase Storage com URL assinada."
