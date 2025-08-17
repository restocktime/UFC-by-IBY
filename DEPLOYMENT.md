# UFC Prediction Platform - Deployment Guide

This guide will help you deploy and run the UFC Prediction Platform with all its components.

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+ 
- npm 9+
- Git

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd ufc-prediction-platform
```

### 2. Start Everything with One Command
```bash
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

This will:
- Install all dependencies
- Start the API server on port 3000
- Start the frontend on port 8080
- Display all available endpoints

### 3. Access the Platform
- **Frontend**: http://localhost:8080
- **API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## 📋 Manual Setup (Step by Step)

### 1. Install Dependencies
```bash
# Install root dependencies
npm install

# Install API dependencies
cd packages/api
npm install
cd ../..

# Install frontend dependencies
cd packages/frontend
npm install
cd ../..
```

### 2. Environment Configuration
Create `.env` files in the API package:

```bash
# packages/api/.env
NODE_ENV=development
PORT=3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ufc_platform
REDIS_URL=redis://localhost:6379

# API Keys (Optional - will use demo data if not provided)
SPORTSDATA_IO_API_KEY=your_sportsdata_key_here
ODDS_API_KEY=your_odds_api_key_here
ESPN_API_KEY=your_espn_key_here

# Proxy Configuration (Optional)
OXYLABS_USERNAME=your_oxylabs_username
OXYLABS_PASSWORD=your_oxylabs_password

# Security Configuration
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here
API_SIGNING_KEY=your_api_signing_key_here

# Rate Limiting
API_RATE_LIMIT_WINDOW=900000
API_RATE_LIMIT_MAX=100
```

### 3. Start Services Individually

#### Start API Server
```bash
cd packages/api
npm run dev
```
The API will be available at http://localhost:3000

#### Start Frontend Server
```bash
cd packages/frontend
npm run dev
```
The frontend will be available at http://localhost:8080

## 🐳 Docker Deployment

### 1. Using Docker Compose (Recommended)
```bash
# Start all services including databases
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 2. Individual Docker Containers

#### Build and Run API
```bash
cd packages/api
docker build -t ufc-api .
docker run -p 3000:3000 -e NODE_ENV=production ufc-api
```

#### Build and Run Frontend
```bash
cd packages/frontend
docker build -t ufc-frontend .
docker run -p 8080:80 ufc-frontend
```

## ☁️ Cloud Deployment

### Kubernetes Deployment
```bash
# Apply all Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods
kubectl get services

# Access via ingress (configure your domain)
kubectl get ingress
```

### Individual Kubernetes Components
```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy API
kubectl apply -f k8s/api-deployment.yaml

# Deploy Frontend
kubectl apply -f k8s/frontend-deployment.yaml

# Deploy ML Service
kubectl apply -f k8s/ml-deployment.yaml

# Setup ingress
kubectl apply -f k8s/ingress.yaml
```

## 🔧 Configuration Options

### API Configuration
The API supports various configuration options through environment variables:

- **Database**: MongoDB, Redis, InfluxDB connections
- **API Keys**: External data provider keys
- **Security**: JWT secrets, encryption keys
- **Rate Limiting**: Request limits and windows
- **Proxy**: Oxylabs proxy configuration

### Frontend Configuration
The frontend is a static web application that connects to the API. No additional configuration needed for basic setup.

## 📊 Available Endpoints

### API Endpoints
- `GET /health` - Health check
- `GET /api/v1/fighters` - Get fighters data
- `GET /api/v1/predictions` - Get predictions
- `GET /api/v1/odds` - Get betting odds
- `GET /api/v1/events` - Get UFC events
- `POST /api/v1/predictions` - Create prediction

### Security Endpoints
- `GET /api/v1/security/audit-logs` - Audit logs
- `GET /api/v1/security/metrics` - Security metrics
- `POST /api/v1/compliance/consent` - Record consent
- `GET /api/v1/compliance/export` - Data export

## 🧪 Testing

### Run All Tests
```bash
npm run test:all
```

### Run Specific Test Suites
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance
```

## 📈 Monitoring

### Health Checks
- API Health: http://localhost:3000/health
- Security Metrics: http://localhost:3000/api/v1/security/metrics
- System Health: http://localhost:3000/api/v1/system/health

### Logs
- API logs are output to console in development
- Audit logs are stored in the audit logger service
- Security events are logged with risk levels

## 🔒 Security Features

The platform includes comprehensive security features:

- **API Key Management**: Secure storage and rotation
- **Request Validation**: Signature verification and abuse prevention
- **GDPR Compliance**: Data privacy and user rights
- **Audit Logging**: Complete request and security event logging
- **Rate Limiting**: Multi-tier rate limiting and abuse detection

## 🚨 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill processes on ports 3000 and 8080
lsof -ti:3000 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

#### Database Connection Issues
- Ensure MongoDB is running on localhost:27017
- Check Redis connection on localhost:6379
- Verify database credentials in .env file

#### API Key Issues
- The platform works with demo data if API keys are not provided
- Check API key format and validity
- Verify rate limits haven't been exceeded

#### Frontend Not Loading
- Check that the API is running on port 3000
- Verify CORS configuration
- Check browser console for errors

### Getting Help
- Check the logs for detailed error messages
- Verify all dependencies are installed
- Ensure all required environment variables are set
- Check that all required ports are available

## 🎯 Next Steps

After deployment, you can:

1. **Configure API Keys**: Add real API keys for live data
2. **Setup Monitoring**: Configure logging and monitoring systems
3. **Scale Services**: Use Kubernetes for production scaling
4. **Customize Frontend**: Modify the frontend for your needs
5. **Add Features**: Extend the platform with additional functionality

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review the API documentation
- Check the test files for usage examples
- Verify your environment configuration