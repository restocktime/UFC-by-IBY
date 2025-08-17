#!/bin/bash

# Deployment Test Script
# Tests deployment readiness and validates service health

set -e

# Configuration
NAMESPACE=${NAMESPACE:-ufc-platform}
TIMEOUT=${TIMEOUT:-300}
API_SERVICE=${API_SERVICE:-api-service}
FRONTEND_SERVICE=${FRONTEND_SERVICE:-frontend-service}
ML_SERVICE=${ML_SERVICE:-ml-service}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_info "kubectl is available and connected to cluster"
}

# Check if namespace exists
check_namespace() {
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    log_info "Namespace '$NAMESPACE' exists"
}

# Wait for deployments to be ready
wait_for_deployments() {
    local deployments=("api-deployment" "frontend-deployment" "ml-deployment")
    
    for deployment in "${deployments[@]}"; do
        log_info "Waiting for deployment '$deployment' to be ready..."
        
        if kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
            log_info "Deployment '$deployment' is ready"
        else
            log_error "Deployment '$deployment' failed to become ready within ${TIMEOUT}s"
            return 1
        fi
    done
}

# Wait for pods to be ready
wait_for_pods() {
    local apps=("ufc-api" "ufc-frontend" "ufc-ml")
    
    for app in "${apps[@]}"; do
        log_info "Waiting for pods with label 'app=$app' to be ready..."
        
        if kubectl wait --for=condition=ready pod -l "app=$app" -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
            log_info "Pods for '$app' are ready"
        else
            log_error "Pods for '$app' failed to become ready within ${TIMEOUT}s"
            return 1
        fi
    done
}

# Test service connectivity
test_service_connectivity() {
    local services=("$API_SERVICE:3000" "$FRONTEND_SERVICE:80" "$ML_SERVICE:3001")
    
    for service_port in "${services[@]}"; do
        local service=$(echo "$service_port" | cut -d: -f1)
        local port=$(echo "$service_port" | cut -d: -f2)
        
        log_info "Testing connectivity to service '$service' on port $port..."
        
        if kubectl get service "$service" -n "$NAMESPACE" &> /dev/null; then
            log_info "Service '$service' exists"
            
            # Test internal connectivity using a temporary pod
            if kubectl run test-connectivity-"$service" \
                --image=curlimages/curl:latest \
                --rm -i --restart=Never \
                --namespace="$NAMESPACE" \
                --timeout=30s \
                -- curl -f -s "http://$service.$NAMESPACE.svc.cluster.local:$port/health" &> /dev/null; then
                log_info "Service '$service' is responding to health checks"
            else
                log_error "Service '$service' is not responding to health checks"
                return 1
            fi
        else
            log_error "Service '$service' does not exist"
            return 1
        fi
    done
}

