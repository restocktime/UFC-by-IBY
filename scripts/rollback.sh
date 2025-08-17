#!/bin/bash

# Rollback Script
# Provides safe rollback procedures for production deployments

set -e

# Configuration
NAMESPACE=${NAMESPACE:-ufc-platform}
ROLLBACK_REVISION=${ROLLBACK_REVISION:-}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Show current deployment status
show_current_status() {
    log_info "Current deployment status in namespace '$NAMESPACE':"
    echo ""
    
    local deployments=("api-deployment" "frontend-deployment" "ml-deployment")
    
    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            echo "=== $deployment ==="
            kubectl get deployment "$deployment" -n "$NAMESPACE"
            echo ""
            
            # Show rollout history
            echo "Rollout history:"
            kubectl rollout history deployment/"$deployment" -n "$NAMESPACE"
            echo ""
        else
            log_warn "Deployment '$deployment' not found"
        fi
    done
}

# Show rollout history for a specific deployment
show_rollout_history() {
    local deployment="$1"
    
    log_info "Rollout history for '$deployment':"
    kubectl rollout history deployment/"$deployment" -n "$NAMESPACE"
    
    if [ -n "$ROLLBACK_REVISION" ]; then
        log_info "Details for revision $ROLLBACK_REVISION:"
        kubectl rollout history deployment/"$deployment" -n "$NAMESPACE" --revision="$ROLLBACK_REVISION"
    fi
}

# Perform rollback for a specific deployment
rollback_deployment() {
    local deployment="$1"
    local revision="$2"
    
    log_info "Rolling back deployment '$deployment'..."
    
    if [ -n "$revision" ]; then
        log_info "Rolling back to revision $revision"
        kubectl rollout undo deployment/"$deployment" -n "$NAMESPACE" --to-revision="$revision"
    else
        log_info "Rolling back to previous revision"
        kubectl rollout undo deployment/"$deployment" -n "$NAMESPACE"
    fi
    
    # Wait for rollback to complete
    log_info "Waiting for rollback to complete..."
    if kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout=300s; then
        log_info "Rollback completed successfully for '$deployment'"
    else
        log_error "Rollback failed for '$deployment'"
        return 1
    fi
}

