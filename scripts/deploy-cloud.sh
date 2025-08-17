#!/bin/bash

# UFC Prediction Platform - Cloud Deployment Script
# Supports AWS, Google Cloud, Azure, and DigitalOcean

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║           UFC PREDICTION PLATFORM CLOUD DEPLOYMENT          ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to deploy to DigitalOcean
deploy_digitalocean() {
    echo -e "${BLUE}🌊 Deploying to DigitalOcean...${NC}"
    
    # Check if doctl is installed
    if ! command -v doctl &> /dev/null; then
        echo -e "${RED}❌ DigitalOcean CLI (doctl) is not installed.${NC}"
        echo -e "${YELLOW}   Install: https://docs.digitalocean.com/reference/doctl/how-to/install/${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📋 DigitalOcean Deployment Steps:${NC}"
    echo "1. Create a Droplet (Ubuntu 22.04, 2GB+ RAM recommended)"
    echo "2. Install Docker and Docker Compose on the droplet"
    echo "3. Clone your repository to the droplet"
    echo "4. Run the production deployment script"
    echo ""
    echo -e "${BLUE}Commands to run on your droplet:${NC}"
    echo "# Update system"
    echo "sudo apt update && sudo apt upgrade -y"
    echo ""
    echo "# Install Docker"
    echo "curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "sudo sh get-docker.sh"
    echo "sudo usermod -aG docker \$USER"
    echo ""
    echo "# Install Docker Compose"
    echo "sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
    echo "sudo chmod +x /usr/local/bin/docker-compose"
    echo ""
    echo "# Clone and deploy"
    echo "git clone <your-repo-url>"
    echo "cd ufc-prediction-platform"
    echo "chmod +x scripts/deploy-production.sh"
    echo "./scripts/deploy-production.sh"
}

# Function to deploy to AWS
deploy_aws() {
    echo -e "${BLUE}☁️  Deploying to AWS...${NC}"
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed.${NC}"
        echo -e "${YELLOW}   Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📋 AWS Deployment Options:${NC}"
    echo ""
    echo "1. 🚀 AWS App Runner (Easiest)"
    echo "   - Automatic scaling and load balancing"
    echo "   - Built-in SSL certificates"
    echo "   - Pay per use"
    echo ""
    echo "2. 🐳 AWS ECS with Fargate"
    echo "   - Container orchestration"
    echo "   - Auto-scaling"
    echo "   - Managed infrastructure"
    echo ""
    echo "3. 🖥️  AWS EC2 Instance"
    echo "   - Full control over server"
    echo "   - Custom configurations"
    echo "   - Manual scaling"
    echo ""
    
    read -p "Choose deployment method (1-3): " aws_method
    
    case $aws_method in
        1)
            echo -e "${BLUE}Setting up AWS App Runner...${NC}"
            echo "1. Push your code to GitHub"
            echo "2. Go to AWS App Runner console"
            echo "3. Create new service from GitHub repository"
            echo "4. Configure build settings:"
            echo "   - Build command: npm run build"
            echo "   - Start command: npm start"
            echo "   - Port: 3000"
            ;;
        2)
            echo -e "${BLUE}Setting up AWS ECS...${NC}"
            echo "Use the provided docker-compose.prod.yml with AWS ECS CLI"
            ;;
        3)
            echo -e "${BLUE}Setting up AWS EC2...${NC}"
            echo "Launch an EC2 instance and run the DigitalOcean steps above"
            ;;
    esac
}

# Function to deploy to Google Cloud
deploy_gcp() {
    echo -e "${BLUE}☁️  Deploying to Google Cloud...${NC}"
    
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ Google Cloud CLI is not installed.${NC}"
        echo -e "${YELLOW}   Install: https://cloud.google.com/sdk/docs/install${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📋 Google Cloud Deployment Options:${NC}"
    echo ""
    echo "1. 🚀 Cloud Run (Recommended)"
    echo "2. 🐳 Google Kubernetes Engine (GKE)"
    echo "3. 🖥️  Compute Engine VM"
    echo ""
    
    read -p "Choose deployment method (1-3): " gcp_method
    
    case $gcp_method in
        1)
            echo -e "${BLUE}Deploying to Cloud Run...${NC}"
            echo "gcloud run deploy ufc-platform --source . --platform managed --region us-central1 --allow-unauthenticated"
            ;;
        2)
            echo -e "${BLUE}Deploying to GKE...${NC}"
            echo "Use the Kubernetes manifests in k8s/ directory"
            ;;
        3)
            echo -e "${BLUE}Deploying to Compute Engine...${NC}"
            echo "Create a VM and follow the DigitalOcean deployment steps"
            ;;
    esac
}