# Test API endpoints
test_api_endpoints() {
    log_info "Testing API endpoints..."
    
    local api_pod=$(kubectl get pods -n "$NAMESPACE" -l app=ufc-api -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$api_pod" ]; then
        log_error "No API pods found"
        return 1
    fi
    
    # Test health endpoint
    if kubectl exec -n "$NAMESPACE" "$api_pod" -- curl -f -s http://localhost:3000/health > /dev/null; then
        log_info "API health endpoint is working"
    else
        log_error "API health endpoint is not working"
        return 1
    fi
    
    # Test detailed health endpoint
    if kubectl exec -n "$NAMESPACE" "$api_pod" -- curl -f -s http://localhost:3000/health/detailed > /dev/null; then
        log_info "API detailed health endpoint is working"
    else
        log_warn "API detailed health endpoint is not working (non-critical)"
    fi
}

# Test frontend endpoints
test_frontend_endpoints() {
    log_info "Testing frontend endpoints..."
    
    local frontend_pod=$(kubectl get pods -n "$NAMESPACE" -l app=ufc-frontend -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$frontend_pod" ]; then
        log_error "No frontend pods found"
        return 1
    fi
    
    # Test health endpoint
    if kubectl exec -n "$NAMESPACE" "$frontend_pod" -- wget --spider -q http://localhost/health; then
        log_info "Frontend health endpoint is working"
    else
        log_error "Frontend health endpoint is not working"
        return 1
    fi
    
    # Test main page
    if kubectl exec -n "$NAMESPACE" "$frontend_pod" -- wget --spider -q http://localhost/; then
        log_info "Frontend main page is accessible"
    else
        log_error "Frontend main page is not accessible"
        return 1
    fi
}

# Test ML service endpoints
test_ml_endpoints() {
    log_info "Testing ML service endpoints..."
    
    local ml_pod=$(kubectl get pods -n "$NAMESPACE" -l app=ufc-ml -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$ml_pod" ]; then
        log_error "No ML pods found"
        return 1
    fi
    
    # Test health endpoint
    if kubectl exec -n "$NAMESPACE" "$ml_pod" -- curl -f -s http://localhost:3001/health > /dev/null; then
        log_info "ML service health endpoint is working"
    else
        log_error "ML service health endpoint is not working"
        return 1
    fi
}

# Check resource usage
check_resource_usage() {
    log_info "Checking resource usage..."
    
    # Get pod resource usage
    kubectl top pods -n "$NAMESPACE" --no-headers 2>/dev/null || log_warn "Metrics server not available, skipping resource usage check"
    
    # Check for pods with high restart counts
    local high_restart_pods=$(kubectl get pods -n "$NAMESPACE" --no-headers | awk '$4 > 5 {print $1}')
    
    if [ -n "$high_restart_pods" ]; then
        log_warn "Pods with high restart counts detected:"
        echo "$high_restart_pods"
    else
        log_info "No pods with high restart counts detected"
    fi
}

# Check HPA status
check_hpa_status() {
    log_info "Checking HPA status..."
    
    local hpas=("api-hpa" "frontend-hpa" "ml-hpa")
    
    for hpa in "${hpas[@]}"; do
        if kubectl get hpa "$hpa" -n "$NAMESPACE" &> /dev/null; then
            local status=$(kubectl get hpa "$hpa" -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="ScalingActive")].status}')
            if [ "$status" = "True" ]; then
                log_info "HPA '$hpa' is active"
            else
                log_warn "HPA '$hpa' is not active"
            fi
        else
            log_warn "HPA '$hpa' does not exist"
        fi
    done
}

# Generate deployment report
generate_report() {
    log_info "Generating deployment report..."
    
    echo "=== Deployment Report ===" > deployment-report.txt
    echo "Timestamp: $(date)" >> deployment-report.txt
    echo "Namespace: $NAMESPACE" >> deployment-report.txt
    echo "" >> deployment-report.txt
    
    echo "=== Deployments ===" >> deployment-report.txt
    kubectl get deployments -n "$NAMESPACE" >> deployment-report.txt
    echo "" >> deployment-report.txt
    
    echo "=== Pods ===" >> deployment-report.txt
    kubectl get pods -n "$NAMESPACE" >> deployment-report.txt
    echo "" >> deployment-report.txt
    
    echo "=== Services ===" >> deployment-report.txt
    kubectl get services -n "$NAMESPACE" >> deployment-report.txt
    echo "" >> deployment-report.txt
    
    echo "=== HPA Status ===" >> deployment-report.txt
    kubectl get hpa -n "$NAMESPACE" >> deployment-report.txt 2>/dev/null || echo "No HPA found" >> deployment-report.txt
    echo "" >> deployment-report.txt
    
    log_info "Deployment report saved to deployment-report.txt"
}

# Main execution
main() {
    log_info "Starting deployment tests for namespace '$NAMESPACE'..."
    
    # Pre-flight checks
    check_kubectl
    check_namespace
    
    # Wait for deployments and pods
    wait_for_deployments
    wait_for_pods
    
    # Test services
    test_service_connectivity
    test_api_endpoints
    test_frontend_endpoints
    test_ml_endpoints
    
    # Additional checks
    check_resource_usage
    check_hpa_status
    
    # Generate report
    generate_report
    
    log_info "All deployment tests passed successfully! 🎉"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --namespace    Set namespace (default: ufc-platform)"
        echo "  --timeout      Set timeout in seconds (default: 300)"
        echo ""
        echo "Environment variables:"
        echo "  NAMESPACE      Kubernetes namespace"
        echo "  TIMEOUT        Timeout for operations"
        exit 0
        ;;
    --namespace)
        NAMESPACE="$2"
        shift 2
        ;;
    --timeout)
        TIMEOUT="$2"
        shift 2
        ;;
esac

# Run main function
main "$@"