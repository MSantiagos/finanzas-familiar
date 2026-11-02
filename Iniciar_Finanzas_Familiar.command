#!/bin/zsh
cd "$(dirname "$0")"
PORT=8090

if ! command -v python3 >/dev/null 2>&1; then
  echo "===================================================================="
  echo "❌ [ERROR] No se encontró python3 instalado en este Mac."
  echo "Instala las herramientas de línea de comandos con: xcode-select --install"
  echo "===================================================================="
  read -k 1 "?Presiona cualquier tecla para salir..."
  exit 1
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || python3 -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2>/dev/null || echo "localhost")

echo "===================================================================="
echo "  🛡️  FINANZAS FAMILIAR — SERVIDOR WIFI SINCRONIZADO (CRDT-Lite)"
echo "===================================================================="
echo ""
echo "  💻 En este Mac:                   http://localhost:$PORT"
echo "  📱 iPhones Mauricio y Marie:      http://$LOCAL_IP:$PORT"
echo ""
echo "--------------------------------------------------------------------"
echo "  • Abre la URL WiFi en Safari en ambos iPhones (misma red WiFi)."
echo "  • Toca 'Compartir -> Agregar a pantalla de inicio' para modo PWA."
echo "  • Sincronización CRDT-Lite activa: ambos iPhones y este Mac"
echo "    fusionan movimientos en tiempo real sin pisarse los datos."
echo "  • Presiona Ctrl+C en esta ventana cuando desees detener el servidor."
echo "===================================================================="
echo ""

(sleep 1 && open "http://localhost:$PORT") &
python3 server.py
