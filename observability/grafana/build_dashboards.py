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
import re
from pathlib import Path

OUT = Path(__file__).parent / "dashboards"
GATES_SQL = Path(__file__).resolve().parents[2] / "scripts" / "music-first-gates.sql"


def shared_cte(name):
    """Return the named shared CTE from scripts/music-first-gates.sql as one line.

    The gates script is the single definition of counted joins (re-add within 30
    days counts once) and of the WAG gate weeks (ADR amendment 5); the dashboard
    embeds the very same text instead of keeping a copy. Without the trailing comma.
    """
    text = GATES_SQL.read_text(encoding="utf-8")
    m = re.search(rf"-- BEGIN SHARED {name}\n(.*?)-- END SHARED {name}\n", text, re.S)
    if not m:
        raise SystemExit(f"shared block {name!r} not found in {GATES_SQL}")
    lines = [ln.strip() for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith("--")]
    return " ".join(lines).rstrip(",")


COUNTED_JOINS = shared_cte("counted_joins")
WAG_WINDOWS = shared_cte("wag_windows")

P = {"type": "prometheus", "uid": "${ds_prometheus}"}
L = {"type": "loki", "uid": "${ds_loki}"}
PG = {"type": "grafana-postgresql-datasource", "uid": "${ds_postgres}"}
SEN = {"type": "grafana-sentry-datasource", "uid": "${ds_sentry}"}
SENTRY_PROJECT_ID = "4509260792070144"  # Sentry project "lucky"

# Operator, listing and test guilds never count as usage
# (scripts/music-first-gates.sql, decisions/2026-09-27-music-first-positioning.md).
# No quotes in the value: Grafana's SQL datasources double single quotes when
# interpolating a single-value variable, which broke ARRAY['...'] literals.
EXCLUDED = "110373943822540800,333949691962195969,1541452011466268704,1208122433819906069"
EXCL = (
    "(SELECT unnest(string_to_array('$excluidas', ',')) "
    "UNION SELECT \"discordId\" FROM guilds WHERE name ILIKE '%test%' "
    "UNION SELECT \"guildDiscordId\" FROM guild_membership_events WHERE \"guildName\" ILIKE '%test%')"
)
ACTIVITY = (
    "(SELECT \"guildId\" AS g, \"playedAt\" AS t FROM track_history "
    "UNION ALL SELECT \"guildId\", \"occurredAt\" FROM command_events WHERE \"guildId\" IS NOT NULL)"
)
APP = 'container_name=~"lucky-(bot|backend|render)"'
# Matches the line with the `[LEVEL] ` token (homelab promtail keeps it) and the
# pure JSON line (Lucky Alloy strips it, #2393), so the panels read both Lokis.
ERR_LINE = r'|~ `^\[(ERROR|FATAL|CRITICAL)\]|^\{"ts":"[^"]*","level":"(error|fatal|critical)"`'
WARN_LINE = r'|~ `^\[WARN\]|^\{"ts":"[^"]*","level":"warn"`'
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
        self.variables = []  # visible filters, after the hidden datasource variables

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
            no_value=None, decimals=None, mappings=None, custom=None, overrides=None, transformations=None, ds=None,
            min_val=None, max_val=None):
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
        if min_val is not None:
            defaults["min"] = min_val
        if max_val is not None:
            defaults["max"] = max_val
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
            # Pinned by name: the homelab Grafana also has "CoJam Postgres", which sorts first.
            ("ds_postgres", "grafana-postgresql-datasource", "/^Lucky Postgres$/"),
            ("ds_sentry", "grafana-sentry-datasource", ""),
        ]
        templating = [{"name": n, "type": "datasource", "query": q, "regex": r, "hide": 2, "refresh": 1,
                       "current": {}, "options": [], "includeAll": False, "multi": False} for n, q, r in ds_vars]
        uses_excl = any("$excluidas" in t.get("rawSql", "") for p in self.panels for t in p.get("targets", []))
        if uses_excl:
            templating.append({"name": "excluidas", "type": "constant", "query": EXCLUDED, "hide": 2,
                               "description": "Guildas do operador, de listagem e de teste: nunca contam como uso."})
        templating += self.variables
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


