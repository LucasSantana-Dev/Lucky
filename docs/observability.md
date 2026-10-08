# Observabilidade do Lucky

Guia curto para quem não escreve consulta PromQL. Para detalhes técnicos
(arquitetura, variáveis de ambiente, log de atrito), veja
[`observability/README.md`](../observability/README.md).

## Como abrir o Grafana

O Grafana de produção é o do homelab (repositório `homelab`, serviço
`grafana`). Não precisa de túnel:

- **De qualquer lugar:** https://grafana.luk-homeserver.com.br (login Google).
- **Pela tailnet:** http://100.95.204.103:3002

Os dashboards ficam na pasta **Lucky**. O perfil `observability` deste repo
sobe um Grafana próprio com os mesmos dashboards, para quando o Lucky sair do
homelab (veja [`observability/README.md`](../observability/README.md)).

## Os quatro dashboards

- **Lucky: comece aqui**: uma tela só. Bot, Discord, backend e render no ar,
  alertas disparando, erros nos logs, WAG e uso do período. Tudo verde = nada
  a fazer.
- **Lucky: negócio**: metas do music-first (WAG ≥ 20, 1ª hora ≥ 35%, dia 8 ≥
  15%), faixas por dia (pedidas e autoplay), guildas tocando, comandos mais
  usados, entradas e saídas de servidores, aceite do autoplay por fonte,
  votos no top.gg, cards de recap, onboarding e de onde vem o áudio.
- **Lucky: erros**: erros e avisos nos logs por serviço, mensagens mais
  frequentes, comandos que falharam, respostas 5xx, eventos e issues do
  Sentry, fallbacks do card do recap, extratores degradados e as últimas
  linhas de erro.
- **Lucky: sistema**: serviços no ar, tempo de resposta dos comandos e do
  backend, memória e CPU por container, event loop, heap, disco e se o
  Prometheus consegue coletar cada serviço.

Cada painel tem uma descrição (ícone de informação no canto). Guildas do
operador, de listagem e de teste nunca contam como uso.

### De onde vêm os dados

| Fonte                         | O que alimenta                                     | Observação                                                                                                |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Postgres (papel `grafana_ro`) | uso, metas, autoplay, comandos, latência           | Só leitura, só colunas de produto, sem ids de usuário. `track_history` guarda 30 dias.                    |
| Loki                          | erros e avisos, onboarding, logins, fonte do áudio | Filtra pelo prefixo `[ERROR]`/`[WARN]` que o logger escreve; o label `level` do promtail não é confiável. |
| Prometheus                    | serviços no ar, 5xx, memória, CPU, recap, render   | Métricas de comando só aparecem depois do primeiro comando pós-deploy.                                    |
| Sentry                        | eventos e issues do projeto `lucky`                |                                                                                                           |

### Editar um dashboard

Os JSON em `observability/grafana/dashboards/` são gerados. Edite
`observability/grafana/build_dashboards.py`, rode
`python3 observability/grafana/build_dashboards.py` e faça commit dos dois. O
homelab lê a pasta direto do checkout do Lucky, que o deploy atualiza; edição
pela interface do Grafana não é salva.

### Papel `grafana_ro` no Postgres

Criado por `observability/postgres/grafana-ro.sql` (idempotente; o cabeçalho
do arquivo tem o comando, com a senha passada pelo stdin). Rode de novo depois
de restaurar um dump em outro host (papéis não vão no `pg_dump`) ou se uma
migration recriar uma tabela usada pelos dashboards. No homelab a senha fica
em `secrets/lucky_grafana_ro_password`. O Grafana alcança o Postgres pela rede
`lucky-db-ro`, que só tem o `lucky-postgres` (o deploy a cria se não existir).

## O que fazer quando um alerta chega por email

| Alerta                                                               | O que significa                                                                                                                                                                                                        | O que fazer                                                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LuckyBackendScrapeDown**                                           | O backend não responde há 5 minutos.                                                                                                                                                                                   | Veja se o container `lucky-backend` está rodando (`docker ps`); se caiu, reinicie (`docker compose restart backend`) e olhe os logs.                                 |
| **LuckyBotScrapeDown**                                               | O bot não responde há 5 minutos.                                                                                                                                                                                       | Mesma ideia: cheque `docker ps`, reinicie o serviço `bot` se necessário, olhe os logs.                                                                               |
| **LuckyBackendHighErrorRate**                                        | Mais de 5% das respostas do backend são erro (5xx) por 5 minutos seguidos.                                                                                                                                             | Olhe o painel "Erros 5xx (proporção)" em "Lucky: saúde do sistema" e os logs do backend para achar a causa (deploy recente, banco fora do ar, etc).                  |
| **LuckyBackendErrorBurstFast**                                       | Mais de 10% de erro em só 2 minutos: sinal de queda rápida, mais urgente que o alerta acima.                                                                                                                           | Trate como incidente: confira se o backend está de pé, se o Postgres/Redis respondem, e se o último deploy é o suspeito.                                             |
| **LuckyDiskSpaceLow**                                                | Um disco está com menos de 20% livre.                                                                                                                                                                                  | Sem urgência imediata, mas planeje limpar espaço (backups antigos, logs, imagens Docker não usadas) antes de virar crítico.                                          |
| **LuckyDiskSpaceCritical**                                           | Um disco está com menos de 10% livre.                                                                                                                                                                                  | Urgente: libere espaço agora (`docker system prune`, apagar logs antigos) para não travar o Postgres nem os outros serviços.                                         |
| **HostMemoryHigh**                                                   | Menos de 10% de memória disponível (usable, não "livre") na máquina toda. Num Linux saudável a memória "livre" costuma ser pequena de propósito, porque o kernel usa o resto como cache; o que importa é a disponível. | Veja quais containers estão consumindo mais (painel "Memória usada vs limite do container") e considere reiniciar o que estiver vazando memória.                     |
| **LuckyBotHeapHigh** / **HighMemoryUsage** / **CriticalMemoryUsage** | Um container específico está perto do próprio limite de memória (`mem_limit`).                                                                                                                                         | Olhe qual container é (`{{ $labels.name }}` no email) no painel "Memória usada vs limite do container"; se persistir, ele pode ser encerrado à força (OOM) em breve. |
| **Watchdog**                                                         | Este alerta fica sempre ligado de propósito; ele prova que o Prometheus e o Alertmanager estão vivos.                                                                                                                  | Não é um problema no app. Se ele PARAR de chegar no healthchecks.io, é sinal de que o Prometheus ou o Alertmanager caíram, ou a máquina toda caiu.                   |

Todo alerta (menos o Watchdog) some sozinho do painel "Alertas ativos agora"
quando a causa é resolvida; não é preciso "fechar" nada manualmente.
