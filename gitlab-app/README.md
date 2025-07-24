# Claude GitLab App

A self-hosted GitLab OAuth application that integrates Claude AI with your GitLab instance. Install once and use across all your GitLab projects with intelligent code reviews, issue assistance, and merge request analysis.

## Features

- 🦊 **GitLab OAuth Integration**: Secure authentication with your GitLab instance
- 🤖 **Claude AI Assistant**: Intelligent responses to comments mentioning `@claude`
- 🔧 **Per-Project Configuration**: Enable/disable Claude and customize settings for each project
- 🌐 **Multi-Tenant**: Works with multiple users and projects on the same instance
- 🔒 **Secure**: JSON-based storage with AES encryption for sensitive data
- ☁️ **Cloudflare Tunnel Support**: Easy public access without port forwarding
- 📊 **Optional Monitoring**: Prometheus and Grafana integration

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd gitlab-app
cp .env.example .env
```

### 2. Configure GitLab OAuth

Create a GitLab application at `https://your-gitlab.com/-/profile/applications`:

- **Name**: Claude GitLab App
- **Redirect URI**: `https://your-domain.com/auth/callback` (or `http://localhost:3000/auth/callback` for local development)
- **Scopes**: `api`, `read_user`, `read_repository`

Add the credentials to your `.env` file:

```bash
GITLAB_APP_ID=your_application_id
GITLAB_APP_SECRET=your_application_secret
```

### 3. Get Claude API Access

**Option A: Direct Anthropic API (Recommended)**
```bash
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**Option B: Claude Code OAuth Token**
```bash
CLAUDE_CODE_OAUTH_TOKEN=your_claude_code_token
```

### 4. Generate Security Keys

```bash
# Generate session secret
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env

# Generate encryption key
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
```

### 5. Deploy

**With Cloudflare Tunnel (Recommended for Production):**
```bash
# Set your Cloudflare Tunnel token
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token

# Start with tunnel
docker-compose --profile tunnel up -d
```

**Local Development:**
```bash
# Start basic setup
docker-compose up -d
```

**With Nginx (Alternative to Cloudflare):**
```bash
# Start with reverse proxy
docker-compose --profile nginx up -d
```

## Usage

### 1. Login and Setup
1. Visit your app URL and login with GitLab
2. Go to Dashboard and click "Load GitLab Projects"
3. Enable Claude for desired projects

### 2. Use Claude in GitLab
1. Go to any issue or merge request in an enabled project
2. Add a comment mentioning `@claude` followed by your request
3. Claude will respond with intelligent assistance

### Example Commands
- `@claude review this code`
- `@claude explain this error`
- `@claude suggest improvements`
- `@claude help with testing`

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_APP_ID` | ✅ | - | GitLab OAuth application ID |
| `GITLAB_APP_SECRET` | ✅ | - | GitLab OAuth application secret |
| `ANTHROPIC_API_KEY` | ✅* | - | Anthropic API key for Claude |
| `SESSION_SECRET` | ✅ | - | Random secret for session encryption |
| `ENCRYPTION_KEY` | ✅ | - | Random key for data encryption |
| `APP_URL` | ✅ | `http://localhost:3000` | Public URL of your app |
| `GITLAB_URL` | ✅ | `https://gitlab.com` | Your GitLab instance URL |
| `CLAUDE_MODEL` | ❌ | `claude-3-sonnet-20241022` | Claude model to use |
| `CLOUDFLARE_TUNNEL_TOKEN` | ❌ | - | Cloudflare Tunnel token for public access |

*Either `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is required.

### Docker Compose Profiles

- **Default**: Just the main app
- **`redis`**: Add Redis for session storage
- **`tunnel`**: Add Cloudflare Tunnel
- **`nginx`**: Add Nginx reverse proxy  
- **`monitoring`**: Add Prometheus and Grafana
- **`full`**: All services

```bash
# Enable multiple profiles
COMPOSE_PROFILES=redis,tunnel docker-compose up -d
```

### Cloudflare Tunnel Setup

1. Install `cloudflared` on your local machine
2. Login: `cloudflared tunnel login`
3. Create tunnel: `cloudflared tunnel create claude-gitlab-app`
4. Configure DNS: Point your domain to the tunnel
5. Get the token: `cloudflared tunnel token claude-gitlab-app`
6. Add token to `.env`: `CLOUDFLARE_TUNNEL_TOKEN=your_token`

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   GitLab User   │───▶│  Claude GitLab   │───▶│   Anthropic     │
│                 │    │      App         │    │   Claude API    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌──────────────────┐
                       │   GitLab API     │
                       │   (Webhooks &    │
                       │    OAuth)        │
                       └──────────────────┘
```

### Core Components

- **OAuth Server**: Handles GitLab authentication and token management
- **Webhook Handler**: Processes GitLab events (comments, issues, MRs)
- **Claude Integration**: Formats requests and processes Claude responses
- **Web Dashboard**: User interface for project management
- **Data Storage**: Encrypted JSON files for user and project data

## Security

- OAuth2 authentication with GitLab
- AES-256 encryption for sensitive data (access tokens)
- Session-based authentication with secure cookies
- Webhook token verification
- Optional Redis for session storage
- Security headers via Helmet.js

## Monitoring

Optional Prometheus metrics and Grafana dashboards:

```bash
# Enable monitoring
COMPOSE_PROFILES=monitoring docker-compose up -d
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

## Troubleshooting

### Common Issues

**"Invalid OAuth state" error**
- Check that `APP_URL` matches your actual domain
- Ensure `GITLAB_REDIRECT_URI` is correctly configured in GitLab

**Webhook not receiving events**
- Verify the app is publicly accessible (use Cloudflare Tunnel)
- Check GitLab webhook logs in project settings
- Ensure webhook URL is correct: `{APP_URL}/webhook/{project_id}`

**Claude not responding**
- Verify `ANTHROPIC_API_KEY` is valid
- Check application logs: `docker-compose logs claude-gitlab-app`
- Ensure trigger phrase matches project settings

### Logs

```bash
# View application logs
docker-compose logs -f claude-gitlab-app

# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f cloudflare-tunnel
```

### Health Checks

```bash
# Check app health
curl http://localhost:3000/health

# Check all services
docker-compose ps
```

## Development

### Local Development Setup

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Start in development mode
bun run dev
```

### Building

```bash
# Build TypeScript
bun run build

# Build Docker image
docker build -t claude-gitlab-app .
```

### Project Structure

```
gitlab-app/
├── src/
│   ├── routes/          # Express routes
│   ├── services/        # Business logic
│   └── utils/           # Utilities and config
├── views/               # EJS templates
├── data/                # JSON data storage
├── logs/                # Application logs
└── docker-compose.yml   # Docker services
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly 
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Issues**: Create a GitHub issue
- **Documentation**: Check this README and inline code comments
- **Security**: Report security issues privately

---

**Made with ❤️ for the GitLab and Claude community**