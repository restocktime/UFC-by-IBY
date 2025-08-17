#!/bin/bash

# UFC Prediction Platform - Local Development Startup Script

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    echo -e "${YELLOW}🔄 Killing existing process on port $port...${NC}"
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    sleep 1
}

echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                 UFC PREDICTION PLATFORM                      ║${NC}"
echo -e "${PURPLE}║              🥊 Live Data Integration 🥊                     ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js is installed
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    echo -e "${YELLOW}   Download from: https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm found: $NPM_VERSION${NC}"

# Check for port conflicts
echo -e "${BLUE}🔍 Checking port availability...${NC}"
if check_port 3000; then
    echo -e "${YELLOW}⚠️  Port 3000 is already in use${NC}"
    read -p "Kill existing process on port 3000? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port 3000
    else
        echo -e "${RED}❌ Cannot start API server. Port 3000 is in use.${NC}"
        exit 1
    fi
fi

if check_port 8080; then
    echo -e "${YELLOW}⚠️  Port 8080 is already in use${NC}"
    read -p "Kill existing process on port 8080? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port 8080
    else
        echo -e "${RED}❌ Cannot start frontend server. Port 8080 is in use.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Ports 3000 and 8080 are available${NC}"

echo -e "${YELLOW}📦 Installing dependencies...${NC}"

# Install root dependencies
echo -e "${BLUE}   Installing root dependencies...${NC}"
npm install --silent

# Install API dependencies
echo -e "${BLUE}   Installing API dependencies...${NC}"
cd packages/api
npm install --silent
cd ../..

# Install frontend dependencies
echo -e "${BLUE}   Installing frontend dependencies...${NC}"
cd packages/frontend
npm install --silent
cd ../..

# Install shared dependencies if exists
if [ -d "packages/shared" ]; then
    echo -e "${BLUE}   Installing shared dependencies...${NC}"
    cd packages/shared
    npm install --silent
    npm run build 2>/dev/null || echo -e "${YELLOW}   Shared package build skipped${NC}"
    cd ../..
fi

# Install ML dependencies if exists
if [ -d "packages/ml" ]; then
    echo -e "${BLUE}   Installing ML dependencies...${NC}"
    cd packages/ml
    npm install --silent
    cd ../..
fi

echo -e "${GREEN}✅ All dependencies installed${NC}"

# Create .env file if it doesn't exist
if [ ! -f "packages/api/.env" ]; then
    echo -e "${YELLOW}🔧 Creating default .env file...${NC}"
    cat > packages/api/.env << EOF
NODE_ENV=development
PORT=3000

# Database Configuration (Optional - will use in-memory if not available)
MONGODB_URI=mongodb://localhost:27017/ufc_platform
REDIS_URL=redis://localhost:6379

# API Keys (Optional - will use demo data if not provided)
# SPORTSDATA_IO_API_KEY=your_key_here
# ODDS_API_KEY=your_key_here
# ESPN_API_KEY=your_key_here

# Security Configuration
JWT_SECRET=dev-jwt-secret-change-in-production
ENCRYPTION_KEY=dev-encryption-key-change-in-production
API_SIGNING_KEY=dev-signing-key-change-in-production

# Rate Limiting
API_RATE_LIMIT_WINDOW=900000
API_RATE_LIMIT_MAX=1000
EOF
    echo -e "${GREEN}✅ Created default .env file${NC}"
fi

echo -e "${GREEN}🎯 Starting services...${NC}"

# Start API server in background
echo -e "${YELLOW}🔌 Starting API server on port 3000...${NC}"
cd packages/api
npm run dev > ../api.log 2>&1 &
API_PID=$!
cd ../..

# Wait for API to start
echo -e "${BLUE}   Waiting for API server to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ API server failed to start. Check packages/api.log for details.${NC}"
        kill $API_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Start frontend server in background
echo -e "${YELLOW}🌐 Starting frontend server on port 8080...${NC}"
cd packages/frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..

# Wait for frontend to start
echo -e "${BLUE}   Waiting for frontend server to start...${NC}"
for i in {1..15}; do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend server is ready${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ Frontend server failed to start. Check packages/frontend.log for details.${NC}"
        kill $API_PID 2>/dev/null || true
        kill $FRONTEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""
echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                    🎉 SUCCESS! 🎉                           ║${NC}"
echo -e "${PURPLE}║            UFC Prediction Platform is running!               ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🔗 Access the platform:${NC}"
echo -e "   ${BLUE}Frontend:${NC}     ${YELLOW}http://localhost:8080${NC}"
echo -e "   ${BLUE}API:${NC}          ${YELLOW}http://localhost:3000${NC}"
echo -e "   ${BLUE}Health Check:${NC} ${YELLOW}http://localhost:3000/health${NC}"
echo ""
echo -e "${GREEN}📊 Available API endpoints:${NC}"
echo -e "   ${BLUE}Fighters:${NC}     ${YELLOW}http://localhost:3000/api/v1/fighters${NC}"
echo -e "   ${BLUE}Predictions:${NC}  ${YELLOW}http://localhost:3000/api/v1/predictions${NC}"
echo -e "   ${BLUE}Odds:${NC}         ${YELLOW}http://localhost:3000/api/v1/odds${NC}"
echo -e "   ${BLUE}Events:${NC}       ${YELLOW}http://localhost:3000/api/v1/events${NC}"
echo ""
echo -e "${GREEN}🔒 Security & Compliance endpoints:${NC}"
echo -e "   ${BLUE}Security Metrics:${NC} ${YELLOW}http://localhost:3000/api/v1/security/metrics${NC}"
echo -e "   ${BLUE}Audit Logs:${NC}      ${YELLOW}http://localhost:3000/api/v1/security/audit-logs${NC}"
echo -e "   ${BLUE}GDPR Compliance:${NC}  ${YELLOW}http://localhost:3000/api/v1/compliance${NC}"
echo ""
echo -e "${GREEN}📋 Features included:${NC}"
echo -e "   ${BLUE}✅${NC} Live data integration (SportsData.io, The Odds API, ESPN)"
echo -e "   ${BLUE}✅${NC} Real-time predictions and analytics"
echo -e "   ${BLUE}✅${NC} Comprehensive security & audit logging"
echo -e "   ${BLUE}✅${NC} GDPR compliance & data privacy"
echo -e "   ${BLUE}✅${NC} Rate limiting & abuse prevention"
echo -e "   ${BLUE}✅${NC} API key management & rotation"
echo ""
echo -e "${YELLOW}📝 Logs:${NC}"
echo -e "   ${BLUE}API logs:${NC}      ${YELLOW}tail -f packages/api.log${NC}"
echo -e "   ${BLUE}Frontend logs:${NC} ${YELLOW}tail -f packages/frontend.log${NC}"
echo ""
echo -e "${RED}🛑 Press Ctrl+C to stop all services${NC}"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    kill $API_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    
    # Wait a moment for graceful shutdown
    sleep 2
    
    # Force kill if still running
    kill -9 $API_PID 2>/dev/null || true
    kill -9 $FRONTEND_PID 2>/dev/null || true
    
    echo -e "${GREEN}✅ All services stopped${NC}"
    echo -e "${BLUE}👋 Thanks for using UFC Prediction Platform!${NC}"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait