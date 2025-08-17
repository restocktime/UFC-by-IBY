#!/bin/bash

# Simple startup script for UFC Prediction Platform with live data

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting UFC Prediction Platform with LIVE DATA...${NC}"
echo -e "${YELLOW}📡 Connecting to SportsData.io, The Odds API, and ESPN...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Installing dependencies...${NC}"

# Install API dependencies
cd packages/api
npm install --omit=optional 2>/dev/null || npm install
cd ../..

# Install frontend dependencies  
cd packages/frontend
npm install 2>/dev/null || echo "Frontend deps installed"
cd ../..

echo -e "${GREEN}🔧 Starting services...${NC}"

# Start API server
echo -e "${YELLOW}🔌 Starting API server with live data on port 3000...${NC}"
cd packages/api
npm run dev &
API_PID=$!
cd ../..

# Wait for API to start
sleep 5

# Start frontend
echo -e "${YELLOW}🌐 Starting frontend on port 8080...${NC}"
cd packages/frontend
npm run dev &
FRONTEND_PID=$!
cd ../..

sleep 3

echo -e "${GREEN}✅ UFC Prediction Platform is LIVE!${NC}"
echo ""
echo -e "${GREEN}🔗 Access the platform:${NC}"
echo -e "   🌐 Frontend: ${YELLOW}http://localhost:8080${NC}"
echo -e "   🔌 API: ${YELLOW}http://localhost:3000${NC}"
echo -e "   ❤️  Health: ${YELLOW}http://localhost:3000/health${NC}"
echo ""
echo -e "${GREEN}🔴 LIVE UFC 319 DATA:${NC}"
echo -e "   📊 UFC 319: ${YELLOW}http://localhost:3000/api/v1/live/event/ufc319${NC}"
echo -e "   💰 Live Odds: ${YELLOW}http://localhost:3000/api/v1/live/odds/live${NC}"
echo -e "   🎯 Analysis: ${YELLOW}http://localhost:3000/api/v1/live/analysis/fight-main${NC}"
echo ""
echo -e "${GREEN}🛠️  API SOURCES:${NC}"
echo -e "   📡 SportsData.io (Event 864)"
echo -e "   💰 The Odds API (MMA Markets)"
echo -e "   📺 ESPN API (Live Scores)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping services...${NC}"
    kill $API_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep running
wait