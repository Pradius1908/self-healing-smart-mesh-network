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