# Grafana's Loki frontend joins the series of an instant metric query into one
# table frame (labels as columns, "Value #A"), so bargauge/stat with values=False
# show only the last row. Top lists are tables; per-row panels set values=True.
def top_table(title, expr, no_value, color, desc=""):
    return dict(ptype="table", title=title, targets=[loki(expr, instant=True)], w=12, h=10, desc=desc,
                no_value=no_value, th=thresholds((color, 0)),
                options={"showHeader": True, "cellHeight": "sm", "footer": {"show": False}},
                transformations=[
                    {"id": "organize", "options": {"excludeByName": {"Time": True},
                                                   "renameByName": {"container_name": "Serviço", "msg": "Mensagem", "Value #A": "Vezes"},
                                                   "indexByName": {"container_name": 0, "msg": 1, "Value #A": 2}}},
                    {"id": "sortBy", "options": {"sort": [{"field": "Vezes", "desc": True}]}}],
                overrides=[{"matcher": {"id": "byName", "options": "Vezes"},
                            "properties": [{"id": "custom.width", "value": 110}, {"id": "custom.cellOptions", "value": {"type": "color-text"}}]},
                           {"matcher": {"id": "byName", "options": "Serviço"}, "properties": [{"id": "custom.width", "value": 130}]}])


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
        "- **[Lucky: produto](/d/lucky-produto)**: guildas ativas por dia, semana e mês, retenção D1/D7/D30, comandos por guilda.\n"
        "- **[Lucky: erros](/d/lucky-erros)**: erros nos logs, comandos que falharam, 5xx, Sentry, alertas.\n"
        "- **[Lucky: sistema](/d/lucky-sistema)**: serviços no ar, memória, CPU, latência, disco.\n"
        "- **[Lucky: logs](/d/lucky-logs)**: linhas de log com filtros (serviço, nível, guildId, userId, correlationId, texto).\n\n"
        "Guildas do operador, de listagem e de teste ficam fora das contas de uso."), h=7)
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
        "Metas do music-first (leitura em **28/12/2026**, decisão até **17/01/2027**): **WAG ≥ 20** por 3 semanas, **≥ 35%** das guildas novas ouvem música na 1ª hora, "
        "**≥ 15%** ainda ativas no dia 8. Guildas do operador, de listagem e de teste não contam. "
        "`track_history` guarda só 30 dias, então janelas maiores que 30 dias subcontam plays."), h=3)

    b.row("Metas do music-first")
    b.stat("WAG (7 dias)", sql(WAG_7D), th=thresholds((RED, 0), (ORANGE, 10), (GREEN, 20)), w=4,
           desc="Guildas com faixa tocada ou comando nos últimos 7 dias.")
    cohort = (
        f"WITH {COUNTED_JOINS}, joins AS (SELECT g, t FROM counted_joins WHERE t > now() - interval '28 days'), "
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
        f"WITH {COUNTED_JOINS} SELECT count(*) AS \"Entradas\" FROM counted_joins WHERE $__timeFilter(t) AND g NOT IN {EXCL}"), w=3,
        desc="Entradas contadas: reentrada em até 30 dias conta uma vez (emenda 5 do ADR). Mesma definição de scripts/music-first-gates.sql.")
    b.stat("Saíram (período)", sql(
        f"SELECT count(*) AS \"Saídas\" FROM guild_membership_events WHERE kind = 'LEAVE' AND $__timeFilter(\"occurredAt\") "
        f"AND \"guildDiscordId\" NOT IN {EXCL}"), w=3,
        th=thresholds((GREEN, 0), (ORANGE, 1)))
    b.add("table", "WAG nas semanas da decisão (meta: 20 nas 3)", [sql(
        f"WITH {WAG_WINDOWS}, activity AS (SELECT date_trunc('week', t)::date AS wk, g FROM {ACTIVITY} x "
        f"WHERE t >= (SELECT min(week_start) FROM wag_windows)) "
        f"SELECT w.week_start AS \"Semana (início)\", w.week_start + 6 AS \"Semana (fim)\", count(DISTINCT a.g) AS \"WAG\", "
        f"count(DISTINCT a.g) >= 20 AS \"Meta ≥ 20\", w.week_start + 7 <= now()::date AS \"Fechada\" "
        f"FROM wag_windows w LEFT JOIN activity a ON a.wk = w.week_start AND a.g NOT IN {EXCL} "
        f"GROUP BY w.week_start ORDER BY w.week_start")], w=12, h=5,
        desc="Semanas segunda a domingo que terminam em 29/11, 06/12 e 13/12/2026 (emenda 5 do ADR). Mesma definição de scripts/music-first-gates.sql. "
             "Semana não fechada ainda lê baixo.")
    b.add("timeseries", "WAG por semana (últimas 4 semanas)", [sql(
        f"SELECT date_trunc('week', t) AS time, count(DISTINCT g) AS \"Guildas ativas\" FROM {ACTIVITY} a "
        f"WHERE t >= date_trunc('week', now()) - interval '3 weeks' AND g NOT IN {EXCL} GROUP BY 1 ORDER BY 1", "time_series")],
        w=12, h=8, custom={**BARS, "stacking": {"mode": "none"}, "thresholdsStyle": {"mode": "dashed"}},
        th=thresholds((RED, 0), (GREEN, 20)), options=TS_OPTS,
        desc="Semana começa na segunda (UTC). A linha tracejada é a meta de 20.")
    b.add("table", "Guildas novas por semana de entrada (28 dias)", [sql(
        f"WITH {COUNTED_JOINS}, joins AS (SELECT g, t FROM counted_joins WHERE t > now() - interval '28 days') "
        "SELECT date_trunc('week', j.t)::date AS \"Semana\", count(*) AS \"Entraram\", "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g "
        "AND th.\"playedAt\" BETWEEN j.t AND j.t + interval '1 hour')) AS \"Tocaram na 1ª hora\", "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g)) AS \"Já tocaram\" "
        f"FROM joins j WHERE j.g NOT IN {EXCL} GROUP BY 1 ORDER BY 1 DESC")], w=12, h=8)

    b.add("table", "Entradas e 1ª hora por origem (28 dias)", [sql(
        "WITH joins AS (SELECT \"guildDiscordId\" AS g, min(\"occurredAt\") AS t FROM guild_membership_events "
        "WHERE kind = 'JOIN' GROUP BY 1 HAVING min(\"occurredAt\") > now() - interval '28 days' "
        "AND min(\"occurredAt\") <= now() - interval '1 hour') "
        "SELECT coalesce(s.source, 'sem origem') AS \"Origem\", count(*) AS \"Entraram\", "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g "
        "AND th.\"playedAt\" BETWEEN j.t AND j.t + interval '1 hour')) AS \"Tocaram na 1ª hora\" "
        "FROM joins j LEFT JOIN guild_join_sources s ON s.\"guildDiscordId\" = j.g "
        f"WHERE j.g NOT IN {EXCL} GROUP BY 1 ORDER BY 2 DESC")], w=12, h=8,
        desc="Origem vem do parâmetro state do OAuth de /add (topgg, discordbotlist, botsgg, meta, landing, github, reddit, bot, recap, dashboard, unknown). "
             "Joins anteriores a #2750 ou sem origem gravada aparecem como 'sem origem' (entraram por outro link ou antes do rastreio). Só entram joins com mais de 1 hora (a 1ª hora ainda não fechou para os mais novos).")

    b.row("Funil de ativação (período)")
    # Same base as "Entraram (período)": counted_joins minus EXCL over the dashboard time range.
    # track_history keeps 30 days (no per-guild cap since #2678): a first hour older than that is unknown.
    trimmed = "(j.t + interval '1 hour' < now() - interval '30 days')"
    # next_t is the guild's next counted join, computed before the period filter, so an event
    # or play after a later join is never credited to an earlier one (events keep a 5 minute
    # lower slack: the onboarding message can land just before the JOIN row is written).
    ev_bound = "AND a.\"occurredAt\" < coalesce(j.next_t, 'infinity'::timestamp)"
    funnel_base = (
        f"WITH {COUNTED_JOINS}, cj AS (SELECT g, t, lead(t) OVER (PARTITION BY g ORDER BY t) AS next_t FROM counted_joins), "
        "joins AS (SELECT g, t, next_t FROM cj "
        f"WHERE $__timeFilter(t) AND g NOT IN {EXCL}), "
        "f0 AS (SELECT j.g, j.t, "
        f"EXISTS (SELECT 1 FROM activation_events a WHERE a.\"guildDiscordId\" = j.g AND a.kind = 'onboarding_delivered' AND a.\"occurredAt\" >= j.t - interval '5 minutes' {ev_bound}) AS delivered, "
        f"EXISTS (SELECT 1 FROM activation_events a WHERE a.\"guildDiscordId\" = j.g AND a.kind = 'station_click' AND a.\"occurredAt\" >= j.t - interval '5 minutes' {ev_bound}) AS clicked, "
        "EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g AND th.\"playedAt\" BETWEEN j.t AND j.t + interval '1 hour') "
        f"AS heard, {trimmed} AS h1_trimmed, "
        "(SELECT count(*) FROM track_history th WHERE th.\"guildId\" = j.g AND th.\"playedAt\" BETWEEN j.t AND least(j.t + interval '7 days', coalesce(j.next_t, 'infinity'::timestamp))) >= 5 AS plays5, "
        "(EXISTS (SELECT 1 FROM track_history th WHERE th.\"guildId\" = j.g AND th.\"playedAt\" >= j.t + interval '7 days' AND th.\"playedAt\" < coalesce(j.next_t, 'infinity'::timestamp)) "
        "OR EXISTS (SELECT 1 FROM command_events ce WHERE ce.\"guildId\" = j.g AND ce.\"occurredAt\" >= j.t + interval '7 days' AND ce.\"occurredAt\" < coalesce(j.next_t, 'infinity'::timestamp))) AS d8, "
        "j.t <= now() - interval '1 hour' AS el1, j.t <= now() - interval '7 days' AS el7, j.t <= now() - interval '8 days' AS el8 "
        "FROM joins j), "
        "f AS (SELECT g, delivered, delivered AND clicked AS clicked, heard, heard AND plays5 AS plays5, heard AND plays5 AND d8 AS d8, h1_trimmed, el1, el7, el8 FROM f0) ")
    b.add("bargauge", "Funil de ativação por guilda (período)", [sql(funnel_base +
        "SELECT '1. Entraram' AS \"Etapa\", count(*) AS \"Guildas\" FROM f "
        "UNION ALL SELECT '2. Onboarding entregue', count(*) FILTER (WHERE delivered) FROM f "
        "UNION ALL SELECT '3. Clicou na estação', count(*) FILTER (WHERE clicked) FROM f "
        "UNION ALL SELECT '4. Tocou na 1ª hora', count(*) FILTER (WHERE el1 AND heard) FROM f "
        "UNION ALL SELECT '4b. 1ª hora desconhecida (fora dos 30 dias)', count(*) FILTER (WHERE el1 AND NOT heard AND h1_trimmed) FROM f "
        "UNION ALL SELECT '5. 5+ faixas em 7 dias', count(*) FILTER (WHERE el7 AND plays5) FROM f "
        "UNION ALL SELECT '6. Ativa no dia 8', count(*) FILTER (WHERE el8 AND d8) FROM f "
        "ORDER BY 1")], w=14, h=9, th=thresholds(("blue", 0)),
        options={"displayMode": "basic", "orientation": "horizontal", "showUnfilled": True,
                 "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True}},
        desc="Funil aninhado: guildas distintas entre as entradas contadas do período (mesma base de 'Entraram (período)': "
             "reentrada em até 30 dias conta uma vez, guildas excluídas fora). Clicou exige onboarding entregue; 5+ faixas exige a 1ª hora; "
             "dia 8 exige 5+ faixas. A etapa 4 conta a 1ª hora de forma independente do clique, então pode passar da etapa 3. "
             "Elegibilidade por etapa (como em scripts/music-first-gates.sql): a etapa 4 só conta entradas com mais de 1 hora, "
             "a 5 com mais de 7 dias e a 6 com mais de 8 dias; entradas mais recentes ficam fora do numerador dessas etapas "
             "(mas contam na etapa 1), então as etapas 4 a 6 sobem conforme as entradas amadurecem. "
             "Eventos e plays só valem até a próxima entrada contada da mesma guilda. "
             "A etapa 1 continua igual a 'Entraram (período)'. A etapa 4b conta guildas cuja 1ª hora passou dos 30 dias de retenção de track_history (regra h1_trimmed de scripts/music-first-gates.sql): "
             "elas podem ter tocado na 1ª hora, mas essas linhas já foram apagadas. A taxa da 1ª hora é etapa 4 / (etapa 1 elegível menos etapa 4b), como no gate. "
             "Etapas 2 e 3 vêm de activation_events, que só existe a partir do deploy desta instrumentação.")
    b.stat("Tempo até o primeiro áudio", sql(
        f"WITH {COUNTED_JOINS}, cj AS (SELECT g, t, lead(t) OVER (PARTITION BY g ORDER BY t) AS next_t FROM counted_joins), "
        f"joins AS (SELECT g, t, next_t FROM cj WHERE $__timeFilter(t) AND g NOT IN {EXCL}), "
        "first_play AS (SELECT j.g, greatest(0, extract(epoch FROM min(th.\"playedAt\" - coalesce(th.\"playDuration\", 0) * interval '1 second') - j.t)) AS secs FROM joins j "
        "JOIN track_history th ON th.\"guildId\" = j.g AND th.\"playedAt\" >= j.t AND th.\"playedAt\" < coalesce(j.next_t, 'infinity'::timestamp) "
        f"WHERE NOT {trimmed} GROUP BY j.g, j.t) "
        "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS \"p50\", "
        "percentile_cont(0.9) WITHIN GROUP (ORDER BY secs) AS \"p90\" FROM first_play"),
        unit="s", decimals=0, w=10, h=9, no_value="sem plays", show_names=True,
        desc="Mediana (p50) e percentil 90 do intervalo entre a entrada contada e o início da primeira faixa tocada, nas guildas do período que já tocaram algo. "
             "track_history grava a linha quando a faixa termina ou é pulada, não quando começa; o início é estimado como playedAt menos playDuration (segundos tocados; sem valor, conta como 0 e o tempo inclui a faixa inteira). "
             "Guildas cuja 1ª hora passou dos 30 dias de retenção (h1_trimmed) ficam fora, porque a primeira faixa delas já foi apagada. "
             "Quem nunca tocou fica fora (veja a etapa 4 do funil). A etapa 4 do funil usa playedAt puro, igual ao gate do ADR.")

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
                           "pieType": "donut", "reduceOptions": {"calcs": ["lastNotNull"], "values": True}},
        desc="Fonte real do stream de cada faixa (YouTube, SoundCloud...).")

    b.row("Convites e votos (atribuição aproximada)")
    b.stat("Cliques em /invite (período)", sql(
        "SELECT count(*) AS \"Cliques\" FROM invite_clicks WHERE $__timeFilter(\"occurredAt\")"), w=4,
        no_value="sem cliques",
        desc="Cada acesso ao link /invite do Lucky (#2395). Normal: sobe quando há divulgação; zero por dias seguidos com listagens ativas é estranho.")
    b.add("table", "Cliques e entradas por origem (aproximado)", [sql(
        "WITH joins AS (SELECT \"guildDiscordId\" AS g, \"occurredAt\" AS t FROM guild_membership_events "
        f"WHERE kind = 'JOIN' AND $__timeFilter(\"occurredAt\") AND \"guildDiscordId\" NOT IN {EXCL}), "
        "m AS (SELECT coalesce((SELECT coalesce(c.\"utmSource\", 'sem utm') FROM invite_clicks c "
        "WHERE c.\"occurredAt\" <= j.t AND c.\"occurredAt\" > j.t - interval '10 minutes' AND $__timeFilter(c.\"occurredAt\") "
        "ORDER BY c.\"occurredAt\" DESC LIMIT 1), 'sem clique antes') AS src FROM joins j), "
        "a AS (SELECT src, count(*) AS n FROM m GROUP BY 1), "
        "c AS (SELECT coalesce(\"utmSource\", 'sem utm') AS src, count(*) AS n FROM invite_clicks "
        "WHERE $__timeFilter(\"occurredAt\") GROUP BY 1) "
        "SELECT coalesce(c.src, a.src) AS \"Origem (utm_source)\", coalesce(c.n, 0) AS \"Cliques\", "
        "coalesce(a.n, 0) AS \"Entradas atribuídas (aprox.)\", "
        "round(100.0 * a.n / nullif(c.n, 0), 1) AS \"Conversão aprox. (%)\" "
        "FROM c FULL JOIN a ON a.src = c.src ORDER BY 2 DESC, 3 DESC")], w=12, h=8,
        no_value="sem cliques nem entradas no período",
        desc="APROXIMADO: cada entrada de servidor é ligada ao clique em /invite mais recente nos 10 minutos antes dela, "
             "sem confirmar que foi a mesma pessoa. 'sem clique antes' = a entrada veio por outro caminho (link direto do Discord, "
             "listagem com link próprio). Normal: a maioria das entradas com clique antes vem das listagens. Preocupante: muitos "
             "cliques de uma origem e nenhuma entrada (link quebrado ou permissão recusada). A origem exata, quando existe, está "
             "em 'Entradas e 1ª hora por origem'.")
    b.add("timeseries", "Votos no top.gg por dia", [sql(
        "SELECT date_trunc('day', \"occurredAt\") AS time, count(*) FILTER (WHERE NOT \"isWeekend\") AS \"Votos\", "
        "count(*) FILTER (WHERE \"isWeekend\") AS \"Votos de fim de semana (valem 2)\" FROM topgg_vote_events "
        "WHERE $__timeFilter(\"occurredAt\") GROUP BY 1 ORDER BY 1", "time_series")],
        w=8, h=8, custom=BARS, options=TS_OPTS, no_value="sem votos no período",
        desc="Cada voto aceito no top.gg (#2395); votos repetidos em menos de 12 horas não contam. Normal: alguns por dia, "
             "mais no fim de semana. Preocupante: zero por vários dias quando antes havia votos (webhook do top.gg quebrado). "
             "O histórico começa no deploy desta tabela.")

    b.row("Gatilhos YouTube-off")
    b.add("gauge", "WAG (7 dias) vs limite 100", [sql(WAG_7D)],
          w=12, h=7, min_val=0, max_val=100,
          th=thresholds((GREEN, 0), (ORANGE, 70), (RED, 90)),
          options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                   "orientation": "auto", "showThresholdLabels": True, "showThresholdMarkers": True},
          desc="WAG (janela móvel de 7 dias) ≥ 100 aciona o desligamento do YouTube (decisão 2027-01-17). "
               "Laranja a 70 (70 % do limite), vermelho a 90.")
    b.add("gauge", "Servidores vs limite 1.000", [prom('max(lucky_bot_guilds_total{state="active"})', instant=True)],
          w=12, h=7, min_val=0, max_val=1000,
          th=thresholds((GREEN, 0), (ORANGE, 700), (RED, 900)),
          options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                   "orientation": "auto", "showThresholdLabels": True, "showThresholdMarkers": True},
          desc="1.000 servidores ativos aciona o desligamento do YouTube (decisão 2027-01-17). "
               "Laranja a 700 (70 % do limite), vermelho a 900.")
    return b


