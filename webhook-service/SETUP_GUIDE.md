# Claude Code GitLab Webhook Service Setup Guide

This guide provides detailed instructions for setting up the webhook service that enables real-time GitLab integration with Claude Code, particularly for handling issue comments and providing OAuth authentication.

## Quick Start

### 1. Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git
cd claude-code-for-gitlab/webhook-service

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Run with Docker Compose
docker-compose up -d
```

### 2. Manual Setup

```bash
# Install dependencies
npm install

# Set environment variables
export PORT=3000
export GITLAB_WEBHOOK_SECRET=your_webhook_secret
export CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token

# Start the service
npm start
```

## Detailed Configuration

### Environment Variables

Create a `.env` file in the webhook-service directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# GitLab Configuration
GITLAB_URL=https://gitlab.com  # Or your self-hosted URL
GITLAB_WEBHOOK_SECRET=generate_a_secure_random_string_here

# Authentication (Choose one)
## Option 1: Claude Code OAuth Token (Recommended)
CLAUDE_CODE_OAUTH_TOKEN=your_claude_oauth_token

## Option 2: Separate tokens
GITLAB_TOKEN=your_gitlab_personal_access_token
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional: GitLab OAuth App (for user authentication)
GITLAB_APP_ID=your_gitlab_app_id
GITLAB_APP_SECRET=your_gitlab_app_secret
OAUTH_REDIRECT_URI=https://your-domain.com/oauth/callback

# Optional: Database for OAuth token storage
DATABASE_URL=postgresql://user:password@localhost:5432/claude_gitlab

# Security Options
ALLOWED_USERS=user1,user2,user3  # Comma-separated list
RATE_LIMIT_WINDOW=60000  # 1 minute in milliseconds
RATE_LIMIT_MAX_REQUESTS=10

# For self-hosted GitLab with self-signed certificates (not recommended for production)
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Generating Secure Secrets

```bash
# Generate webhook secret
openssl rand -hex 32

# Generate session secret (if using OAuth)
openssl rand -hex 32
```

## Deployment Options

### Option 1: Docker Deployment

```yaml
# docker-compose.yml
version: "3.8"

services:
  webhook-service:
    build: .
    container_name: claude-gitlab-webhook
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - webhook-service
    restart: unless-stopped

  # Optional: PostgreSQL for OAuth tokens
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: claude_gitlab
      POSTGRES_USER: claude
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Option 2: Systemd Service (Linux)

```ini
# /etc/systemd/system/claude-gitlab-webhook.service
[Unit]
Description=Claude GitLab Webhook Service
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/opt/claude-gitlab-webhook
EnvironmentFile=/opt/claude-gitlab-webhook/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/claude-gitlab-webhook/logs

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable claude-gitlab-webhook
sudo systemctl start claude-gitlab-webhook
```

### Option 3: Kubernetes Deployment

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-gitlab-webhook
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claude-gitlab-webhook
  template:
    metadata:
      labels:
        app: claude-gitlab-webhook
    spec:
      containers:
        - name: webhook-service
          image: your-registry/claude-gitlab-webhook:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: claude-gitlab-secrets
            - configMapRef:
                name: claude-gitlab-config
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

## SSL/TLS Configuration

### Using Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d claude-webhook.your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/claude-webhook
server {
    listen 80;
    server_name claude-webhook.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name claude-webhook.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/claude-webhook.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/claude-webhook.your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=webhook:10m rate=10r/s;
    limit_req zone=webhook burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

## GitLab Webhook Configuration

### Setting Up Webhooks

1. Navigate to your GitLab project
2. Go to **Settings** → **Webhooks**
3. Add a new webhook:

```
URL: https://claude-webhook.your-domain.com/webhook
Secret Token: [Your GITLAB_WEBHOOK_SECRET]

Trigger events:
✓ Push events (optional)
✓ Issues events
✓ Comments
✓ Merge request events
✓ Wiki page events (optional)

Features:
✓ Enable SSL verification (disable only for self-signed certs)
```

### Testing Webhooks

```bash
# Test webhook endpoint
curl -X POST https://claude-webhook.your-domain.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: your_webhook_secret" \
  -d '{
    "object_kind": "note",
    "event_type": "note",
    "project": {
      "id": 123,
      "name": "test-project"
    },
    "object_attributes": {
      "note": "@claude Hello!",
      "noteable_type": "Issue"
    }
  }'
```

## Monitoring and Logging

### Log Configuration

The service uses Winston for logging. Logs are stored in:

- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

### Monitoring Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Metrics (if enabled)
curl http://localhost:3000/metrics
```

### Setting Up Monitoring

```yaml
# docker-compose with monitoring
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Security Best Practices

### 1. Environment Security

```bash
# Set proper file permissions
chmod 600 .env
chmod 700 logs/

# Use secrets management
# Example with Docker secrets
docker secret create claude_oauth_token token.txt
```

### 2. Network Security

```bash
# Firewall rules (UFW example)
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable

# Fail2ban configuration
# /etc/fail2ban/jail.local
[claude-webhook]
enabled = true
port = https
filter = claude-webhook
logpath = /opt/claude-gitlab-webhook/logs/access.log
maxretry = 5
bantime = 3600
```

### 3. Rate Limiting

Configure in `.env`:

```env
RATE_LIMIT_WINDOW=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_SKIP_SUCCESSFUL=false
RATE_LIMIT_SKIP_FAILED=false
```

### 4. Input Validation

The service validates:

- GitLab webhook signatures
- User permissions
- Request payloads
- OAuth tokens

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**

   ```bash
   # Check GitLab webhook logs
   # Project → Settings → Webhooks → Edit → Recent events

   # Check service logs
   docker logs claude-gitlab-webhook
   ```

2. **SSL certificate issues**

   ```bash
   # For self-signed certificates (development only)
   NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
   ```

3. **Permission denied errors**

   ```bash
   # Check GitLab token permissions
   curl -H "PRIVATE-TOKEN: your_token" \
     "https://gitlab.com/api/v4/user"
   ```

4. **Rate limiting**
   ```bash
   # Check rate limit headers
   curl -I https://claude-webhook.your-domain.com/health
   ```

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
NODE_ENV=development
```

### Health Checks

```javascript
// Custom health check implementation
app.get("/health", async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: "OK",
    checks: {
      gitlab: await checkGitLabConnection(),
      claude: await checkClaudeConnection(),
      database: await checkDatabaseConnection(),
    },
  };

  const allHealthy = Object.values(health.checks).every((check) => check);
  res.status(allHealthy ? 200 : 503).json(health);
});
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# docker-compose.scale.yml
services:
  webhook-service:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### Load Balancing

```nginx
# Nginx load balancing
upstream claude_webhook {
    least_conn;
    server webhook1:3000 weight=1;
    server webhook2:3000 weight=1;
    server webhook3:3000 weight=1;
}
```

### Caching

```javascript
// Redis caching for OAuth tokens
const redis = require("redis");
const client = redis.createClient({
  url: process.env.REDIS_URL,
});

// Cache OAuth tokens
await client.setex(`oauth:${userId}`, 3600, token);
```

## Maintenance

### Backup

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/claude-webhook"

# Backup environment and logs
tar -czf "$BACKUP_DIR/webhook_$DATE.tar.gz" \
  .env \
  logs/ \
  data/

# Backup database if used
pg_dump $DATABASE_URL > "$BACKUP_DIR/db_$DATE.sql"

# Keep only last 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### Updates

```bash
# Update process
docker-compose down
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

## Support

For issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review logs in `logs/error.log`
3. Open an issue on GitHub with:
   - Error messages
   - Environment details
   - Steps to reproduce
