# Claude Code GitLab Webhook Service

A Docker Compose hosted service that enables GitHub App-like functionality for GitLab by listening to webhooks and automatically triggering Claude Code pipelines when users mention `@claude` in issues or merge requests.

## 🚀 Quick Start

### 1. Setup the Service

```bash
# Clone the repository
git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git
cd claude-code-for-gitlab/webhook-service

# Copy environment configuration
cp .env.example .env

# Edit configuration
nano .env
```

### 2. Configure Environment

Edit `.env` with your GitLab credentials:

```bash
# GitLab Configuration
GITLAB_URL=https://gitlab.com  # or your self-hosted instance
GITLAB_TOKEN=your_personal_access_token
GITLAB_TRIGGER_TOKEN=your_trigger_token
CLAUDE_CODE_OAUTH_TOKEN=your_claude_oauth_token
```

### 3. Deploy with Docker Compose

```bash
# Start the basic service
docker-compose up -d

# Or with Nginx reverse proxy
docker-compose --profile nginx up -d

# Or with Redis for rate limiting
docker-compose --profile redis up -d

# Or with all components (including monitoring)
docker-compose --profile full up -d
```

### 4. Using Pre-built Docker Image

```bash
# Pull from Docker Hub
docker pull imWildCat/claude-code-gitlab-webhook:latest

# Or from GitHub Container Registry
docker pull ghcr.io/RealMikeChong/claude-code-gitlab-webhook:latest

# Run with environment file
docker run -d --env-file .env -p 3000:3000 \
  imWildCat/claude-code-gitlab-webhook:latest
```

## 📋 Setup Requirements

### GitLab Configuration

#### 1. Create Personal Access Token

1. Go to GitLab → Settings → Access Tokens
2. Create token with `api` scope
3. Copy token to `GITLAB_TOKEN` in `.env`

#### 2. Create Pipeline Trigger Token

1. Go to your project → Settings → CI/CD → Pipeline triggers
2. Create a new trigger token
3. Copy token to `GITLAB_TRIGGER_TOKEN` in `.env`

#### 3. Add CI/CD Configuration

Add to your project's `.gitlab-ci.yml`:

```yaml
include:
  - remote: "https://raw.githubusercontent.com/RealMikeChong/claude-code-for-gitlab/main/examples/gitlab/include/claude-code.gitlab-ci.yml"

variables:
  CLAUDE_CODE_OAUTH_TOKEN: $CLAUDE_CODE_OAUTH_TOKEN
```

#### 4. Configure Webhook

1. Go to your project → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/webhook/gitlab`
3. Select events:
   - ✅ Comments
   - ✅ Issues events
   - ✅ Merge request events
4. Optional: Add secret token for security

### Claude Configuration

#### Option 1: Claude Code OAuth Token (Recommended)

```bash
CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token
```

#### Option 2: Traditional Anthropic API Key

```bash
ANTHROPIC_API_KEY=your_api_key
```

## 🏗️ Architecture

```
GitLab Event → Webhook → Docker Service → GitLab Pipeline → Claude Action
```

### Service Components

1. **Node.js Webhook Receiver** - Processes GitLab webhooks
2. **Nginx Reverse Proxy** (optional) - SSL termination, rate limiting
3. **Redis Cache** (optional) - Rate limiting, session storage

### Event Flow

1. User mentions `@claude` in GitLab issue/MR
2. GitLab sends webhook to your service
3. Service validates event and triggers pipeline
4. Pipeline runs Claude Code action
5. Claude responds with code changes

## 🔧 Configuration Options

### Environment Variables

| Variable                  | Required | Description                         |
| ------------------------- | -------- | ----------------------------------- |
| `GITLAB_URL`              | Yes      | GitLab instance URL                 |
| `GITLAB_TOKEN`            | Yes      | Personal access token               |
| `GITLAB_TRIGGER_TOKEN`    | Yes      | Pipeline trigger token              |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes\*    | Claude OAuth token                  |
| `ANTHROPIC_API_KEY`       | Yes\*    | Anthropic API key (alternative)     |
| `GITLAB_WEBHOOK_SECRET`   | No       | Webhook signature verification      |
| `CLAUDE_TRIGGER_PHRASE`   | No       | Trigger phrase (default: `@claude`) |
| `PORT`                    | No       | Service port (default: 3000)        |
| `LOG_LEVEL`               | No       | Logging level (default: info)       |

\*Either `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` required

### Docker Compose Profiles

- **Default**: Basic webhook service
- **nginx**: Adds Nginx reverse proxy with SSL support
- **redis**: Adds Redis for caching and rate limiting
- **monitoring**: Adds Prometheus and Grafana for metrics
- **full**: Includes all components (nginx, redis, monitoring)

## 🛡️ Security Features

### Built-in Security

- Helmet.js security headers
- Request size limits (10MB)
- CORS protection
- Rate limiting (via Nginx)
- Webhook signature verification

### SSL/TLS Support

```bash
# Add SSL certificates
mkdir -p nginx/ssl
cp your-cert.pem nginx/ssl/cert.pem
cp your-key.pem nginx/ssl/key.pem