# Perform rollback for all deployments
rollback_all_deployments() {
    local deployments=("api-deployment" "frontend-deployment" "ml-deployment")
    local failed_rollbacks=()
    
    log_info "Rolling back all deployments..."
    
    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            if rollback_deployment "$deployment" "$ROLLBACK_REVISION"; then
                log_info "✅ Rollback successful for '$deployment'"
            else
                log_error "❌ Rollback failed for '$deployment'"
                failed_rollbacks+=("$deployment")
            fi
        else
            log_warn "Deployment '$deployment' not found, skipping"
        fi
    done
    
    if [ ${#failed_rollbacks[@]} -eq 0 ]; then
        log_info "All rollbacks completed successfully! 🎉"
    else
        log_error "Some rollbacks failed: ${failed_rollbacks[*]}"
        return 1
    fi
}

# Verify rollback success
verify_rollback() {
    log_info "Verifying rollback success..."
    
    local deployments=("api-deployment" "frontend-deployment" "ml-deployment")
    local apps=("ufc-api" "ufc-frontend" "ufc-ml")
    local services=("api-service:3000" "frontend-service:80" "ml-service:3001")
    
    # Check deployment status
    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            local ready_replicas=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
            local desired_replicas=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
            
            if [ "$ready_replicas" = "$desired_replicas" ]; then
                log_info "✅ Deployment '$deployment' is healthy ($ready_replicas/$desired_replicas replicas ready)"
            else
                log_error "❌ Deployment '$deployment' is not healthy ($ready_replicas/$desired_replicas replicas ready)"
                return 1
            fi
        fi
    done
    
    # Check pod status
    for app in "${apps[@]}"; do
        if kubectl wait --for=condition=ready pod -l "app=$app" -n "$NAMESPACE" --timeout=60s &> /dev/null; then
            log_info "✅ Pods for '$app' are ready"
        else
            log_error "❌ Pods for '$app' are not ready"
            return 1
        fi
    done
    
    # Test service health
    for service_port in "${services[@]}"; do
        local service=$(echo "$service_port" | cut -d: -f1)
        local port=$(echo "$service_port" | cut -d: -f2)
        
        if kubectl run verify-rollback-"$service" \
            --image=curlimages/curl:latest \
            --rm -i --restart=Never \
            --namespace="$NAMESPACE" \
            --timeout=30s \
            -- curl -f -s "http://$service.$NAMESPACE.svc.cluster.local:$port/health" &> /dev/null; then
            log_info "✅ Service '$service' health check passed"
        else
            log_error "❌ Service '$service' health check failed"
            return 1
        fi
    done
    
    log_info "Rollback verification completed successfully! 🎉"
}

# Create rollback report
create_rollback_report() {
    local report_file="rollback-report-$(date +%Y%m%d-%H%M%S).txt"
    
    log_info "Creating rollback report: $report_file"
    
    {
        echo "=== Rollback Report ==="
        echo "Timestamp: $(date)"
        echo "Namespace: $NAMESPACE"
        echo "Rollback Revision: ${ROLLBACK_REVISION:-previous}"
        echo ""
        
        echo "=== Post-Rollback Deployment Status ==="
        kubectl get deployments -n "$NAMESPACE"
        echo ""
        
        echo "=== Post-Rollback Pod Status ==="
        kubectl get pods -n "$NAMESPACE"
        echo ""
        
        echo "=== Service Status ==="
        kubectl get services -n "$NAMESPACE"
        echo ""
        
        echo "=== Events (Last 10) ==="
        kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10
        echo ""
        
        echo "=== Rollout History ==="
        for deployment in api-deployment frontend-deployment ml-deployment; do
            if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
                echo "--- $deployment ---"
                kubectl rollout history deployment/"$deployment" -n "$NAMESPACE"
                echo ""
            fi
        done
    } > "$report_file"
    
    log_info "Rollback report saved to: $report_file"
}

# Interactive rollback mode
interactive_rollback() {
    log_info "Starting interactive rollback mode..."
    
    show_current_status
    
    echo ""
    read -p "Do you want to proceed with rollback? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi
    
    echo ""
    echo "Select rollback option:"
    echo "1) Rollback all deployments to previous revision"
    echo "2) Rollback all deployments to specific revision"
    echo "3) Rollback specific deployment"
    echo "4) Show rollout history only"
    echo ""
    read -p "Enter your choice (1-4): " -n 1 -r choice
    echo ""
    
    case $choice in
        1)
            log_info "Rolling back all deployments to previous revision..."
            rollback_all_deployments
            verify_rollback
            create_rollback_report
            ;;
        2)
            read -p "Enter revision number: " revision
            ROLLBACK_REVISION="$revision"
            log_info "Rolling back all deployments to revision $revision..."
            rollback_all_deployments
            verify_rollback
            create_rollback_report
            ;;
        3)
            echo "Available deployments:"
            kubectl get deployments -n "$NAMESPACE" --no-headers | awk '{print "- " $1}'
            echo ""
            read -p "Enter deployment name: " deployment
            read -p "Enter revision number (leave empty for previous): " revision
            rollback_deployment "$deployment" "$revision"
            verify_rollback
            create_rollback_report
            ;;
        4)
            for deployment in api-deployment frontend-deployment ml-deployment; do
                if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
                    show_rollout_history "$deployment"
                    echo ""
                fi
            done
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Show help
show_help() {
    cat << EOF
Rollback Script for UFC Prediction Platform

Usage: $0 [options] [command]

Commands:
  interactive     Start interactive rollback mode (default)
  rollback-all    Rollback all deployments
  rollback <dep>  Rollback specific deployment
  status          Show current deployment status
  history         Show rollout history
  verify          Verify current deployment health

Options:
  --namespace <ns>    Set namespace (default: ufc-platform)
  --revision <rev>    Set specific revision to rollback to
  --help, -h          Show this help message

Environment variables:
  NAMESPACE           Kubernetes namespace
  ROLLBACK_REVISION   Specific revision to rollback to

Examples:
  $0                                    # Interactive mode
  $0 rollback-all                       # Rollback all deployments
  $0 rollback api-deployment            # Rollback specific deployment
  $0 --revision 3 rollback-all          # Rollback all to revision 3
  $0 --namespace staging status         # Show status in staging namespace

EOF
}

# Main execution
main() {
    local command="${1:-interactive}"
    
    case "$command" in
        interactive)
            check_prerequisites
            interactive_rollback
            ;;
        rollback-all)
            check_prerequisites
            rollback_all_deployments
            verify_rollback
            create_rollback_report
            ;;
        rollback)
            if [ -z "$2" ]; then
                log_error "Deployment name required for rollback command"
                exit 1
            fi
            check_prerequisites
            rollback_deployment "$2" "$ROLLBACK_REVISION"
            verify_rollback
            create_rollback_report
            ;;
        status)
            check_prerequisites
            show_current_status
            ;;
        history)
            check_prerequisites
            for deployment in api-deployment frontend-deployment ml-deployment; do
                if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
                    show_rollout_history "$deployment"
                    echo ""
                fi
            done
            ;;
        verify)
            check_prerequisites
            verify_rollback
            ;;
        --help|-h|help)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --revision)
            ROLLBACK_REVISION="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            break
            ;;
    esac
done

# Run main function with remaining arguments
main "$@"