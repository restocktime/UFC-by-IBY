# 🚀 UFC Prediction Platform - Live Server Deployment

This guide will help you deploy the UFC Prediction Platform to a live server with real data integration.

## 🎯 Quick Deploy Options

### Option 1: One-Click Cloud Deployment (Easiest)

```bash
# Make deployment script executable
chmod +x scripts/deploy-cloud.sh

# Run the cloud deployment wizard
./scripts/deploy-cloud.sh
```

### Option 2: Docker Production Deployment

```bash
# Make deployment script executable
chmod +x scripts/deploy-production.sh

# Deploy with Docker
./scripts/deploy-production.sh
```

## 🌊 Recommended: DigitalOcean Deployment

### Step 1: Create a DigitalOcean Droplet

1. Go to [DigitalOcean](https://www.digitalocean.com/)
2. Create a new Droplet:
   - **Image**: Ubuntu 22.04 LTS
   - **Size**: Basic plan, 2GB RAM minimum (4GB recommended)
   - **Region**: Choose closest to your users
   - **Authentication**: SSH Key (recommended) or Password

### Step 2: Connect to Your Server

```bash
# SSH into your droplet
ssh root@your_droplet_ip
```

### Step 3: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git and Node.js
apt install -y git nodejs npm

# Verify installations
docker --version
docker-compose --version
node --version
```

### Step 4: Deploy the Platform

```bash
# Clone your repository
git clone https://github.com/your-username/ufc-prediction-platform.git
cd ufc-prediction-platform

# Copy and edit environment variables
cp .env.production .env
nano .env  # Edit with your actual values

# Make deployment script executable
chmod +x scripts/deploy-production.sh

# Deploy the platform
./scripts/deploy-production.sh
```

### Step 5: Configure Domain (Optional)

```bash
# Install Nginx for domain management
apt install -y nginx certbot python3-certbot-nginx

# Configure domain
nano /etc/nginx/sites-available/ufc-platform

# Add this configuration:
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    location / {
        proxy_pass https://localhost;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Enable the site
ln -s /etc/nginx/sites-available/ufc-platform /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com
```

## ☁️ AWS Deployment

### Option A: AWS App Runner (Easiest)

1. Push your code to GitHub
2. Go to AWS App Runner console
3. Create service from GitHub
4. Configure:
   - **Build command**: `npm run build`
   - **Start command**: `npm start`
   - **Port**: 3000

### Option B: AWS ECS with Fargate

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure

# Deploy using ECS
aws ecs create-cluster --cluster-name ufc-platform
# ... (detailed ECS setup)
```

## 🔧 Google Cloud Platform

### Cloud Run Deployment

```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Deploy to Cloud Run
gcloud run deploy ufc-platform \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000
```

## 🌐 Vercel Deployment (Serverless)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

## 📊 Environment Variables Setup

Create a `.env` file with these variables:

```bash
# Application
NODE_ENV=production
PORT=3000

# Live Data API Keys
SPORTSDATA_IO_API_KEY=81a9726b488c4b57b48e59042405d1a6
ODDS_API_KEY=22e59e4eccd8562ad4b697aeeaccb0fb
ESPN_API_KEY=your_espn_key_here

# Database URLs (use cloud databases for production)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ufc_platform
REDIS_URL=redis://username:password@redis-host:port

# Security (CHANGE THESE!)
JWT_SECRET=your-super-secure-jwt-secret-256-bits-long
ENCRYPTION_KEY=your-super-secure-encryption-key-256-bits
API_SIGNING_KEY=your-super-secure-api-signing-key-256-bits

# Optional: Proxy Configuration
OXYLABS_USERNAME=your_username
OXYLABS_PASSWORD=your_password
```

## 🔒 Security Checklist

- [ ] Change all default passwords
- [ ] Use strong, unique secrets for JWT, encryption, and API signing
- [ ] Enable SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Enable automatic backups
- [ ] Configure rate limiting
- [ ] Set up intrusion detection

## 📈 Monitoring Setup

### Grafana Dashboard

Access Grafana at `http://your-server:3001`
- Username: `admin`
- Password: (set in your .env file)

### Health Checks

- API Health: `https://your-domain/health`
- Security Metrics: `https://your-domain/api/v1/security/metrics`
- System Status: `https://your-domain/api/v1/system/health`

## 🔄 Maintenance Commands

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Update deployment
git pull
./scripts/deploy-production.sh

# Backup database
docker-compose -f docker-compose.prod.yml exec mongodb mongodump --out /backup

# Scale services
docker-compose -f docker-compose.prod.yml up --scale api=3 -d
```

## 🌍 Domain and SSL Setup

### Free SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (add to crontab)
0 12 * * * /usr/bin/certbot renew --quiet
```

### Custom Domain Setup

1. Point your domain's A record to your server's IP
2. Update nginx configuration with your domain
3. Get SSL certificate
4. Test HTTPS access

## 📊 Performance Optimization

### Database Optimization

```bash
# MongoDB indexes
docker-compose exec mongodb mongosh ufc_platform --eval "
  db.fighters.createIndex({name: 1});
  db.predictions.createIndex({createdAt: -1});
  db.odds.createIndex({fightId: 1, timestamp: -1});
"

# Redis memory optimization
docker-compose exec redis redis-cli CONFIG SET maxmemory 256mb
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Nginx Caching

```nginx
# Add to nginx.conf
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
}
```

## 🚨 Troubleshooting

### Common Issues

1. **Port 80/443 already in use**
   ```bash
   sudo lsof -i :80
   sudo lsof -i :443
   sudo systemctl stop apache2  # if Apache is running
   ```

2. **Docker permission denied**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **SSL certificate issues**
   ```bash
   sudo certbot certificates
   sudo certbot renew --dry-run
   ```

4. **Database connection failed**
   - Check MongoDB/Redis container status
   - Verify connection strings in .env
   - Check firewall rules

### Log Analysis

```bash
# API logs
docker-compose logs api

# Database logs
docker-compose logs mongodb

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 🎯 Success Verification

After deployment, verify these endpoints work:

- ✅ `https://your-domain/health` - API health check
- ✅ `https://your-domain/api/v1/fighters` - Fighters data
- ✅ `https://your-domain/api/v1/predictions` - Predictions
- ✅ `https://your-domain/api/v1/odds` - Live odds
- ✅ `https://your-domain/api/v1/security/metrics` - Security metrics

## 💰 Cost Estimation

### DigitalOcean
- **Basic Droplet**: $12/month (2GB RAM)
- **Recommended**: $24/month (4GB RAM)
- **With managed databases**: +$15-30/month

### AWS
- **App Runner**: ~$25-50/month
- **ECS Fargate**: ~$30-60/month
- **EC2 + RDS**: ~$40-80/month

### Google Cloud
- **Cloud Run**: ~$20-40/month
- **GKE**: ~$50-100/month

### Vercel/Netlify
- **Hobby**: Free tier available
- **Pro**: $20/month per team member

## 🎉 You're Live!

Once deployed, your UFC Prediction Platform will be running with:

- ✅ **Live Data Integration** from SportsData.io and The Odds API
- ✅ **Real-time Predictions** with AI-powered analysis
- ✅ **Security & Compliance** with GDPR compliance
- ✅ **Production Infrastructure** with SSL, monitoring, and backups
- ✅ **Scalable Architecture** ready for high traffic

Your platform is now ready to serve real users with live UFC data and predictions!