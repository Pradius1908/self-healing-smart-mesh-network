import json
from fastapi import WebSocket, WebSocketDisconnect
from typing import List, Callable, Dict, Any

class ConnectionManager:
    def __init__(self):
        # List of active WebSocket client connections (React Dashboards)
        self.active_connections: List[WebSocket] = []
        
        # Callbacks to handle actions received from the dashboard UI
        self.on_control_action: Optional[Callable[[Dict[str, Any]], None]] = None

    async def connect(self, websocket: WebSocket, initial_state: dict):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WS] Dashboard client connected. Active clients: {len(self.active_connections)}")
        
        # Immediately bootstrap the newly connected frontend client with the current state
        try:
            await websocket.send_json({
                "type": "INIT_STATE",
                "state": initial_state
            })
        except Exception as e:
            print(f"[WS ERROR] Failed to send bootstrap state: {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[WS] Dashboard client disconnected. Active clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Sends a JSON telemetry update to all connected frontend clients."""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Connection might have died, it will be removed during receive/disconnect
                pass

    async def handle_client_messages(self, websocket: WebSocket):
        """Infinite loop reading inputs from the frontend websocket client."""
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    action = message.get("action")
                    if action and self.on_control_action:
                        self.on_control_action(message)
                except json.JSONDecodeError:
                    print(f"[WS WARNING] Received non-JSON text from dashboard: {data}")
        except WebSocketDisconnect:
            self.disconnect(websocket)
        except Exception as e:
            print(f"[WS ERROR] Exception in client receiver loop: {e}")
            self.disconnect(websocket)
