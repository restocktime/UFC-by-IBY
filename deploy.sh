#!/bin/bash

# UFC Prediction Platform - Quick Deploy Script

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                 UFC PREDICTION PLATFORM                      ║${NC}"
echo -e "${PURPLE}║                   LIVE DEPLOYMENT                           ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}🚀 Welcome to UFC Prediction Platform Deployment!${NC}"
echo ""
echo -e "${YELLOW}Choose your deployment option:${NC}"
echo ""
echo "1. 🌊 Deploy to Cloud (DigitalOcean, AWS, GCP, Azure)"
echo "2. 🐳 Deploy Locally with Docker (Production Setup)"
echo "3. 💻 Run Local Development Server"
echo "4. 📖 View Deployment Documentation"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo -e "${BLUE}🌊 Starting cloud deployment...${NC}"
        ./scripts/deploy-cloud.sh
        ;;
    2)
        echo -e "${BLUE}🐳 Starting local production deployment...${NC}"
        ./scripts/deploy-production.sh
        ;;
    3)
        echo -e "${BLUE}💻 Starting local development server...${NC}"
        ./scripts/start-local.sh
        ;;
    4)
        echo -e "${BLUE}📖 Opening deployment documentation...${NC}"
        if command -v open &> /dev/null; then
            open LIVE-DEPLOYMENT.md
        elif command -v xdg-open &> /dev/null; then
            xdg-open LIVE-DEPLOYMENT.md
        else
            echo -e "${YELLOW}Please open LIVE-DEPLOYMENT.md to view the documentation${NC}"
        fi
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        echo -e "${YELLOW}Please run ./deploy.sh again and choose 1-4${NC}"
        exit 1
        ;;
esac