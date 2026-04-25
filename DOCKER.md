# 🐳 Guia Docker - Cacamba Tracker API

## 📋 O que foi melhorado

✅ **Multi-stage build** - Imagem otimizada (sem dependencies de build)  
✅ **Usuário non-root** - Segurança aumentada  
✅ **Health check automático** - Monitora saúde da aplicação  
✅ **Limites de recursos** - CPU e memória configurados  
✅ **Logs estruturados** - Arquivo de log com rotação  
✅ **Variáveis de ambiente** - Valores padrão sensatos  

---

## 🚀 Quick Start

### 1️⃣ Criar arquivo `.env` com suas configurações:

```bash
cp artifacts/api-server/.env.example .env
# Editar .env com seus valores reais
```

### 2️⃣ Iniciar a aplicação:

```bash
docker compose up -d --build
```

### 3️⃣ Verificar status:

```bash
docker compose ps
docker logs -f cacamba-tracker-api
```

---

## 📝 Comandos Úteis

### Iniciar/Parar
```bash
# Iniciar
docker compose up -d

# Parar
docker compose down

# Reiniciar
docker compose restart

# Rebuild após git pull
docker compose up -d --build
```

### Monitoramento
```bash
# Ver logs
docker logs -f cacamba-tracker-api

# Ver últimas 100 linhas
docker logs --tail=100 cacamba-tracker-api

# Ver logs com timestamp (últimas 5 minutos)
docker logs --since 5m cacamba-tracker-api

# Ver status do container
docker compose ps

# Ver recursos consumidos
docker stats cacamba-tracker-api
```

### Testes
```bash
# Testar API HTTP
curl http://localhost:8080/health

# Testar porta TCP (rastreadores)
ss -tulpn | grep 5000
nc -zv localhost 5000

# Entrar no container para debug
docker compose exec api-server sh
```

### Variáveis de Ambiente
```bash
# Passar variável ao iniciar
docker compose run --rm api-server env | grep PORT

# Editar .env e fazer reload
nano .env
docker compose restart
```

---

## 🔍 Troubleshooting

### Container não inicia
```bash
# Ver logs detalhados
docker logs cacamba-tracker-api

# Reconstruir
docker compose down
docker compose up -d --build
```

### Porta já está em uso
```bash
# Mudar porta em docker-compose.yml
# Ou liberar a porta:
lsof -i :5000
kill -9 <PID>
```

### Memory leak ou alto consumo
```bash
# Ver consumo em tempo real
docker stats cacamba-tracker-api

# Aumentar limite em docker-compose.yml
# deploy.resources.limits.memory
```

---

## 📦 Estrutura de Arquivos

```
.
├── docker-compose.yml          # Orquestração dos containers
├── artifacts/api-server/
│   ├── Dockerfile              # Build multi-stage otimizado
│   ├── .dockerignore           # Arquivos ignorados no build
│   ├── .env.example            # Variáveis de ambiente modelo
│   └── src/                    # Código-fonte
```

---

## ⚙️ Configurações Importantes

### Limites de Recursos
Editar em `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: "1"        # Máximo de CPU
      memory: 512M     # Máximo de RAM
```

### Portas
- **5000/TCP** - Rastreadores GPS (exposto ao mundo)
- **8080/TCP** - API HTTP (localhost apenas, recomendado atrás de reverse proxy)

### Health Check
O container verifica automaticamente se está saudável a cada 30s.  
Se falhar 3 vezes, será reiniciado.

---

## 🔐 Segurança

✅ Container roda como usuário `nodejs` (não root)  
✅ `.env` listado em `.gitignore` (segredos não vão para git)  
✅ Health check detecta falhas  
✅ Logs não salvos localmente (docker json-file)  

**Para produção, considere:**
- Usar reverse proxy (nginx) na frente
- Limitar acesso à porta TCP (firewall)
- Usar secrets do Docker/K8s
- Monitorar com Prometheus/Grafana

---

## 📊 Monitoramento em Produção

### Ver consumo de recursos
```bash
docker stats --no-stream cacamba-tracker-api
```

### Configurar alertas
```bash
# Exemplo: reiniciar se usar >90% memoria
docker event inspect --filter 'name=cacamba-tracker-api'
```

### Backup de dados
```bash
# Se usar volumes montados
docker compose exec api-server tar czf - ./data > backup.tar.gz
```

---

## 🎯 Próximos Passos

1. **Certificados SSL**: Adicionar na frente com nginx/traefik
2. **Backup automático**: Configurar backup DB Supabase
3. **CI/CD**: Adicionar pipeline GitHub Actions
4. **Monitoramento**: Integrar com Datadog/New Relic
5. **Escalabilidade**: Usar Docker Swarm ou Kubernetes

---

## 📞 Suporte

Qualquer dúvida, cheque:
- `docker logs cacamba-tracker-api` - veja os erros
- `.env.example` - variáveis obrigatórias
- `artifacts/api-server/src/index.ts` - porta padrão
