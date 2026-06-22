# Adaptive Self-Healing Disaster Communication Mesh Network

A research-grade prototype of an emergency mesh communication system designed for resilient disaster-zone communications. The system features 5 ESP32 peer-to-peer nodes, an intelligent Python controller, and a web dashboard.

---

## Project Structure

```text
disaster-mesh/
│
├── firmware/
│   ├── esp32/            # Common ESP32 node firmware
│   └── gateway/          # Gateway-specific deployment firmware (Node E)
│
├── backend/              # Python FastAPI + PySerial Backend
│   ├── routing/          # Pathfinding & Network Graph Logic
│   ├── websocket/        # WebSockets dashboard communication
│   ├── serial/           # Serial communication gateway reader/writer
│   └── api/              # HTTP APIs
│
├── frontend/             # React Dashboard Client
│   ├── src/
│   ├── components/
│   ├── pages/
│   └── assets/
│
├── docs/                 # Research, Architecture & Protocol Specs
│   ├── architecture.md
│   ├── protocol.md
│   └── research_notes.md
│
└── README.md             # This file
```

---

## How it Works

1. **Topology**: 5 nodes designated 'A', 'B', 'C', 'D', and 'E'.
2. **Gateway**: Node 'E' is connected to the laptop. It transmits mesh packets to the Python backend via Serial and injects backend commands (`SET_ROUTE`, `SET_MODE`) back into the mesh.
3. **Decoupled Routing**: Nodes only perform packet forwarding based on a local next-hop table. The backend runs routing algorithms (Dijkstra and A*) and dynamically updates the node tables to heal and optimize paths.
