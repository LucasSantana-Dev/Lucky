# Observabilidade do Lucky

Guia curto para quem não escreve consulta PromQL. Para detalhes técnicos
(arquitetura, variáveis de ambiente, log de atrito), veja
[`observability/README.md`](../observability/README.md).

## Como abrir o Grafana

O Grafana não expõe porta no host (por segurança). Para abrir o painel:

```sh
# No servidor que roda o Compose (deixe rodando; Ctrl-C para parar):
docker run --rm -it \
  --network lucky-network \
  -p 127.0.0.1:3000:3000 \
  alpine/socat TCP-LISTEN:3000,fork TCP:grafana:3000
```

Se o Compose roda no homelab e você está em outra máquina, abra um túnel SSH
por cima:

```sh
ssh -L 3000:127.0.0.1:3000 <usuario>@<host-do-homelab>
```

Depois acesse `http://localhost:3000` no navegador. Usuário e senha são os
definidos em `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`.

## Os dois painéis

- **Lucky: comece aqui** (tela inicial do Grafana): uma tabela "Pergunta →
  Onde olhar" e os números mais importantes (bot ligado, backend ligado,
  erros agora, disco livre, alertas ativos). Comece sempre por aqui.
- **Lucky: saúde do sistema**: todos os gráficos em detalhe (requisições,
  tempo de resposta, memória, disco, entradas/saídas de servidor). Cada
  painel tem uma descrição explicando o que é normal e o que é motivo de
  atenção (passe o mouse no ícone de informação no canto do painel).

Os dois painéis têm um link "Dashboards do Lucky" no topo para navegar entre
eles.

## O que fazer quando um alerta chega por email

| Alerta | O que significa | O que fazer |
| --- | --- | --- |
| **LuckyBackendScrapeDown** | O backend não responde há 5 minutos. | Veja se o container `lucky-backend` está rodando (`docker ps`); se caiu, reinicie (`docker compose restart backend`) e olhe os logs. |
| **LuckyBotScrapeDown** | O bot não responde há 5 minutos. | Mesma ideia: cheque `docker ps`, reinicie o serviço `bot` se necessário, olhe os logs. |
| **LuckyBackendHighErrorRate** | Mais de 5% das respostas do backend são erro (5xx) por 5 minutos seguidos. | Olhe o painel "Erros 5xx" em "Lucky: saúde do sistema" e os logs do backend para achar a causa (deploy recente, banco fora do ar, etc). |
| **LuckyBackendErrorBurstFast** | Mais de 10% de erro em só 2 minutos: sinal de queda rápida, mais urgente que o alerta acima. | Trate como incidente: confira se o backend está de pé, se o Postgres/Redis respondem, e se o último deploy é o suspeito. |
| **LuckyDiskSpaceLow** | Um disco está com menos de 20% livre. | Sem urgência imediata, mas planeje limpar espaço (backups antigos, logs, imagens Docker não usadas) antes de virar crítico. |
| **LuckyDiskSpaceCritical** | Um disco está com menos de 10% livre. | Urgente: libere espaço agora (`docker system prune`, apagar logs antigos) para não travar o Postgres nem os outros serviços. |
| **HostMemoryHigh** | Menos de 10% de memória livre na máquina toda. | Veja quais containers estão consumindo mais (painel "Memória usada vs limite") e considere reiniciar o que estiver vazando memória. |
| **LuckyBotHeapHigh** / **HighMemoryUsage** / **CriticalMemoryUsage** | Um container específico está perto do próprio limite de memória (`mem_limit`). | Olhe qual container é (`{{ $labels.name }}` no email) no painel "Memória usada vs limite"; se persistir, ele pode ser encerrado à força (OOM) em breve. |
| **Watchdog** | Este alerta fica sempre ligado de propósito; ele prova que o Prometheus e o Alertmanager estão vivos. | Não é um problema no app. Se ele PARAR de chegar no healthchecks.io, é sinal de que o Prometheus ou o Alertmanager caíram, ou a máquina toda caiu. |

Todo alerta (menos o Watchdog) some sozinho do painel "Alertas ativos agora"
quando a causa é resolvida; não é preciso "fechar" nada manualmente.
