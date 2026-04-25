#!/bin/bash

# ============================================================================
# Docker Health Test Script
# ============================================================================

set -e  # Exit on error

echo "🔍 Testando Docker setup..."
echo ""

# 1. Verificar Docker
echo "✓ Docker daemon"
docker ps > /dev/null && echo "  ✅ Docker rodando" || exit 1

# 2. Verificar docker-compose
echo "✓ Docker Compose"
docker compose version > /dev/null && echo "  ✅ Docker Compose disponível" || exit 1

# 3. Verificar imagem
echo "✓ Imagem Docker"
if docker images | grep -q "cacamba-tracker-api-server"; then
  echo "  ✅ Imagem já existe"
else
  echo "  ⚠️  Imagem não encontrada, será feito build automático"
fi

# 4. Verificar .env
echo "✓ Configuração"
if [ -f ".env" ]; then
  echo "  ✅ Arquivo .env encontrado"
else
  echo "  ⚠️  .env não encontrado"
  echo "  💡 Criando .env.example como base..."
  cp artifacts/api-server/.env.example .env 2>/dev/null || echo "    Copie .env.example para .env manualmente"
fi

# 5. Syntax check docker-compose
echo "✓ Docker Compose config"
docker compose config > /dev/null && echo "  ✅ Sintaxe válida" || exit 1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Tudo pronto! Próximos passos:"
echo ""
echo "  1. Editar variáveis de ambiente:"
echo "     nano .env"
echo ""
echo "  2. Iniciar container:"
echo "     docker compose up -d --build"
echo ""
echo "  3. Verificar logs:"
echo "     docker logs -f cacamba-tracker-api"
echo ""
echo "  4. Testar API:"
echo "     curl http://localhost:8080/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
