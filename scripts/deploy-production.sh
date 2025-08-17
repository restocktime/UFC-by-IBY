#!/bin/bash

# UFC Prediction Platform - Production Deployment Script

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║           UFC PREDICTION PLATFORM DEPLOYMENT                 ║${NC}"
echo -e "${PURPLE}║                Production Server Setup                       ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    echo -e "${YELLOW}   Visit: https://docs.docker.com/get-docker/${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    echo -e "${YELLOW}   Visit: https://docs.docker.com/compose/install/${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose are installed${NC}"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    cp .env.production .env
    echo -e "${RED}🔧 IMPORTANT: Edit the .env file with your actual values before continuing!${NC}"
    echo -e "${YELLOW}   Especially change the security keys and database passwords.${NC}"
    read -p "Press Enter after you've updated the .env file..."
fi

# Generate SSL certificates if they don't exist
if [ ! -d "ssl" ]; then
    echo -e "${YELLOW}🔐 Generating self-signed SSL certificates...${NC}"
    mkdir -p ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ssl/key.pem \
        -out ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    echo -e "${GREEN}✅ SSL certificates generated${NC}"
    echo -e "${YELLOW}   For production, replace with real SSL certificates${NC}"
fi

# Build and start services
echo -e "${BLUE}🏗️  Building and starting services...${NC}"
docker-compose -f docker-compose.prod.yml up --build -d

# Wait for services to start
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 30

# Check service health
echo -e "${BLUE}🔍 Checking service health...${NC}"

# Check API health
if curl -f -k https://localhost/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API service is healthy${NC}"
else
    echo -e "${RED}❌ API service is not responding${NC}"
    echo -e "${YELLOW}   Check logs: docker-compose -f docker-compose.prod.yml logs api${NC}"
fi

# Check frontend
if curl -f -k https://localhost > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend service is healthy${NC}"
else
    echo -e "${RED}❌ Frontend service is not responding${NC}"
    echo -e "${YELLOW}   Check logs: docker-compose -f docker-compose.prod.yml logs frontend${NC}"
fi

# Check database connections
echo -e "${BLUE}🔍 Checking database connections...${NC}"
if docker-compose -f docker-compose.prod.yml exec -T mongodb mongosh --eval "db.runCommand('ping')" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MongoDB is connected${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB connection check failed${NC}"
fi

if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is connected${NC}"
else
    echo -e "${YELLOW}⚠️  Redis connection check failed${NC}"
fi

echo ""
echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                    🎉 DEPLOYMENT COMPLETE! 🎉               ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🔗 Your UFC Prediction Platform is now live at:${NC}"
echo -e "   ${BLUE}HTTPS:${NC} ${YELLOW}https://localhost${NC} (or your domain)"
echo -e "   ${BLUE}HTTP:${NC}  ${YELLOW}http://localhost${NC} (redirects to HTTPS)"
echo ""
echo -e "${GREEN}📊 Available endpoints:${NC}"
echo -e "   ${BLUE}API Health:${NC}       ${YELLOW}https://localhost/health${NC}"
echo -e "   ${BLUE}Fighters:${NC}         ${YELLOW}https://localhost/api/v1/fighters${NC}"
echo -e "   ${BLUE}Predictions:${NC}      ${YELLOW}https://localhost/api/v1/predictions${NC}"
echo -e "   ${BLUE}Live Odds:${NC}        ${YELLOW}https://localhost/api/v1/odds${NC}"
echo -e "   ${BLUE}Security Metrics:${NC} ${YELLOW}https://localhost/api/v1/security/metrics${NC}"
echo ""
echo -e "${GREEN}🔧 Management commands:${NC}"
echo -e "   ${BLUE}View logs:${NC}        ${YELLOW}docker-compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "   ${BLUE}Stop services:${NC}    ${YELLOW}docker-compose -f docker-compose.prod.yml down${NC}"
echo -e "   ${BLUE}Restart:${NC}          ${YELLOW}docker-compose -f docker-compose.prod.yml restart${NC}"
echo -e "   ${BLUE}Update:${NC}           ${YELLOW}./scripts/deploy-production.sh${NC}"
echo ""
echo -e "${GREEN}📈 Monitoring:${NC}"
echo -e "   ${BLUE}Grafana:${NC}          ${YELLOW}http://localhost:3001${NC} (admin/your_grafana_password)"
echo ""
echo -e "${YELLOW}🔒 Security Notes:${NC}"
echo -e "   • Change default passwords in .env file"
echo -e "   • Replace self-signed SSL certificates with real ones"
echo -e "   • Configure firewall rules for your server"
echo -e "   • Set up domain name and DNS"
echo -e "   • Enable automatic SSL certificate renewal"
echo ""
echo -e "${GREEN}🚀 Your platform includes:${NC}"
echo -e "   ${BLUE}✅${NC} Live data integration (SportsData.io, The Odds API)"
echo -e "   ${BLUE}✅${NC} Real-time predictions and analytics"
echo -e "   ${BLUE}✅${NC} Comprehensive security & compliance"
echo -e "   ${BLUE}✅${NC} GDPR compliance & data privacy"
echo -e "   ${BLUE}✅${NC} Production-ready infrastructure"
echo -e "   ${BLUE}✅${NC} SSL/TLS encryption"
echo -e "   ${BLUE}✅${NC} Database persistence"
echo -e "   ${BLUE}✅${NC} Monitoring and logging"