# --------------------------------------------------------------------------- produto
def pg_var(name, label, query, desc):
    """Visible dropdown fed by Postgres, with an "All" entry whose raw value is 'todas'.

    Values are Discord ids or command names (no quotes possible), so panels use
    ${name:raw} inside quotes; allowCustomValue is off so only listed values exist.
    """
    return {"name": name, "label": label, "description": desc, "type": "query", "datasource": PG,
            "query": query, "definition": query, "refresh": 2, "sort": 1, "hide": 0,
            "includeAll": True, "allValue": "todas", "multi": False, "allowCustomValue": False,
            "current": {"selected": True, "text": "All", "value": "$__all"}, "options": []}


def produto():
    b = Board("lucky-produto", "Lucky: produto",
              "Quantas guildas usam o Lucky, quantas voltam e quais comandos usam. Fonte: Postgres (somente leitura).",
              "now-30d", ("produto",))
    b.variables = [
        pg_var("guilda", "Guilda",
               "SELECT \"discordId\" AS __value, coalesce(name, \"discordId\") AS __text FROM guilds ORDER BY 2",
               "Filtra os painéis de comandos por uma guilda."),
        pg_var("comando", "Comando",
               "SELECT DISTINCT command FROM command_events WHERE \"guildId\" IS NOT NULL AND \"occurredAt\" > now() - interval '180 days' ORDER BY 1",
               "Filtra os painéis de comandos por um comando."),
    ]
    flt = ("('${guilda:raw}' = 'todas' OR ce.\"guildId\" = '${guilda:raw}') "
           "AND ('${comando:raw}' = 'todas' OR ce.command = '${comando:raw}')")
    b.text("Leia antes", (
        "**Guilda ativa** = tocou uma faixa ou usou um comando. Guildas do operador, de listagem e de teste não contam. "
        "Não há contagem de pessoas: o Grafana não lê ids de usuário (privacidade). `track_history` guarda só 30 dias e "
        "`command_events` 180 dias, então janelas antigas contam só comandos. Funil de ativação e metas do music-first: "
        "[Lucky: negócio](/d/lucky-negocio). Os filtros **Guilda** e **Comando** no topo valem para a seção Comandos."), h=3)

    b.row("Guildas ativas")
    for title, days, desc in [
        ("Ativas nas últimas 24 h", 1, "Normal: acompanha o WAG. Zero com o bot no ar é preocupante (ninguém conseguiu usar)."),
        ("Ativas em 7 dias", 7, "Mesmo número do WAG (7 dias) do dashboard negócio."),
        ("Ativas em 30 dias", 30, "Base de guildas que usaram o Lucky no último mês."),
    ]:
        b.stat(title, sql(
            f"SELECT count(DISTINCT g) AS \"Guildas\" FROM {ACTIVITY} a WHERE t >= now() - interval '{days} days' AND g NOT IN {EXCL}"),
            w=6, desc=desc)
    b.stat("Fidelidade (diárias / mensais)", sql(
        f"SELECT round(100.0 * count(DISTINCT g) FILTER (WHERE t >= now() - interval '1 day') "
        f"/ nullif(count(DISTINCT g), 0), 1) AS \"DAU/MAU (%)\" FROM {ACTIVITY} a "
        f"WHERE t >= now() - interval '30 days' AND g NOT IN {EXCL}"),
        unit="percent", th=thresholds((RED, 0), (ORANGE, 10), (GREEN, 20)), w=6,
        desc="Parte das guildas ativas no mês que usaram o Lucky nas últimas 24 h. Acima de 20% é bom; abaixo de 10% quer dizer "
             "que a maioria usa uma vez e some.")
    b.add("timeseries", "Guildas ativas por dia, semana e mês", [sql(
        f"WITH a AS (SELECT g, t FROM {ACTIVITY} x WHERE t >= $__timeFrom()::timestamp - interval '30 days' AND g NOT IN {EXCL}), "
        "d AS (SELECT generate_series(date_trunc('day', $__timeFrom()::timestamp), date_trunc('day', $__timeTo()::timestamp), "
        "interval '1 day') AS day) "
        "SELECT d.day AS time, "
        "(SELECT count(DISTINCT g) FROM a WHERE t >= d.day AND t < d.day + interval '1 day') AS \"Diárias\", "
        "(SELECT count(DISTINCT g) FROM a WHERE t >= d.day - interval '6 days' AND t < d.day + interval '1 day') AS \"Semanais (7 dias)\", "
        "(SELECT count(DISTINCT g) FROM a WHERE t >= d.day - interval '29 days' AND t < d.day + interval '1 day') AS \"Mensais (30 dias)\" "
        "FROM d ORDER BY 1", "time_series")],
        w=24, h=8, custom=LINES, options=TS_OPTS,
        desc="Para cada dia: guildas ativas naquele dia, nos 7 e nos 30 dias até ele. Normal: as três linhas sobem juntas. "
             "Mensais subindo e diárias paradas = guildas novas que não voltam. Antes de 30 dias atrás só os comandos contam.")

    b.row("Retenção")
    b.add("table", "Retenção por semana de entrada (D1, D7, D30)", [sql(
        f"WITH {COUNTED_JOINS}, j AS (SELECT g, t FROM counted_joins WHERE t > now() - interval '120 days' AND g NOT IN {EXCL}), "
        f"r AS (SELECT j.t, "
        + ", ".join(
            f"j.t <= now() - interval '{n} days' AS e{n}, "
            f"EXISTS (SELECT 1 FROM {ACTIVITY} a WHERE a.g = j.g AND a.t >= j.t + interval '{n} days') AS d{n}"
            for n in (1, 7, 30))
        + " FROM j) "
        "SELECT date_trunc('week', t)::date AS \"Semana de entrada\", count(*) AS \"Entraram\", "
        + ", ".join(
            f"round(100.0 * count(*) FILTER (WHERE e{n} AND d{n}) / nullif(count(*) FILTER (WHERE e{n}), 0), 1) AS \"D{n} (%)\""
            for n in (1, 7, 30))
        + " FROM r GROUP BY 1 ORDER BY 1 DESC")], w=24, h=9, no_value="sem guildas novas nos últimos 120 dias",
        overrides=[{"matcher": {"id": "byRegexp", "options": "D[0-9]+ \\(%\\)"},
                    "properties": [{"id": "unit", "value": "percent"},
                                   {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                   {"id": "thresholds", "value": thresholds((RED, 0), (ORANGE, 10), (GREEN, 20))}]}],
        desc="Guildas que entraram em cada semana (entrada contada: reentrada em até 30 dias conta uma vez) e a parte que voltou a "
             "tocar ou usar comando a partir do dia 1, 7 e 30 depois da entrada. Vazio = a semana ainda não chegou naquele dia. "
             "Normal: D1 > D7 > D30. D7 abaixo de 10% em várias semanas seguidas é preocupante (a meta do music-first é 15% no dia 8).")

    b.row("Comandos (filtros Guilda e Comando)")
    b.add("timeseries", "Comandos por dia", [sql(
        "SELECT date_trunc('day', ce.\"occurredAt\") AS time, count(*) FILTER (WHERE ce.outcome = 'ok') AS \"Deram certo\", "
        "count(*) FILTER (WHERE ce.outcome <> 'ok') AS \"Não deram certo\" FROM command_events ce "
        f"WHERE $__timeFilter(ce.\"occurredAt\") AND ce.\"guildId\" IS NOT NULL AND ce.\"guildId\" NOT IN {EXCL} AND {flt} GROUP BY 1 ORDER BY 1",
        "time_series")], w=12, h=8, custom=BARS, options=TS_OPTS, no_value="nenhum comando no período",
        overrides=[{"matcher": {"id": "byName", "options": "Não deram certo"},
                    "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": ORANGE}}]}],
        desc="Barras laranja = uso errado, sem permissão ou falha (detalhe em Lucky: erros). Normal: laranja pequeno perto do verde.")
    b.add("table", "Comandos mais usados", [sql(
        "SELECT ce.command AS \"Comando\", count(*) AS \"Usos\", count(DISTINCT ce.\"guildId\") AS \"Guildas\", "
        "round(100.0 * count(*) FILTER (WHERE ce.outcome <> 'ok') / count(*), 1) AS \"Não deram certo (%)\" "
        f"FROM command_events ce WHERE $__timeFilter(ce.\"occurredAt\") AND ce.\"guildId\" IS NOT NULL AND ce.\"guildId\" NOT IN {EXCL} AND {flt} "
        "GROUP BY 1 ORDER BY 2 DESC LIMIT 20")], w=12, h=8, no_value="nenhum comando no período",
        desc="Mais de 10% que não deram certo num comando costuma ser texto de ajuda confuso ou um bug.")
    b.add("table", "Guildas que mais usam comandos", [sql(
        "SELECT coalesce(gu.name, ce.\"guildId\") AS \"Guilda\", ce.\"guildId\" AS \"Id\", count(*) AS \"Comandos\", count(DISTINCT ce.command) AS \"Comandos diferentes\", "
        "max(ce.\"occurredAt\") AS \"Último uso\" FROM command_events ce LEFT JOIN guilds gu ON gu.\"discordId\" = ce.\"guildId\" "
        f"WHERE $__timeFilter(ce.\"occurredAt\") AND ce.\"guildId\" IS NOT NULL AND ce.\"guildId\" NOT IN {EXCL} AND {flt} "
        "GROUP BY ce.\"guildId\", gu.name ORDER BY 3 DESC LIMIT 20")], w=24, h=9, no_value="nenhum comando no período",
        desc="Uma guilda com muito mais comandos que as outras pode ser um teste ou uso automatizado.")
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
           "statsOutcome": ["accepted"], "statsInterval": "1h"}], w=4, h=4,
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

    t = top_table("Mensagens de erro mais frequentes",
                  f"topk(15, sum by (container_name, msg) (count_over_time({{{APP}}} {ERR_LINE} {MSG} [$__range])))",
                  "Nenhum erro no período", RED)
    b.add(t.pop("ptype"), t.pop("title"), t.pop("targets"), **t)
    t = top_table("Avisos mais frequentes",
                  f"topk(15, sum by (container_name, msg) (count_over_time({{{APP}}} {WARN_LINE} {MSG} [$__range])))",
                  "Nenhum aviso no período", ORANGE, desc="Volume alto e repetido costuma ser ruído a corrigir na origem.")
    b.add(t.pop("ptype"), t.pop("title"), t.pop("targets"), **t)
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
        options={"showValue": "auto", "legend": {"showLegend": False}},
        desc="YouTube/Spotify fora ou limitados. Verde \"ok\" = funcionando; vermelho = degradado.")
    failed = ('(sum(increase(lucky_bot_play_stage_seconds_count{stage="bridge_total",outcome="fail"}[15m])) or vector(0)) '
              '- (sum(increase(lucky_bot_play_rescued_total[15m])) or vector(0))')
    b.add("timeseries", "Plays que falharam (% do total)", [prom(
        f'({failed}) / sum(increase(lucky_bot_play_stage_seconds_count{{stage="bridge_total"}}[15m]))', "plays que falharam")],
        w=12, h=8, unit="percentunit", min_val=0, max_val=1, th=thresholds((GREEN, 0), (RED, 0.5)),
        custom={**LINES, "thresholdsStyle": {"mode": "line"}}, options=TS_OPTS,
        desc="Parcela dos /play em que o bridge esgotou todas as etapas (YouTube e SoundCloud), em janela de 15 min, "
             "sem contar os que o fallback resgatou. Mesma conta do alerta LuckyPlayFailureRateHigh (#3079).")
    b.add("timeseries", "Falhas de extração por classe", [
        prom("sum by (type) (increase(lucky_bot_extraction_failures_total[$__rate_interval]))", "yt-dlp: {{type}}"),
        prom('sum(increase(lucky_bot_play_stage_seconds_count{stage="bridge_total",outcome="fail"}[$__rate_interval]))',
             "plays que esgotaram todas as etapas")],
        w=12, h=8, custom={**BARS, "stacking": {"mode": "none"}}, options=TS_OPTS, no_value="0",
        desc="Plays que esgotaram todas as etapas, e falhas do yt-dlp por classe (forbidden = HTTP 403, botcheck = "
             "\"not a bot\", empty, timeout, other). forbidden e botcheck abrem o breaker do yt-dlp.")
    b.add("timeseries", "Faixas que podem ter repetido", [
        prom('sum by (outcome) (increase(lucky_bot_session_restore_total{outcome=~"restored|late_restored"}[$__rate_interval]))',
             "sessão restaurada após restart ({{outcome}})"),
        prom("sum(increase(lucky_bot_autoplay_history_replay_tracks_total[$__rate_interval]))",
             "autoplay repetiu do histórico")],
        w=24, h=8, custom={**BARS, "stacking": {"mode": "none"}}, options=TS_OPTS, no_value="0",
        desc="Sessão restaurada: depois de um restart o bot volta a tocar a faixa atual (#3151). "
             "Autoplay repetiu do histórico: nenhuma sugestão foi escolhida (fontes vazias ou todas rejeitadas) e o "
             "autoplay recolocou faixas que a guilda já ouviu. Barras aqui costumam virar um relato de "
             "\"o bot está repetindo músicas\".")
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
           th=thresholds(("text", 0)),
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
    b.add("timeseries", "/play por etapa (p50 e p95)", [
        prom(f"histogram_quantile({q}, sum by (le, stage) (rate(lucky_bot_play_stage_seconds_bucket[$__rate_interval])))", f"{{{{stage}}}} p{int(q * 100)}")
        for q in (0.5, 0.95)], w=24, h=8, unit="s", custom=LINES, options=TS_OPTS,
        desc="Onde o /play gasta tempo: yt-dlp por URL, yt-dlp por busca, SoundCloud (cada tentativa) e o total da ponte. Etapas que falham também contam.")

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

    b.row("Sonda de play")
    b.add("state-timeline", "Sonda de play por caso", [prom("max by (case) (lucky_bot_probe_success)", "{{case}}")],
          w=12, h=8, mappings=[{"type": "value", "options": {"0": {"text": "falhou", "color": RED}, "1": {"text": "ok", "color": GREEN}}}],
          options={"showValue": "never", "legend": {"showLegend": False}},
          desc="A cada 15 min (e 2 min depois de cada deploy) o bot resolve e abre o stream de casos fixos, sem entrar em "
               "canal de voz. Duas falhas seguidas no mesmo caso disparam LuckyPlayProbeFailing (#2920).")
    b.add("timeseries", "Sonda: tempo por etapa", [prom("max by (case, stage) (lucky_bot_probe_duration_seconds)", "{{case}} {{stage}}")],
          w=12, h=8, unit="s", custom=LINES, options=TS_OPTS,
          desc="Última vez que cada etapa rodou: resolve (busca) e first_byte (primeiros bytes do stream). "
               "Um caso que falha no resolve fica sem first_byte.")
    return b


