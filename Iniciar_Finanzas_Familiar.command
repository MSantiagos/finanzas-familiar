#!/bin/zsh
cd "$(dirname "$0")"
PORT=8090
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "========================================================"
echo "🛡️  FINANZAS FAMILIAR — SERVIDOR WIFI SINCRONIZADO"
echo "========================================================"
echo "👉 En este Mac:             http://localhost:$PORT"
echo "📱 En iPhones (WiFi Casa):  http://$LOCAL_IP:$PORT"
echo "========================================================"
echo "Ambos iPhones y este Mac comparten los mismos datos en vivo."

(sleep 1 && open "http://localhost:$PORT") &
python3 server.py
