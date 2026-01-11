#!/bin/bash
# ViewApp Production Startup Script
# Kills any process on port 4001 and starts Next.js production server

set -e

VIEWAPP_PORT=4001

echo "=========================================="
echo "  ViewApp - Production Server Startup"
echo "=========================================="
echo ""

# Function to kill process on a port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Killing process(es) on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    else
        echo "Port $port is free"
    fi
}

# Kill ViewApp port
echo "Checking port $VIEWAPP_PORT..."
kill_port $VIEWAPP_PORT

echo ""
echo "Port Configuration:"
echo "  ViewApp:            http://localhost:$VIEWAPP_PORT"
echo "  OCI Coordinator:    http://localhost:8001 (status, tools, agents)"
echo "  Coordinator API:    http://localhost:3001 (logs, chat)"
echo ""

# Check if build exists
if [ ! -d ".next" ]; then
    echo "ERROR: No production build found. Run 'npm run build' first."
    exit 1
fi

# Check coordinator connectivity
echo "Checking OCI Coordinator connectivity..."
if curl -s --connect-timeout 2 http://localhost:8001/status > /dev/null 2>&1; then
    echo "  OCI Coordinator (8001): CONNECTED"
else
    echo "  OCI Coordinator (8001): NOT AVAILABLE"
fi

if curl -s --connect-timeout 2 http://localhost:3001/health > /dev/null 2>&1; then
    echo "  Coordinator API (3001): CONNECTED"
else
    echo "  Coordinator API (3001): NOT AVAILABLE"
fi

echo ""
echo "Starting Next.js production server on port $VIEWAPP_PORT..."
echo "=========================================="
echo ""

# Start Next.js production server
exec npm run start
