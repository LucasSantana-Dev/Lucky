# LukBot Deployment Guide

This guide explains how to set up automated deployment for the LukBot Discord bot using Portainer and GitHub Actions.

## 🐳 Portainer Deployment Options

### 1. Portainer Stack (Recommended)

Deploy using Portainer's stack feature with the provided `portainer-stack.yml` configuration.

#### Setup Steps:

1. **Access Portainer**: Open your Portainer web interface
2. **Create Stack**: Go to "Stacks" → "Add stack"
3. **Upload Configuration**: Copy the contents of `portainer-stack.yml`
4. **Configure Environment Variables**:
    - `DISCORD_TOKEN`: Your Discord bot token
    - `CLIENT_ID`: Your Discord application client ID
5. **Deploy**: Click "Deploy the stack"

#### Stack Configuration:

```yaml
version: '3.8'

services:
    lukbot:
        build:
            context: .
            dockerfile: Dockerfile
        image: lukbot:latest
        container_name: discord-bot
        restart: unless-stopped
        environment:
            - NODE_ENV=production
            - DISCORD_TOKEN=${DISCORD_TOKEN}
            - CLIENT_ID=${CLIENT_ID}
        volumes:
            - ./logs:/app/logs
            - ./data:/app/data
        networks:
            - lukbot-network
        healthcheck:
            test: ['CMD', 'node', '-e', 'process.exit(0)']
            interval: 30s
            timeout: 10s
            retries: 3
            start_period: 40s
```

**Note**: The stack now includes a `build` section that builds the Docker image locally from the Dockerfile, eliminating the need for a pre-built image on Docker Hub.

### 2. Portainer API Deployment

Use the Portainer API for programmatic deployment via the `portainer-deploy.sh` script.

#### Environment Variables:

```bash
export PORTAINER_URL="http://localhost:9000"
export PORTAINER_USERNAME="admin"
export PORTAINER_PASSWORD="your-password"
export PORTAINER_STACK_ID="1"
export PORTAINER_ENDPOINT_ID="1"
```

#### Usage:

```bash
# Deploy via Portainer API
./scripts/portainer-deploy.sh
```

### 3. Portainer Webhook Deployment

Set up webhook-based deployment for automatic updates.

#### Webhook Configuration:

1. **Create Webhook**: In Portainer, go to "Webhooks" → "Add webhook"
2. **Configure Endpoint**: Set the webhook URL to your server
3. **Set Secret**: Configure webhook secret for security
4. **Trigger Events**: Set up triggers for automatic deployment

#### Usage:

```bash
# Set webhook secret
export WEBHOOK_SECRET="your-secret-key"

# Run webhook deployment
./scripts/portainer-webhook.sh
```

## 🔧 Portainer Configuration

### Stack Management

1. **Create Stack**:
    - Name: `lukbot`
    - Build method: `Web editor`
    - Stack file: Copy contents of `portainer-stack.yml`

2. **Environment Variables**:
    - `DISCORD_TOKEN`: Your Discord bot token
    - `CLIENT_ID`: Your Discord application client ID

3. **Volumes**:
    - `./logs:/app/logs`: Log files
    - `./data:/app/data`: Bot data

### Network Configuration

The stack creates a dedicated network:

- **Network Name**: `lukbot-network`
- **Driver**: `bridge`
- **Purpose**: Isolated network for the bot

### Health Checks

The stack includes health checks:

- **Test**: Node.js process check
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3 attempts
- **Start Period**: 40 seconds

## 🚀 Deployment Process

### Manual Deployment

1. **Update Code**: Make changes to your code
2. **Build Image**: Build new Docker image
3. **Update Stack**: Update Portainer stack with new image
4. **Redeploy**: Redeploy the stack

### Automatic Deployment

1. **Webhook Setup**: Configure webhook in Portainer
2. **Code Push**: Push changes to repository
3. **Webhook Trigger**: Webhook automatically triggers deployment
4. **Stack Update**: Portainer updates and redeploys the stack

## 🔒 Security Configuration

### Environment Variables

Store sensitive data in Portainer's environment variables:

- **DISCORD_TOKEN**: Discord bot token
- **CLIENT_ID**: Discord application client ID
- **NODE_ENV**: Environment (production/development)

### Network Security

- **Isolated Network**: Bot runs in isolated network
- **No External Access**: Bot doesn't expose ports
- **Internal Communication**: Only internal Docker communication

### Access Control

- **Portainer Access**: Restrict Portainer access to authorized users
- **Webhook Security**: Use webhook secrets for authentication
- **API Security**: Secure Portainer API access

## 📊 Monitoring and Logs

### Portainer Monitoring

1. **Container Status**: Monitor container health in Portainer
2. **Resource Usage**: Check CPU and memory usage
3. **Logs**: View container logs in Portainer interface
4. **Events**: Monitor container events and restarts

### Log Management

- **Log Files**: Stored in `./logs` directory
- **Log Rotation**: Configure log rotation for large files
- **Log Levels**: Set appropriate log levels for production

## 🛠️ Troubleshooting

### Common Issues

1. **"pull access denied for lukbot" Error**:
    - **Cause**: Portainer trying to pull non-existent image from Docker Hub
    - **Solution**: Use the updated `portainer-stack.yml` with build configuration
    - **Fix**: Ensure the stack includes `build` section with local Dockerfile

2. **Container Won't Start**:
    - Check environment variables
    - Verify Discord token validity
    - Check container logs

3. **Deployment Failed**:
    - Verify Portainer API access
    - Check webhook configuration
    - Review deployment logs

4. **Network Issues**:
    - Check network configuration
    - Verify container connectivity
    - Review firewall settings

### Debug Commands

```bash
# Check container status
docker ps | grep discord-bot

# View container logs
docker logs discord-bot

# Check Portainer API
curl -H "Authorization: Bearer $TOKEN" $PORTAINER_URL/api/stacks

# Test webhook
curl -X POST $WEBHOOK_URL
```

## 📋 Best Practices

### Deployment

1. **Test First**: Always test changes in development
2. **Backup**: Keep backups of working configurations
3. **Rollback**: Have rollback procedures ready
4. **Monitoring**: Monitor deployments and container health

### Security

1. **Secrets**: Never commit secrets to repository
2. **Access Control**: Limit Portainer access
3. **Network**: Use isolated networks
4. **Updates**: Keep Portainer and Docker updated

### Maintenance

1. **Logs**: Regularly check and rotate logs
2. **Updates**: Keep bot dependencies updated
3. **Backups**: Regular backups of bot data
4. **Monitoring**: Continuous monitoring of bot health

## 🔄 CI/CD Integration

### GitHub Actions + Portainer

1. **GitHub Actions**: Handle code changes and testing
2. **Portainer API**: Deploy via Portainer API
3. **Webhooks**: Use webhooks for automatic deployment
4. **Monitoring**: Monitor deployment success

### Webhook Flow

1. **Code Push**: Push changes to repository
2. **GitHub Actions**: Run tests and build
3. **Webhook Trigger**: Trigger Portainer webhook
4. **Stack Update**: Update and redeploy stack
5. **Verification**: Verify deployment success

## 📞 Support

If you encounter issues with Portainer setup:

1. Check Portainer logs and container logs
2. Verify environment variables and configuration
3. Test manual deployment first
4. Review network and security settings
5. Check Portainer documentation and community support