# --------------------------------------------------------------------------- logs
def custom_var(name, label, options, all_value, desc):
    """Visible dropdown; options are "texto : valor" pairs (Grafana custom variable syntax)."""
    for o in options:
        if "," in o:
            raise SystemExit(f"custom variable {name!r}: Grafana splits options on commas, {o!r} has one")
    return {"name": name, "label": label, "description": desc, "type": "custom", "query": ",".join(options),
            "includeAll": True, "allValue": all_value, "multi": False, "hide": 0,
            "current": {"selected": True, "text": "All", "value": "$__all"}, "options": []}


def text_var(name, label, desc):
    return {"name": name, "label": label, "description": desc, "type": "textbox", "query": "", "hide": 0,
            "current": {"selected": False, "text": "", "value": ""}, "options": []}


def level_re(levels):
    """Line regex for the given lower-case levels, with or without the `[LEVEL] ` token.

    No comma in it: Grafana splits custom-variable options on commas, so the separator
    between the "ts" and "level" keys is matched with `.` instead of a literal comma.
    """
    return r'(?i)^\[(' + levels + r')\] |^\{"ts":"[^"]*"."level":"(' + levels + r')"'


def logs():
    b = Board("lucky-logs", "Lucky: logs",
              "Linhas de log do bot, backend e render, com filtros. Fonte: Loki. Nada para digitar além dos filtros no topo.",
              "now-6h", ("logs",))
    b.variables = [
        custom_var("servico", "Serviço", ["bot : lucky-bot", "backend : lucky-backend", "render : lucky-render"],
                   "lucky-(bot|backend|render)", "Qual serviço mostrar."),
        # Each value is the whole line regex, so "All" can be `.*` and keep lines with no level
        # (a crash trace, pretty-format output). Same dual form as ERR_LINE: `[LEVEL] {json}`
        # (homelab promtail) or the pure JSON line (Lucky Alloy).
        custom_var("nivel", "Nível", [f"{t} : {level_re(v)}" for t, v in (
            ("erro", "error|fatal|critical"), ("aviso", "warn"), ("info", "info"), ("debug", "debug"))],
                   ".*", "Gravidade da linha."),
        text_var("guildId", "guildId", "Id do servidor (Discord). Vazio = todos."),
        text_var("userId", "userId", "Id do usuário (Discord). Vazio = todos."),
        text_var("correlationId", "correlationId", "Id de uma requisição, para seguir tudo o que ela fez."),
        text_var("busca", "Texto", "Trecho de texto que a linha precisa ter (diferencia maiúsculas). Vazio = tudo."),
    ]
    level = "|~ `$nivel`"
    ids = "|= `$guildId` |= `$userId` |= `$correlationId` |= `$busca`"
    sel = '{container_name=~"$servico"}'
    b.text("Como usar", (
        "Escolha **Serviço** e **Nível** e, se quiser, cole um **guildId**, **userId**, **correlationId** ou um trecho de "
        "**Texto** nas caixas do topo; o painel de linhas usa todos os filtros (a descrição de cada painel diz quais usa). Para ver tudo o que uma requisição fez, "
        "cole o `correlationId` de uma linha (abra a linha para ver os campos) e olhe **Seguir uma requisição**. "
        "Os logs guardam 30 dias."), h=3)
    b.add("timeseries", "Erros por minuto por serviço", [loki(
        f"sum by (container_name) (rate({sel} {ERR_LINE} [$__auto])) * 60", "{{container_name}}")],
        w=24, h=7, custom=LINES, options=TS_OPTS, no_value="0", decimals=1,
        desc="Média de linhas de erro por minuto (ignora o filtro Nível). Normal: perto de zero, com picos curtos em deploy. "
             "Preocupante: um patamar que não volta a zero ou um serviço que de repente passa dos outros.")
    b.add("logs", "Linhas de log (mais recentes primeiro)", [loki(f"{sel} {level} {ids}")], w=24, h=14,
          options={"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True,
                   "prettifyLogMessage": False, "dedupStrategy": "none"},
          desc="Até 1000 linhas que passam por todos os filtros do topo. Clique numa linha para ver os campos "
               "(guildId, userId, correlationId, error).")
    b.row("Seguir uma requisição")
    b.add("logs", "Seguir uma requisição (correlationId)", [loki(
        '{container_name=~"lucky-(bot|backend|render)"} |= `"correlationId":"$correlationId"`')], w=24, h=12,
          options={"showTime": True, "wrapLogMessage": True, "sortOrder": "Ascending", "enableLogDetails": True,
                   "prettifyLogMessage": False, "dedupStrategy": "none"},
          no_value="preencha correlationId no topo",
          desc="Tudo o que uma requisição registrou, em ordem, em todos os serviços (ignora Serviço, Nível e os outros "
               "filtros). Fica vazio até a caixa correlationId ser preenchida.")
    return b


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for build in (inicio, negocio, produto, erros, sistema, logs):
        board = build()
        path = OUT / f"{board.uid}.json"
        path.write_text(json.dumps(board.json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(board.panels)} panels)")