# Function to deploy to Azure
deploy_azure() {
    echo -e "${BLUE}☁️  Deploying to Microsoft Azure...${NC}"
    
    if ! command -v az &> /dev/null; then
        echo -e "${RED}❌ Azure CLI is not installed.${NC}"
        echo -e "${YELLOW}   Install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📋 Azure Deployment Options:${NC}"
    echo ""
    echo "1. 🚀 Azure Container Instances"
    echo "2. 🐳 Azure Kubernetes Service (AKS)"
    echo "3. 🖥️  Azure Virtual Machine"
    echo ""
    
    read -p "Choose deployment method (1-3): " azure_method
    
    case $azure_method in
        1)
            echo -e "${BLUE}Deploying to Container Instances...${NC}"
            echo "az container create --resource-group myResourceGroup --name ufc-platform --image your-registry/ufc-platform:latest"
            ;;
        2)
            echo -e "${BLUE}Deploying to AKS...${NC}"
            echo "Use the Kubernetes manifests in k8s/ directory"
            ;;
        3)
            echo -e "${BLUE}Deploying to VM...${NC}"
            echo "Create a VM and follow the DigitalOcean deployment steps"
            ;;
    esac
}

# Function to deploy to Vercel
deploy_vercel() {
    echo -e "${BLUE}▲ Deploying to Vercel...${NC}"
    
    if ! command -v vercel &> /dev/null; then
        echo -e "${YELLOW}Installing Vercel CLI...${NC}"
        npm install -g vercel
    fi
    
    echo -e "${GREEN}🚀 Deploying to Vercel...${NC}"
    vercel --prod
    
    echo -e "${GREEN}✅ Deployed to Vercel!${NC}"
    echo -e "${YELLOW}Your app will be available at the URL shown above${NC}"
}

# Function to deploy to Netlify
deploy_netlify() {
    echo -e "${BLUE}🌐 Deploying to Netlify...${NC}"
    
    if ! command -v netlify &> /dev/null; then
        echo -e "${YELLOW}Installing Netlify CLI...${NC}"
        npm install -g netlify-cli
    fi
    
    echo -e "${GREEN}🚀 Deploying to Netlify...${NC}"
    netlify deploy --prod --dir=packages/frontend/public
    
    echo -e "${GREEN}✅ Deployed to Netlify!${NC}"
}

# Main menu
echo -e "${GREEN}Choose your cloud provider:${NC}"
echo ""
echo "1. 🌊 DigitalOcean (Recommended for beginners)"
echo "2. ☁️  Amazon Web Services (AWS)"
echo "3. ☁️  Google Cloud Platform (GCP)"
echo "4. ☁️  Microsoft Azure"
echo "5. ▲ Vercel (Serverless, great for demos)"
echo "6. 🌐 Netlify (Static + Functions)"
echo "7. 🐳 Local Docker Production Setup"
echo ""

read -p "Enter your choice (1-7): " choice

case $choice in
    1)
        deploy_digitalocean
        ;;
    2)
        deploy_aws
        ;;
    3)
        deploy_gcp
        ;;
    4)
        deploy_azure
        ;;
    5)
        deploy_vercel
        ;;
    6)
        deploy_netlify
        ;;
    7)
        echo -e "${BLUE}🐳 Running local production setup...${NC}"
        ./scripts/deploy-production.sh
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Deployment process initiated!${NC}"
echo -e "${YELLOW}📝 Don't forget to:${NC}"
echo "   • Set up your domain name"
echo "   • Configure SSL certificates"
echo "   • Set up monitoring and backups"
echo "   • Configure environment variables"
echo "   • Test all endpoints"