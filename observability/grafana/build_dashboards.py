#!/usr/bin/env python3
"""Generate Lucky's Grafana dashboards into observability/grafana/dashboards/.

Run `python3 observability/grafana/build_dashboards.py` after editing; commit the
generated JSON with this file (the pre-commit prettier pass reformats it, so a
fresh run shows a whitespace-only diff until committed). Stdlib only.

Datasources are referenced through hidden datasource variables (ds_prometheus,
ds_loki, ds_postgres, ds_sentry) so the same JSON loads in the homelab Grafana
(auto-generated datasource uids) and in the Lucky compose profile Grafana.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "dashboards"

P = {"type": "prometheus", "uid": "${ds_prometheus}"}
L = {"type": "loki", "uid": "${ds_loki}"}
PG = {"type": "grafana-postgresql-datasource", "uid": "${ds_postgres}"}
SEN = {"type": "grafana-sentry-datasource", "uid": "${ds_sentry}"}
SENTRY_PROJECT_ID = "4509260792070144"  # Sentry project "lucky"

# Operator, listing and test guilds never count as usage
# (scripts/music-first-gates.sql, decisions/2026-09-27-music-first-positioning.md).
EXCLUDED = "'110373943822540800','333949691962195969','1541452011466268704'"
EXCL = (
    "(SELECT unnest(ARRAY[$excluidas]::text[]) "
    "UNION SELECT \"discordId\" FROM guilds WHERE name ILIKE '%test%' "
    "UNION SELECT \"guildDiscordId\" FROM guild_membership_events WHERE \"guildName\" ILIKE '%test%')"
)
ACTIVITY = (
    "(SELECT \"guildId\" AS g, \"playedAt\" AS t FROM track_history "
    "UNION ALL SELECT \"guildId\", \"occurredAt\" FROM command_events WHERE \"guildId\" IS NOT NULL)"
)
APP = 'container_name=~"lucky-(bot|backend|render)"'
ERR_LINE = r"|~ `^\[(ERROR|FATAL|CRITICAL)\]`"
WARN_LINE = r"|~ `^\[WARN\]`"
# Message text without the trailing request duration, so "GET /x 401 3ms" groups as one.
MSG = r'| regexp `"msg":"(?P<msg>[^"]{0,120}?)(?: [0-9]+ms)?"`'

RED, ORANGE, GREEN = "red", "orange", "green"


def thresholds(*steps):
    """steps: (color, value) pairs; the first value is ignored (base)."""
    return {"mode": "absolute", "steps": [{"color": c, "value": (None if i == 0 else v)} for i, (c, v) in enumerate(steps)]}


def prom(expr, legend="", instant=False):
    return {"datasource": P, "expr": expr, "legendFormat": legend, "instant": instant, "range": not instant}


def loki(expr, legend="", instant=False):
    return {"datasource": L, "expr": expr, "legendFormat": legend, "queryType": "instant" if instant else "range"}


def sql(raw, fmt="table"):
    return {"datasource": PG, "rawSql": raw, "format": fmt, "rawQuery": True, "editorMode": "code"}


class Board:
    def __init__(self, uid, title, description, time_from="now-7d", tags=()):
        self.uid, self.title, self.description, self.time_from = uid, title, description, time_from
        self.tags = ["lucky", *tags]
        self.panels, self.x, self.y, self.row_h = [], 0, 0, 0

    def _place(self, w, h):
        if self.x + w > 24:
            self.x, self.y, self.row_h = 0, self.y + self.row_h, 0
        pos = {"x": self.x, "y": self.y, "w": w, "h": h}
        self.x += w
        self.row_h = max(self.row_h, h)
        return pos

    def row(self, title):
        if self.x:
            self.x, self.y, self.row_h = 0, self.y + self.row_h, 0
        self.panels.append({"type": "row", "title": title, "collapsed": False, "panels": [], "gridPos": {"x": 0, "y": self.y, "w": 24, "h": 1}})
        self.y += 1

    def add(self, ptype, title, targets, w=6, h=6, desc="", unit=None, th=None, options=None,
            no_value=None, decimals=None, mappings=None, custom=None, overrides=None, transformations=None, ds=None):
        defaults = {}
        if unit:
            defaults["unit"] = unit
        if th:
            defaults["thresholds"] = th
            defaults["color"] = {"mode": "thresholds"}
        if no_value is not None:
            defaults["noValue"] = no_value
        if decimals is not None:
            defaults["decimals"] = decimals
        if mappings:
            defaults["mappings"] = mappings
        if custom:
            defaults["custom"] = custom
        for i, t in enumerate(targets):
            t["refId"] = chr(65 + i)
        panel = {
            "type": ptype, "title": title, "description": desc, "gridPos": self._place(w, h),
            "datasource": ds or (targets[0]["datasource"] if targets else None), "targets": targets,
            "fieldConfig": {"defaults": defaults, "overrides": overrides or []},
            "options": options or {},
        }
        if transformations:
            panel["transformations"] = transformations
        self.panels.append(panel)

    def stat(self, title, target, desc="", unit=None, th=None, w=4, h=4, **kw):
        opts = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "colorMode": "background" if th else "value", "graphMode": "none", "textMode": "value_and_name" if kw.pop("show_names", False) else "auto"}
        self.add("stat", title, [target], w=w, h=h, desc=desc, unit=unit, th=th, options=opts, **kw)

    def text(self, title, md, w=24, h=4):
        self.panels.append({"type": "text", "title": title, "gridPos": self._place(w, h), "options": {"mode": "markdown", "content": md}})

    def json(self):
        ds_vars = [
            ("ds_prometheus", "prometheus", "/^Prometheus$/"),
            ("ds_loki", "loki", ""),
            ("ds_postgres", "grafana-postgresql-datasource", ""),
            ("ds_sentry", "grafana-sentry-datasource", ""),
        ]
        templating = [{"name": n, "type": "datasource", "query": q, "regex": r, "hide": 2, "refresh": 1,
                       "current": {}, "options": [], "includeAll": False, "multi": False} for n, q, r in ds_vars]
        uses_excl = any("$excluidas" in t.get("rawSql", "") for p in self.panels for t in p.get("targets", []))
        if uses_excl:
            templating.append({"name": "excluidas", "type": "constant", "query": EXCLUDED, "hide": 2,
                               "description": "Guildas do operador, de listagem e de teste: nunca contam como uso."})
        for i, p in enumerate(self.panels, start=1):
            p["id"] = i
        return {
            "uid": self.uid, "title": self.title, "description": self.description, "tags": self.tags,
            "timezone": "browser", "editable": True, "graphTooltip": 1, "schemaVersion": 39,
            "time": {"from": self.time_from, "to": "now"}, "refresh": "5m",
            "templating": {"list": templating}, "annotations": {"list": []},
            "links": [{"type": "dashboards", "tags": ["lucky"], "asDropdown": False, "title": "Dashboards do Lucky",
                       "includeVars": False, "keepTime": True, "targetBlank": False, "icon": "external link"}],
            "panels": self.panels,
        }


UP_MAP = [{"type": "value", "options": {"0": {"text": "FORA", "color": RED}, "1": {"text": "OK", "color": GREEN}}}]
BARS = {"drawStyle": "bars", "fillOpacity": 80, "lineWidth": 1, "stacking": {"mode": "normal", "group": "A"}}
LINES = {"drawStyle": "line", "fillOpacity": 10, "lineWidth": 2, "showPoints": "never"}
TS_OPTS = {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True}, "tooltip": {"mode": "multi", "sort": "desc"}}

FIRING = 'count(ALERTS{alertstate="firing", alertname=~"Lucky.*|HighMemoryUsage|CriticalMemoryUsage|HostMemoryHigh"}) or vector(0)'
ERRORS_RANGE = f"sum(count_over_time({{{APP}}} {ERR_LINE} [$__range])) or vector(0)"
WAG_7D = f"SELECT count(DISTINCT g) AS \"Guildas ativas\" FROM {ACTIVITY} a WHERE t >= now() - interval '7 days' AND g NOT IN {EXCL}"


# --------------------------------------------------------------------------- comece aqui
def inicio():
    b = Board("lucky-inicio", "Lucky: comece aqui",
              "Resumo de uma tela: o Lucky está no ar, está sendo usado e está com erro?", "now-24h", ("inicio",))
    b.text("Como usar", (
        "**Tudo verde = nada a fazer.** Cada número abre o dashboard que explica.\n\n"
        "- **[Lucky: negócio](/d/lucky-negocio)**: quem usa, quanto usa, metas do music-first (WAG, 1ª hora, dia 8), autoplay, votos.\n"
        "- **[Lucky: erros](/d/lucky-erros)**: erros nos logs, comandos que falharam, 5xx, Sentry, alertas.\n"
        "- **[Lucky: sistema](/d/lucky-sistema)**: serviços no ar, memória, CPU, latência, disco.\n\n"
        "Guildas do operador, de listagem e de teste ficam fora das contas de uso."), h=5)
    b.stat("Bot", prom('max(up{job="lucky-bot"})', instant=True), mappings=UP_MAP, th=thresholds((RED, 0), (GREEN, 1)), w=3)
    b.stat("Discord conectado", prom("max(lucky_bot_gateway_connected)", instant=True), mappings=UP_MAP, th=thresholds((RED, 0), (GREEN, 1)), w=3)
    b.stat("Backend", prom('max(up{job="lucky-backend"})', instant=True), mappings=UP_MAP, th=thresholds((RED, 0), (GREEN, 1)), w=3)
    b.stat("Render (cards)", prom('max(up{job="lucky-render"})', instant=True), mappings=UP_MAP, th=thresholds((RED, 0), (GREEN, 1)), w=3,
           desc="Sidecar que desenha o card do recap semanal.")
    b.stat("Alertas disparando", prom(FIRING, instant=True), th=thresholds((GREEN, 0), (RED, 1)), w=4,
           desc="Alertas do Lucky ativos agora no Prometheus.")
    b.stat("Erros nos logs (período)", loki(ERRORS_RANGE, instant=True), th=thresholds((GREEN, 0), (ORANGE, 1), (RED, 20)), w=4,
           desc="Linhas [ERROR]/[FATAL] do bot, backend e render no período selecionado.")
    b.stat("Servidores com o Lucky", prom('max(lucky_bot_guilds_total{state="active"})', instant=True), w=4)
    b.stat("WAG (7 dias)", sql(WAG_7D), th=thresholds((RED, 0), (ORANGE, 10), (GREEN, 20)), w=5,
           desc="Guildas com música tocada ou comando nos últimos 7 dias. Meta music-first: 20 por 3 semanas seguidas.")
    b.stat("Faixas tocadas (período)", sql(
        f"SELECT count(*) AS \"Faixas\" FROM track_history WHERE $__timeFilter(\"playedAt\") AND \"guildId\" NOT IN {EXCL}"), w=5)
    b.stat("Comandos (período)", sql(
        f"SELECT count(*) AS \"Comandos\" FROM command_events WHERE $__timeFilter(\"occurredAt\") AND coalesce(\"guildId\", '') NOT IN {EXCL}"), w=5)
    b.stat("Memória do host", prom("100 * (1 - avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes))", instant=True),
           unit="percent", decimals=0, th=thresholds((GREEN, 0), (ORANGE, 80), (RED, 90)), w=5)
    return b


# --------------------------------------------------------------------------- negócio
def negocio():
    b = Board("lucky-negocio", "Lucky: negócio",
              "Uso real do Lucky e as metas do music-first. Fonte: Postgres (somente leitura) e eventos do bot no Loki.",
              "now-30d", ("negocio",))
    b.text("Leia antes", (
        "Metas do music-first (decisão até **20/12/2026**): **WAG ≥ 20** por 3 semanas, **≥ 35%** das guildas novas ouvem música na 1ª hora, "
        "**≥ 15%** ainda ativas no dia 8. Guildas do operador, de listagem e de teste não contam. "
        "`track_history` guarda só 30 dias e no máximo 100 faixas por guilda, então janelas maiores que 30 dias subcontam plays."), h=3)

    b.row("Metas do music-first")
    b.stat("WAG (7 dias)", sql(WAG_7D), th=thresholds((RED, 0), (ORANGE, 10), (GREEN, 20)), w=4,
           desc="Guildas com faixa tocada ou comando nos últimos 7 dias.")
    cohort = (
        f"WITH joins AS (SELECT \"guildDiscordId\" AS g, min(\"occurredAt\") AS t FROM guild_membership_events "
        f"WHERE kind = 'JOIN' GROUP BY 1 HAVING min(\"occurredAt\") > now() - interval '28 days'), "
        f"c AS (SELECT j.t, "
        f"EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g AND th.\"playedAt\" BETWEEN j.t AND j.t + interval '1 hour') AS heard, "
        f"(EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g AND th.\"playedAt\" >= j.t + interval '7 days') "
        f"OR EXISTS (SELECT 1 FROM command_events ce WHERE ce.\"guildId\" = j.g AND ce.\"occurredAt\" >= j.t + interval '7 days')) AS d8 "
        f"FROM joins j WHERE j.g NOT IN {EXCL}) ")
    b.stat("Ouviram música na 1ª hora", sql(cohort +
           "SELECT round(100.0 * count(*) FILTER (WHERE t <= now() - interval '1 hour' AND heard) "
           "/ nullif(count(*) FILTER (WHERE t <= now() - interval '1 hour'), 0), 1) AS \"1ª hora (%)\" FROM c"),
           unit="percent", th=thresholds((RED, 0), (ORANGE, 25), (GREEN, 35)), w=5, no_value="sem guildas novas",
           desc="Guildas que entraram nos últimos 28 dias e tocaram uma faixa na primeira hora. Meta: 35%.")
    b.stat("Ativas no dia 8", sql(cohort +
           "SELECT round(100.0 * count(*) FILTER (WHERE t <= now() - interval '8 days' AND d8) "
           "/ nullif(count(*) FILTER (WHERE t <= now() - interval '8 days'), 0), 1) AS \"Dia 8 (%)\" FROM c"),
           unit="percent", th=thresholds((RED, 0), (ORANGE, 10), (GREEN, 15)), w=5, no_value="sem guildas elegíveis",
           desc="Guildas que entraram entre 8 e 28 dias atrás e ainda tocaram ou usaram comando a partir do dia 8. Meta: 15%.")
    b.stat("Servidores com o Lucky", prom('max(lucky_bot_guilds_total{state="active"})', instant=True), w=4)
    b.stat("Entraram (período)", sql(
        f"SELECT count(*) AS \"Entradas\" FROM guild_membership_events WHERE kind = 'JOIN' AND $__timeFilter(\"occurredAt\") "
        f"AND \"guildDiscordId\" NOT IN {EXCL}"), w=3)
    b.stat("Saíram (período)", sql(
        f"SELECT count(*) AS \"Saídas\" FROM guild_membership_events WHERE kind = 'LEAVE' AND $__timeFilter(\"occurredAt\") "
        f"AND \"guildDiscordId\" NOT IN {EXCL}"), w=3,
        th=thresholds((GREEN, 0), (ORANGE, 1)))
    b.add("timeseries", "WAG por semana (últimas 4 semanas)", [sql(
        f"SELECT date_trunc('week', t) AS time, count(DISTINCT g) AS \"Guildas ativas\" FROM {ACTIVITY} a "
        f"WHERE t >= date_trunc('week', now()) - interval '3 weeks' AND g NOT IN {EXCL} GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=8, custom={**BARS, "stacking": {"mode": "none"}, "thresholdsStyle": {"mode": "dashed"}},
        th=thresholds((RED, 0), (GREEN, 20)), options=TS_OPTS,
        desc="Semana começa na segunda (UTC). A linha tracejada é a meta de 20.")
    b.add("table", "Guildas novas por semana de entrada (28 dias)", [sql(
        "WITH joins AS (SELECT \"guildDiscordId\" AS g, min(\"occurredAt\") AS t FROM guild_membership_events "
        "WHERE kind = 'JOIN' GROUP BY 1 HAVING min(\"occurredAt\") > now() - interval '28 days') "
        "SELECT date_trunc('week', j.t)::date AS \"Semana\", count(*) AS \"Entraram\", "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g "
        "AND th.\"playedAt\" BETWEEN j.t AND j.t + interval '1 hour')) AS \"Tocaram na 1ª hora\", "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g)) AS \"Já tocaram\" "
        f"FROM joins j WHERE j.g NOT IN {EXCL} GROUP BY 1 ORDER BY 1 DESC")], w=12, h=8)

    b.row("Uso")
    b.add("timeseries", "Faixas tocadas por dia", [sql(
        "SELECT date_trunc('day', \"playedAt\") AS time, "
        "count(*) FILTER (WHERE NOT \"isAutoplay\") AS \"Pedidas\", count(*) FILTER (WHERE \"isAutoplay\") AS \"Autoplay\" "
        f"FROM track_history WHERE $__timeFilter(\"playedAt\") AND \"guildId\" NOT IN {EXCL} GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=8, custom=BARS, options=TS_OPTS)
    b.add("timeseries", "Guildas tocando por dia", [sql(
        "SELECT date_trunc('day', \"playedAt\") AS time, count(DISTINCT \"guildId\") AS \"Guildas tocando\" "
        f"FROM track_history WHERE $__timeFilter(\"playedAt\") AND \"guildId\" NOT IN {EXCL} GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=8, custom={**BARS, "stacking": {"mode": "none"}}, options=TS_OPTS)
    b.add("table", "Comandos mais usados", [sql(
        "SELECT command AS \"Comando\", count(*) AS \"Usos\", count(DISTINCT \"guildId\") AS \"Guildas\", "
        "round(percentile_cont(0.5) WITHIN GROUP (ORDER BY \"latencyMs\")) AS \"Resposta p50 (ms)\" "
        f"FROM command_events WHERE $__timeFilter(\"occurredAt\") AND coalesce(\"guildId\", '') NOT IN {EXCL} "
        "GROUP BY 1 ORDER BY 2 DESC LIMIT 15")], w=12, h=9)
    b.add("timeseries", "Entradas e saídas de servidores por dia", [sql(
        "SELECT date_trunc('day', \"occurredAt\") AS time, count(*) FILTER (WHERE kind = 'JOIN') AS \"Entraram\", "
        "-count(*) FILTER (WHERE kind = 'LEAVE') AS \"Saíram\" FROM guild_membership_events "
        f"WHERE $__timeFilter(\"occurredAt\") AND \"guildDiscordId\" NOT IN {EXCL} GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=9, custom={**BARS, "stacking": {"mode": "none"}}, options=TS_OPTS,
        overrides=[{"matcher": {"id": "byName", "options": "Saíram"}, "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": RED}}]},
                   {"matcher": {"id": "byName", "options": "Entraram"}, "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": GREEN}}]}],
        desc="Saídas aparecem abaixo de zero.")

    b.row("Autoplay e recomendações")
    b.stat("Faixas que vieram do autoplay", sql(
        "SELECT round(100.0 * count(*) FILTER (WHERE \"isAutoplay\") / nullif(count(*), 0), 1) AS \"Autoplay (%)\" "
        f"FROM track_history WHERE $__timeFilter(\"playedAt\") AND \"guildId\" NOT IN {EXCL}"), unit="percent", w=6,
        desc="Inflado: o autoplay grava uma linha ao enfileirar e outra ao tocar (#2667).")
    b.stat("Aceite das recomendações", sql(
        "SELECT round(100.0 * count(*) FILTER (WHERE \"isAccepted\") / nullif(count(*) FILTER (WHERE \"isAccepted\" OR \"isRejected\"), 0), 1) "
        "AS \"Aceite (%)\" FROM recommendations WHERE $__timeFilter(\"createdAt\")"), unit="percent",
        th=thresholds((RED, 0), (ORANGE, 60), (GREEN, 80)), w=6,
        desc="Aceitas / (aceitas + rejeitadas). Pendentes ficam fora.")
    b.add("bargauge", "Aceite por fonte da recomendação", [sql(
        "SELECT coalesce(source::text, 'sem fonte') AS \"Fonte\", round(100.0 * count(*) FILTER (WHERE \"isAccepted\") "
        "/ nullif(count(*) FILTER (WHERE \"isAccepted\" OR \"isRejected\"), 0), 1) AS \"Aceite (%)\" "
        "FROM recommendations WHERE $__timeFilter(\"createdAt\") GROUP BY 1 ORDER BY count(*) DESC")],
        w=12, h=7, unit="percent", th=thresholds((RED, 0), (ORANGE, 60), (GREEN, 80)),
        options={"displayMode": "basic", "orientation": "horizontal", "showUnfilled": True,
                 "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True}})

    b.row("Engajamento")
    b.stat("Votos no top.gg (30 dias)", sql(
        "SELECT count(*) AS \"Votantes\" FROM topgg_votes WHERE \"lastVoteAt\" > now() - interval '30 days'"), w=4,
        desc="Pessoas cujo último voto foi nos últimos 30 dias (a tabela guarda só o último voto de cada uma).")
    b.stat("Cards de recap postados (período)", prom("sum(increase(lucky_bot_recap_card_posted_total[$__range])) or vector(0)", instant=True), w=4,
           decimals=0, desc="Recap semanal: domingo 18:00 UTC.")
    b.stat("Onboardings entregues (período)", loki(
        'sum(count_over_time({container_name="lucky-bot"} |= `"msg":"onboarding"` |= `"delivered":true` [$__range])) or vector(0)', instant=True), w=4,
        desc="Mensagem de boas-vindas que chegou ao servidor novo.")
    b.stat("Logins no painel web (período)", loki(
        'sum(count_over_time({container_name="lucky-backend"} |= `"msg":"dashboard_login"` [$__range])) or vector(0)', instant=True), w=4)
    b.add("piechart", "De onde vem o áudio tocado", [loki(
        'sum by (fonte) (count_over_time({container_name="lucky-bot"} |= `"msg":"track_stream_source"` '
        '| regexp `"source":"(?P<fonte>[^"]+)"` [$__range]))', "{{fonte}}", instant=True)],
        w=8, h=7, options={"legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]},
                           "pieType": "donut", "reduceOptions": {"calcs": ["lastNotNull"], "values": False}},
        desc="Fonte real do stream de cada faixa (YouTube, SoundCloud...).")
    return b


# --------------------------------------------------------------------------- erros
def erros():
    b = Board("lucky-erros", "Lucky: erros",
              "O que deu errado, onde e quantas vezes. Logs do bot/backend/render (Loki), comandos (Postgres), HTTP (Prometheus) e Sentry.",
              "now-7d", ("erros",))
    b.stat("Erros nos logs", loki(ERRORS_RANGE, instant=True), th=thresholds((GREEN, 0), (ORANGE, 1), (RED, 20)), w=4,
           desc="Linhas [ERROR]/[FATAL] do bot, backend e render no período.")
    b.stat("Comandos com erro", sql(
        "SELECT round(100.0 * count(*) FILTER (WHERE outcome = 'error') / nullif(count(*), 0), 1) AS \"Erro (%)\" "
        "FROM command_events WHERE $__timeFilter(\"occurredAt\")"), unit="percent",
        th=thresholds((GREEN, 0), (ORANGE, 2), (RED, 5)), w=4,
        desc="Comandos que terminaram em erro. Otimista: comando que trata o erro e responde sozinho conta como ok.")
    b.stat("Respostas 5xx do backend", prom("sum(increase(lucky_backend_http_server_errors_total[$__range])) or vector(0)", instant=True),
           decimals=0, th=thresholds((GREEN, 0), (ORANGE, 1), (RED, 20)), w=4)
    b.add("stat", "Eventos no Sentry", [{"datasource": SEN, "queryType": "statsV2", "projectIds": [SENTRY_PROJECT_ID],
           "environments": [], "statsCategory": ["error"], "statsFields": ["sum(quantity)"], "statsGroupBy": [],
           "statsOutcome": ["accepted"], "statsInterval": "1d"}], w=4, h=4,
          th=thresholds((GREEN, 0), (ORANGE, 1), (RED, 100)),
          options={"reduceOptions": {"calcs": ["sum"], "fields": "", "values": False}, "colorMode": "background", "graphMode": "none"},
          desc="Erros aceitos pelo Sentry no período (projeto lucky).")
    b.stat("Cards do recap em fallback", prom("sum(increase(lucky_bot_render_fallback_total[$__range])) or vector(0)", instant=True),
           decimals=0, th=thresholds((GREEN, 0), (ORANGE, 1)), w=4,
           desc="Vezes que o card do recap não foi desenhado e o bot mandou só texto.")
    b.stat("Alertas disparando", prom(FIRING, instant=True), th=thresholds((GREEN, 0), (RED, 1)), w=4)

    b.add("timeseries", "Erros e avisos nos logs por serviço", [
        loki(f"sum by (container_name) (count_over_time({{{APP}}} {ERR_LINE} [$__auto]))", "erro {{container_name}}"),
        loki(f"sum by (container_name) (count_over_time({{{APP}}} {WARN_LINE} [$__auto]))", "aviso {{container_name}}")],
        w=16, h=8, custom=BARS, options=TS_OPTS,
        overrides=[{"matcher": {"id": "byRegexp", "options": "^erro.*"}, "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": RED}}]}])
    b.add("timeseries", "Eventos no Sentry por dia", [{"datasource": SEN, "queryType": "statsV2", "projectIds": [SENTRY_PROJECT_ID],
           "environments": [], "statsCategory": ["error"], "statsFields": ["sum(quantity)"], "statsGroupBy": [],
           "statsOutcome": ["accepted"], "statsInterval": "1d"}], w=8, h=8, custom={**BARS, "stacking": {"mode": "none"}}, options=TS_OPTS)

    b.add("table", "Mensagens de erro mais frequentes", [loki(
        f"topk(20, sum by (container_name, msg) (count_over_time({{{APP}}} {ERR_LINE} {MSG} [$__range])))", instant=True)],
        w=12, h=9, no_value="Nenhum erro no período",
        transformations=[{"id": "labelsToFields", "options": {"mode": "columns"}},
                         {"id": "organize", "options": {"excludeByName": {"Time": True},
                          "renameByName": {"container_name": "Serviço", "msg": "Mensagem", "Value": "Vezes"}}},
                         {"id": "sortBy", "options": {"sort": [{"field": "Vezes", "desc": True}]}}])
    b.add("table", "Avisos mais frequentes", [loki(
        f"topk(20, sum by (container_name, msg) (count_over_time({{{APP}}} {WARN_LINE} {MSG} [$__range])))", instant=True)],
        w=12, h=9, no_value="Nenhum aviso no período",
        transformations=[{"id": "labelsToFields", "options": {"mode": "columns"}},
                         {"id": "organize", "options": {"excludeByName": {"Time": True},
                          "renameByName": {"container_name": "Serviço", "msg": "Mensagem", "Value": "Vezes"}}},
                         {"id": "sortBy", "options": {"sort": [{"field": "Vezes", "desc": True}]}}],
        desc="Volume alto e repetido costuma ser ruído a corrigir na origem.")
    b.add("table", "Comandos que não deram certo", [sql(
        "SELECT command AS \"Comando\", outcome AS \"Resultado\", coalesce(\"errorClass\", '') AS \"Erro\", count(*) AS \"Vezes\", "
        "max(\"occurredAt\") AS \"Última vez\" FROM command_events WHERE outcome <> 'ok' AND $__timeFilter(\"occurredAt\") "
        "GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20")], w=12, h=8, no_value="Nenhum comando com erro no período",
        desc="user_error = uso errado; denied = sem permissão; error = falha do bot.")
    b.add("table", "Issues abertas no Sentry", [{"datasource": SEN, "queryType": "issues", "projectIds": [SENTRY_PROJECT_ID],
           "environments": [], "issuesQuery": "is:unresolved", "issuesSort": "freq", "issuesLimit": 20}],
          w=12, h=8, no_value="Nenhuma issue aberta no período",
          transformations=[{"id": "organize", "options": {"indexByName": {"Title": 0, "Count": 1, "Last Seen": 2, "Status": 3}}}])
    b.add("timeseries", "Respostas 5xx do backend por rota", [prom(
        "sum by (route) (increase(lucky_backend_http_server_errors_total[$__rate_interval]))", "{{route}}")],
        w=12, h=8, custom=BARS, options=TS_OPTS, no_value="0")
    b.add("state-timeline", "Extratores de música degradados", [prom(
        "max by (extractor) (lucky_music_extractor_degraded)", "{{extractor}}")], w=12, h=8, mappings=UP_MAP[:0] or [
        {"type": "value", "options": {"0": {"text": "ok", "color": GREEN}, "1": {"text": "degradado", "color": RED}}}],
        options={"showValue": "never", "legend": {"showLegend": False}}, desc="YouTube/Spotify fora ou limitados.")
    b.add("logs", "Linhas de erro (mais recentes primeiro)", [loki(f"{{{APP}}} {ERR_LINE}")], w=24, h=10,
          options={"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True})
    return b


# --------------------------------------------------------------------------- sistema
def sistema():
    b = Board("lucky-sistema", "Lucky: sistema",
              "Saúde técnica: serviços no ar, latência, memória, CPU e disco.", "now-24h", ("sistema",))
    for title, expr in [("Bot", 'max(up{job="lucky-bot"})'), ("Discord conectado", "max(lucky_bot_gateway_connected)"),
                        ("Backend", 'max(up{job="lucky-backend"})'), ("Render (cards)", 'max(up{job="lucky-render"})')]:
        b.stat(title, prom(expr, instant=True), mappings=UP_MAP, th=thresholds((RED, 0), (GREEN, 1)), w=4)
    b.stat("Ligado há", prom('min(time() - container_start_time_seconds{name="lucky-bot"})', instant=True), unit="s", w=4,
           desc="Tempo desde o último início do container do bot (deploy ou restart).")
    b.stat("Disco livre (pior partição)", prom(
        'min(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"})', instant=True),
        unit="percentunit", decimals=0, th=thresholds((RED, 0), (ORANGE, 0.1), (GREEN, 0.2)), w=4)

    b.row("Latência")
    b.add("timeseries", "Tempo de resposta dos comandos (p50 e p95)", [sql(
        "SELECT date_trunc('day', \"occurredAt\") AS time, "
        "percentile_cont(0.5) WITHIN GROUP (ORDER BY \"latencyMs\") AS \"p50\", "
        "percentile_cont(0.95) WITHIN GROUP (ORDER BY \"latencyMs\") AS \"p95\" "
        "FROM command_events WHERE $__timeFilter(\"occurredAt\") GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=8, unit="ms", custom={**LINES, "showPoints": "always"}, options=TS_OPTS,
        desc="Do comando até a resposta, por dia. Poucas amostras por dia deixam a linha instável.")
    b.add("table", "/play e outros comandos: tempo de resposta", [sql(
        "SELECT command AS \"Comando\", count(*) AS \"Amostras\", "
        "round(percentile_cont(0.5) WITHIN GROUP (ORDER BY \"latencyMs\")) AS \"p50 (ms)\", "
        "round(percentile_cont(0.95) WITHIN GROUP (ORDER BY \"latencyMs\")) AS \"p95 (ms)\" "
        "FROM command_events WHERE $__timeFilter(\"occurredAt\") GROUP BY 1 ORDER BY 2 DESC LIMIT 12")], w=12, h=8,
        overrides=[{"matcher": {"id": "byRegexp", "options": "p(50|95).*"},
                    "properties": [{"id": "custom.cellOptions", "value": {"type": "color-background"}},
                                   {"id": "thresholds", "value": thresholds((GREEN, 0), (ORANGE, 3000), (RED, 8000))}]}])
    b.add("timeseries", "Backend: tempo de resposta (p50, p95, p99)", [
        prom(f"histogram_quantile({q}, sum by (le) (rate(lucky_backend_http_request_duration_seconds_bucket[$__rate_interval])))", f"p{int(q * 100)}")
        for q in (0.5, 0.95, 0.99)], w=12, h=8, unit="s", custom=LINES, options=TS_OPTS)
    b.add("timeseries", "Backend: requisições por rota", [prom(
        'sum by (route) (rate(lucky_backend_http_requests_total{route!="/metrics"}[$__rate_interval]))', "{{route}}")],
        w=12, h=8, unit="reqps", custom=LINES, options=TS_OPTS)

    b.row("Recursos")
    b.add("timeseries", "Memória usada / limite do container", [prom(
        'max by (name) (container_memory_working_set_bytes{name=~"lucky-(bot|backend|render|postgres|redis|frontend|nginx)"} '
        '/ (container_spec_memory_limit_bytes{name=~"lucky-(bot|backend|render|postgres|redis|frontend|nginx)"} > 0))', "{{name}}")],
        w=12, h=8, unit="percentunit", custom={**LINES, "thresholdsStyle": {"mode": "dashed"}},
        th=thresholds((GREEN, 0), (ORANGE, 0.8), (RED, 0.9)), options=TS_OPTS, desc="Acima de 90% o container corre risco de OOM.")
    b.add("timeseries", "CPU por container", [prom(
        'sum by (name) (rate(container_cpu_usage_seconds_total{name=~"lucky-(bot|backend|render|postgres|redis|frontend|nginx)"}[$__rate_interval]))',
        "{{name}}")], w=12, h=8, unit="percentunit", custom=LINES, options=TS_OPTS, desc="1 = um núcleo inteiro.")
    b.add("timeseries", "Node.js: atraso do event loop (p99)", [prom("max by (job) (nodejs_eventloop_lag_p99_seconds)", "{{job}}")],
          w=8, h=8, unit="s", custom=LINES, options=TS_OPTS, desc="Acima de 100 ms o bot começa a responder devagar.")
    b.add("timeseries", "Node.js: heap usado", [prom('max by (job) (nodejs_heap_size_used_bytes{job=~"lucky-(bot|backend)"})', "{{job}}")],
          w=8, h=8, unit="bytes", custom=LINES, options=TS_OPTS)
    b.add("timeseries", "Memória do host", [prom(
        "100 * (1 - avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes))", "host")],
        w=8, h=8, unit="percent", custom={**LINES, "thresholdsStyle": {"mode": "dashed"}},
        th=thresholds((GREEN, 0), (ORANGE, 80), (RED, 90)), options=TS_OPTS)

    b.row("Coleta de métricas")
    b.add("state-timeline", "Prometheus consegue ler cada serviço", [prom(
        'max by (job) (up{job=~"lucky-.*|cadvisor|node-exporter"})', "{{job}}")], w=24, h=6,
        mappings=[{"type": "value", "options": {"0": {"text": "fora", "color": RED}, "1": {"text": "ok", "color": GREEN}}}],
        options={"showValue": "never", "legend": {"showLegend": False}},
        desc="Faixa vermelha = o Prometheus não conseguiu coletar métricas daquele serviço.")
    return b


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for build in (inicio, negocio, erros, sistema):
        board = build()
        path = OUT / f"{board.uid}.json"
        path.write_text(json.dumps(board.json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(board.panels)} panels)")
