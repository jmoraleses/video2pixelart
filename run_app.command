#!/bin/bash
cd "$(dirname "$0")"

# Activate venv if it exists
if [ -d ".venv" ]; then
    echo "🐍 Activating virtual environment (.venv)..."
    source .venv/bin/activate
fi

echo "🔧 Installing required libraries..."
python3 -m pip install -r requirements.txt

echo "🚀 Starting Python AI Backend..."
# Kill any existing process on port 8000 (optional but helpful)
lsof -ti:8000 | xargs kill -9 2>/dev/null

python3 backend.py &
SERVER_PID=$!

echo "⏳ Waiting for server to start..."
sleep 3

echo "✅ Server running (PID: $SERVER_PID)! Opening browser..."
open http://localhost:8000

# Keep script running to show logs
wait $SERVER_PID

