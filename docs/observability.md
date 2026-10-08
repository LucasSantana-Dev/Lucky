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
  alpine/socat:1.8.1.1 TCP-LISTEN:3000,fork TCP:grafana:3000
```

Se o Compose roda no homelab e você está em outra máquina, abra um túnel SSH
por cima:

```sh
ssh -L 3000:127.0.0.1:3000 <usuario>@<host-do-homelab>
```

Depois acesse `http://localhost:3000` no navegador. Usuário e senha são os
definidos em `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`.

## Os painéis

Todos ficam na pasta **Lucky** do Grafana e têm um link "Dashboards do Lucky"
no topo para navegar entre eles. Em todo painel, passe o mouse no ícone ⓘ
para ver o que é normal e o que é motivo de atenção. Nenhum exige escrever
consulta: os filtros são as caixas e listas no topo.

| Painel                                | Responde                                                                                                                                                                                                                       | Filtros                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Lucky: comece aqui** (tela inicial) | "Onde eu olho para…?" e os números de agora: bot e backend no ar, alertas ativos, falhas de comando, disco, servidores, usuários ativos, músicas.                                                                              | —                                     |
| **Lucky: negócio**                    | Quantos servidores e usuários o Lucky tem, se está crescendo (entradas, saídas, saldo), comandos e servidores mais ativos, músicas tocadas, votos no top.gg, ativação (servidor novo usou na 1ª semana?) e retenção D1/D7/D30. | Servidor                              |
| **Lucky: erros**                      | Onde e por que está falhando: comandos que falharam e o tipo de erro, erros 5xx por rota, falhas do yt-dlp, card semanal caindo para texto, eventos de comando perdidos, e os logs de erro e aviso.                            | Comando, Nível, Busca, Correlation ID |
| **Lucky: métricas**                   | Se está lento: comandos por minuto, tempo de resposta por comando e por rota da API, serviço de render, event loop, CPU e memória dos processos.                                                                               | Comando, Rota da API                  |
| **Lucky: saúde do sistema**           | Se a infraestrutura aguenta: memória por container, disco, reinícios, gateway do Discord.                                                                                                                                      | —                                     |
| **Lucky: ativação e uso**             | Onboarding, logins no dashboard e de onde vem o áudio (a partir dos logs).                                                                                                                                                     | —                                     |

O painel **negócio** lê o Postgres do Lucky por um usuário só de leitura
(`grafana_ro`) que enxerga apenas resumos (schema `analytics`), nunca tokens,
mensagens ou dados de pagamento. Os dias são contados no horário de Brasília,
e comandos só são registrados desde 02/10/2026: antes disso os painéis de uso
ficam vazios (a tabela "Desde quando há dados" no fim do painel mostra isso).

## O que fazer quando um alerta chega por email

| Alerta                                                               | O que significa                                                                                                                                                                                                        | O que fazer                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LuckyBackendScrapeDown**                                           | O backend não responde há 5 minutos.                                                                                                                                                                                   | Veja se o container `lucky-backend` está rodando (`docker ps`); se caiu, reinicie (`docker compose restart backend`) e olhe os logs.                                                                       |
| **LuckyBotScrapeDown**                                               | O bot não responde há 5 minutos.                                                                                                                                                                                       | Mesma ideia: cheque `docker ps`, reinicie o serviço `bot` se necessário, olhe os logs.                                                                                                                     |
| **LuckyBackendHighErrorRate**                                        | Mais de 5% das respostas do backend são erro (5xx) por 5 minutos seguidos.                                                                                                                                             | Olhe o painel "Erros 5xx (proporção)" em "Lucky: saúde do sistema" e os logs do backend para achar a causa (deploy recente, banco fora do ar, etc).                                                        |
| **LuckyBackendErrorBurstFast**                                       | Mais de 10% de erro em só 2 minutos: sinal de queda rápida, mais urgente que o alerta acima.                                                                                                                           | Trate como incidente: confira se o backend está de pé, se o Postgres/Redis respondem, e se o último deploy é o suspeito.                                                                                   |
| **LuckyDiskSpaceLow**                                                | Um disco está com menos de 20% livre.                                                                                                                                                                                  | Sem urgência imediata, mas planeje limpar espaço (backups antigos, logs, imagens Docker não usadas) antes de virar crítico.                                                                                |
| **LuckyDiskSpaceCritical**                                           | Um disco está com menos de 10% livre.                                                                                                                                                                                  | Urgente: libere espaço agora (`docker system prune`, apagar logs antigos) para não travar o Postgres nem os outros serviços.                                                                               |
| **HostMemoryHigh**                                                   | Menos de 10% de memória disponível (usable, não "livre") na máquina toda. Num Linux saudável a memória "livre" costuma ser pequena de propósito, porque o kernel usa o resto como cache; o que importa é a disponível. | Veja quais containers estão consumindo mais (painel "Memória usada vs limite do container") e considere reiniciar o que estiver vazando memória.                                                           |
| **LuckyBotHeapHigh** / **HighMemoryUsage** / **CriticalMemoryUsage** | Um container específico está perto do próprio limite de memória (`mem_limit`).                                                                                                                                         | Olhe qual container é (`{{ $labels.name }}` no email) no painel "Memória usada vs limite do container"; se persistir, ele pode ser encerrado à força (OOM) em breve.                                       |
| **LuckyCommandEventsDropped**                                        | Há pelo menos 30 minutos o bot está perdendo registros de comando antes de gravar no banco. Os comandos continuam funcionando; o que fica errado é a contagem no painel "Lucky: negócio".                              | Veja se o Postgres está de pé e o motivo no painel "Registros de comando perdidos" em "Lucky: erros". Se for `flush_failure`, o banco está recusando ou fora; reinicie o bot depois de normalizar o banco. |
| **Watchdog**                                                         | Este alerta fica sempre ligado de propósito; ele prova que o Prometheus e o Alertmanager estão vivos.                                                                                                                  | Não é um problema no app. Se ele PARAR de chegar no healthchecks.io, é sinal de que o Prometheus ou o Alertmanager caíram, ou a máquina toda caiu.                                                         |

Todo alerta (menos o Watchdog) some sozinho do painel "Alertas ativos agora"
quando a causa é resolvida; não é preciso "fechar" nada manualmente.