# Enable HTTPS in nginx.conf (uncomment SSL server block)
```

### Webhook Security

```bash
# Add webhook secret for signature verification
GITLAB_WEBHOOK_SECRET=your-secret-key
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### Logs

```bash
# View service logs
docker-compose logs -f claude-webhook

# View Nginx logs (if using nginx profile)
docker-compose logs -f nginx

# Access log files
tail -f logs/combined.log
tail -f logs/error.log
```

### Metrics Endpoint

The service exposes basic metrics at `/health`:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## 🐳 Docker

### Production-Ready Dockerfile

The service includes a multi-stage Dockerfile optimized for production:

- **Multi-stage build** for smaller images
- **Security scanning** in build process
- **Non-root user** execution
- **Health checks** built-in
- **Tini** for proper signal handling

### Building the Image

```bash
# Build locally
docker build -t claude-webhook ./webhook-service

# Build with specific version
docker build \
  --build-arg VERSION=1.0.0 \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t claude-webhook:1.0.0 ./webhook-service
```

### CI/CD Integration

The repository includes:

- **GitHub Actions** workflow for automated Docker builds
- **GitLab CI/CD** pipeline for GitLab App Runner deployment

## 🌐 Deployment Options

### Local Development

```bash
docker-compose up
```

### Production (with SSL)

```bash
docker-compose --profile nginx --profile redis up -d
```

### GitLab App Runner

Deploy directly to GitLab's managed infrastructure:

1. **Push to GitLab Container Registry**:

   ```bash
   docker tag claude-webhook registry.gitlab.com/your-org/claude-webhook:latest
   docker push registry.gitlab.com/your-org/claude-webhook:latest
   ```

2. **Deploy with GitLab CI/CD**:
   The included `.gitlab-ci.yml` automatically deploys to App Runner on push to main.

3. **Manual Deployment**:
   ```bash
   # Using the GitLab API
   curl -X POST \
     -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
     -F "image=registry.gitlab.com/your-org/claude-webhook:latest" \
     https://gitlab.com/api/v4/projects/$PROJECT_ID/app-runner/deploy
   ```

### AWS App Runner

```bash
# Create App Runner service
aws apprunner create-service \
  --service-name "claude-webhook" \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "ghcr.io/RealMikeChong/claude-code-gitlab-webhook:latest",
      "ImageConfiguration": {
        "Port": "3000"
      },
      "ImageRepositoryType": "ECR_PUBLIC"
    }
  }'
```

### Kubernetes Deployment

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-webhook
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claude-webhook
  template:
    metadata:
      labels:
        app: claude-webhook
    spec:
      containers:
        - name: claude-webhook
          image: ghcr.io/RealMikeChong/claude-code-gitlab-webhook:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: claude-webhook-secrets
          resources:
            limits:
              memory: "512Mi"
              cpu: "500m"
            requests:
              memory: "256Mi"
              cpu: "250m"
```

### Docker Swarm

```bash
# Deploy as a swarm service
docker service create \
  --name claude-webhook \
  --replicas 3 \
  --publish published=80,target=3000 \
  --env-file .env \
  ghcr.io/RealMikeChong/claude-code-gitlab-webhook:latest
```

### Reverse Proxy Setup

If using external reverse proxy (Traefik, Cloudflare, etc.):

```yaml
# docker-compose.override.yml
services:
  claude-webhook:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.claude.rule=Host(`claude.your-domain.com`)"
      - "traefik.http.services.claude.loadbalancer.server.port=3000"
```

## 🔄 Usage Examples

### Trigger Claude in Merge Request

```
@claude please review this code and suggest improvements
```

### Trigger Claude in Issue

```
@claude can you implement this feature request?
```

### Custom Instructions

```
@claude fix the bug in user authentication, focus on security best practices
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Pipeline Not Triggering

- Check webhook URL is accessible
- Verify trigger token in GitLab project
- Check service logs: `docker-compose logs claude-webhook`

#### 2. Authentication Errors

- Verify GitLab personal access token has `api` scope
- Check Claude OAuth token is valid
- Ensure tokens are set in CI/CD variables

#### 3. Webhook Signature Verification Fails

- Check `GITLAB_WEBHOOK_SECRET` matches GitLab webhook secret
- Ensure webhook is sending `X-Gitlab-Token` header

#### 4. Service Unreachable

- Check Docker containers are running: `docker-compose ps`
- Verify port mapping: `docker-compose port claude-webhook 3000`
- Check firewall/security groups allow traffic

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug docker-compose up
```

### Manual Testing

```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/webhook/gitlab \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Event: Note Hook" \
  -d @test-payload.json
```

## 📚 API Reference

### Webhook Endpoint

```
POST /webhook/gitlab
```

**Headers:**

- `X-Gitlab-Event`: Event type
- `X-Gitlab-Token`: Webhook signature (optional)
- `Content-Type: application/json`

**Supported Events:**

- Note Hook (comments)
- Merge Request Hook
- Issue Hook

**Response:**

```json
{
  "success": true,
  "message": "Pipeline triggered successfully",
  "pipelineId": 12345,
  "triggerType": "merge_request_note"
}
```

### Health Check

```
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.
