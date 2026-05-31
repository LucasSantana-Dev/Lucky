# Grafana Dashboards as Code

This directory contains Grafana dashboards for Lucky, version-controlled and ready for provisioning in CI/CD environments.

## Metrics

Lucky exposes the following key application metrics:

- `lucky_backend_http_requests_total` — Total HTTP requests to the backend (counter)
- `lucky_backend_http_server_errors_total` — Total HTTP 5xx errors from the backend (counter)
- `lucky_bot_guilds_total` — Total number of Discord guilds the bot is a member of (gauge)

## Directory Structure

```
monitoring/grafana/
├── README.md                           # This file
├── provisioning-provider.template.yaml # Grafana provisioning provider YAML template
└── dashboards/                         # Directory for exported dashboard JSON files
    └── .gitkeep                        # Placeholder for version control
```

## Exporting Dashboards from Homelab Grafana

Dashboards currently live on the homelab Grafana instance and must be manually exported to version control. Use one of the following methods:

### Method 1: UI Export (Recommended)

1. Navigate to the dashboard in homelab Grafana
2. Click the share icon (⬆️ arrow) in the top-right corner
3. Select **Export** tab
4. Enable **"Export for sharing externally"** checkbox
5. Click **Download JSON** button
6. Save the file as `dashboards/<dashboard-name>.json` in this directory

### Method 2: API Export

Fetch all dashboards and their details programmatically:

```bash
# Set environment variables
export GRAFANA_URL="<homelab-grafana-url>"
export GRAFANA_TOKEN="<grafana-api-token>"  # Create in Grafana: Configuration → API Tokens

# List all dashboards
curl -H "Authorization: Bearer $GRAFANA_TOKEN" \
  "$GRAFANA_URL/api/search?type=dash-db"

# Export a specific dashboard by UID
curl -H "Authorization: Bearer $GRAFANA_TOKEN" \
  "$GRAFANA_URL/api/dashboards/uid/<dashboard-uid>" \
  | jq '.dashboard' > dashboards/<dashboard-name>.json
```

**Note:** The `jq '.dashboard'` filter extracts the dashboard object itself; the API response wraps it in a top-level `dashboard` key.

## Provisioning Template

The `provisioning-provider.template.yaml` file defines how Grafana will auto-load dashboards from this directory during startup. Replace placeholder values before use:

- `GRAFANA_DASHBOARDS_PATH`: Absolute or relative path to the `dashboards/` directory
- `GRAFANA_CONFIG_PATH`: Path to Grafana's main configuration directory (typically `/etc/grafana` in Docker)

## Next Steps

1. Export each dashboard from homelab Grafana using Method 1 or Method 2 above
2. Place exported JSON files in the `dashboards/` directory
3. Update `provisioning-provider.template.yaml` with correct paths for your environment
4. Commit and reference in deployment/provisioning pipelines

## References

- [Grafana Dashboard Provisioning Documentation](https://grafana.com/docs/grafana/latest/administration/provisioning/#dashboards)
- [Grafana API — Dashboard Details](https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/#find-dashboard-by-uid)
