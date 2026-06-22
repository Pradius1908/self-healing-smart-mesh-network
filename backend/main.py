import asyncio
import time
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from backend.routing.graph import RoutingGraph
from backend.serial.serial_manager import SerialManager
from backend.websocket.ws_server import ConnectionManager

app = FastAPI(title="Disaster Mesh Controller")

# Enable CORS for local React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate core components
graph = RoutingGraph()
ws_manager = ConnectionManager()
serial_manager = SerialManager(graph, on_packet_received=lambda p: handle_incoming_serial_packet(p))

# Keep track of active pathfinding algorithm choice: 'dijkstra' or 'astar'
active_algorithm = 'dijkstra'

# Store event logs to send to new dashboard connections
event_logs = []

def log_event(source: str, event_type: str, details: str):
    log_entry = {
        "timestamp": int(time.time() * 1000),
        "source": source,
        "type": event_type,
        "details": details
    }
    event_logs.append(log_entry)
    # Cap event logs to last 100 entries to prevent memory growth
    if len(event_logs) > 100:
        event_logs.pop(0)
        
    # Broadcast log entry to all connected dashboards
    asyncio.run_coroutine_threadsafe(
        ws_manager.broadcast({
            "type": "EVENT_LOG",
            "log": log_entry
        }),
        loop
    )

def handle_incoming_serial_packet(packet: dict):
    """Processes packets received from the Gateway mesh network."""
    p_type = packet.get("type")
    source = packet.get("source")
    dest = packet.get("destination")
    
    # 1. Forward raw packet to frontend monitor
    asyncio.run_coroutine_threadsafe(
        ws_manager.broadcast({
            "type": "PACKET",
            "packet": packet
        }),
        loop
    )
    
    # 2. Handle specific packet types to log events
    if p_type == "HEARTBEAT":
        # Check if node was previously offline. The serial manager updates graph state.
        pass
    elif p_type == "EMERGENCY":
        log_event(source, "EMERGENCY", f"Node {source} broadcasted EMERGENCY SOS!")
        # Automatically update graph mode and broadcast
        if graph.current_mode != 'EMERGENCY':
            graph.current_mode = 'EMERGENCY'
            trigger_route_programming()
    elif p_type == "NORMAL_RESTORE":
        log_event(source, "NORMAL", f"Node {source} resolved the emergency status.")
        if graph.current_mode != 'NORMAL':
            graph.current_mode = 'NORMAL'
            trigger_route_programming()
    elif p_type == "SYSTEM":
        payload = packet.get("payload", {})
        text = payload.get("text", "")
        rtt = payload.get("rtt")
        target = payload.get("target")
        
        if rtt is not None and target:
            log_event(source, "RTT_UPDATED", f"RTT between {source} and {target}: {rtt} ms")
            # If RTT changes, let's trigger a route recomputation dynamically
            trigger_route_recomputation_if_changed(source, target)
        elif text:
            log_event(source, "SYSTEM", f"Node {source} log: {text}")

    # Broadcast state change to frontend
    asyncio.run_coroutine_threadsafe(
        ws_manager.broadcast({
            "type": "STATE_UPDATE",
            "state": graph.get_serializable_state()
        }),
        loop
    )

# =========================================================================
# ROUTING & COMMAND GENERATION LOGIC
# =========================================================================

def trigger_route_programming():
    """Computes the active route and programs the mesh nodes via serial commands."""
    global active_algorithm
    src = graph.current_source
    dst = graph.current_destination
    
    # Run the selected pathfinding algorithm with performance counter
    start_time = time.perf_counter()
    if active_algorithm == 'astar':
        path = graph.compute_astar(src, dst)
        algo_name = "A*"
    else:
        path = graph.compute_dijkstra(src, dst)
        algo_name = "Dijkstra"
    graph.last_computation_time = time.perf_counter() - start_time

    graph.active_route = path
    
    # Append to metrics history for CSV exports
    pdr = round((graph.packet_ack_count / graph.packet_sent_count * 100) if graph.packet_sent_count > 0 else 100.0, 1)
    graph.metrics_history.append([
        time.strftime('%Y-%m-%d %H:%M:%S'),
        src,
        dst,
        active_algorithm,
        max(0, len(path) - 1),
        pdr,
        round(graph._get_average_rtt(), 1),
        round(graph.last_recovery_time, 3),
        round(graph.last_computation_time * 1000, 4)
    ])
    if len(graph.metrics_history) > 500:
        graph.metrics_history.pop(0)
    
    if path:
        log_event("SYSTEM", "ROUTE_UPDATED", f"Computed {algo_name} path: {' -> '.join(path)}")
        
        # Program each node on the path with its next-hop target
        for i in range(len(path) - 1):
            curr_node = path[i]
            next_node = path[i + 1]
            
            # Create a SET_ROUTE command directed at curr_node, telling it how to reach the end node
            route_cmd = {
                "id": f"SYS_ROUTE_{int(time.time() * 1000)}_{curr_node}",
                "type": "SET_ROUTE",
                "source": "E",
                "destination": curr_node,
                "nextHop": curr_node, # The Gateway E targets the node directly or floods it
                "priority": "SYSTEM",
                "timestamp": int(time.time() * 1000),
                "payload": {
                    "dest": dst,
                    "next": next_node
                }
            }
            serial_manager.send_packet(route_cmd)
    else:
        log_event("SYSTEM", "ROUTE_FAILED", f"No path found between {src} and {dst} using {algo_name}!")

def trigger_route_recomputation_if_changed(u: str, v: str):
    """If RTT fluctuates significantly and the link is on our active path, rerun routing."""
    if u in graph.active_route and v in graph.active_route:
        # Check index ordering to see if they are adjacent on the active route
        idx_u = graph.active_route.index(u)
        idx_v = graph.active_route.index(v)
        if abs(idx_u - idx_v) == 1:
            # Recompute route to dynamically adapt weights
            print(f"[ROUTING] Active route link {u}-{v} cost updated. Recalculating path...")
            trigger_route_programming()

def handle_dashboard_action(msg: dict):
    """Processes control actions received from the React dashboard WebSocket client."""
    global active_algorithm
    action = msg.get("action")
    payload = msg.get("payload", {})
    
    print(f"[WS RX] Action: {action} | Payload: {payload}")
    
    if action == "APPLY_ROUTE":
        # Update source, destination, algorithm
        graph.current_source = payload.get("source", graph.current_source)
        graph.current_destination = payload.get("destination", graph.current_destination)
        active_algorithm = payload.get("algorithm", active_algorithm)
        
        log_event("DASHBOARD", "COMMAND", f"Configuring path: {graph.current_source} to {graph.current_destination} via {active_algorithm}")
        trigger_route_programming()
        
    elif action == "SET_MODE":
        mode = payload.get("mode", "NORMAL")
        graph.current_mode = mode
        log_event("DASHBOARD", "COMMAND", f"Setting network mode to: {mode}")
        
        # Inject mode adjustment command to all nodes
        mode_cmd = {
            "id": f"SYS_MODE_{int(time.time() * 1000)}",
            "type": "SET_MODE",
            "source": "E",
            "destination": "ALL",
            "nextHop": "ALL",
            "priority": "SYSTEM",
            "timestamp": int(time.time() * 1000),
            "payload": {
                "mode": mode
            }
        }
        serial_manager.send_packet(mode_cmd)
        
    elif action == "RESET":
        graph.current_mode = "NORMAL"
        graph.current_source = "A"
        graph.current_destination = "E"
        graph.active_route = []
        # Mark all nodes back to online and reset latencies to bootstrap defaults
        for n in graph.nodes:
            graph.node_states[n]['status'] = 'ONLINE'
            graph.node_states[n]['last_seen'] = time.time()
            graph.node_states[n]['battery'] = 100
        
        graph.rtt_matrix = {u: {v: float('inf') for v in graph.nodes} for u in graph.nodes}
        graph.set_link_weight('A', 'B', 45.0)
        graph.set_link_weight('A', 'C', 60.0)
        graph.set_link_weight('B', 'D', 50.0)
        graph.set_link_weight('C', 'D', 70.0)
        graph.set_link_weight('D', 'E', 30.0)
        
        log_event("DASHBOARD", "RESET", "Network metrics and routes reset to factory defaults.")
        
        # Inject normal reset command
        reset_cmd = {
            "id": f"SYS_RESET_{int(time.time() * 1000)}",
            "type": "SET_MODE",
            "source": "E",
            "destination": "ALL",
            "nextHop": "ALL",
            "priority": "SYSTEM",
            "timestamp": int(time.time() * 1000),
            "payload": {
                "mode": "NORMAL"
            }
        }
        serial_manager.send_packet(reset_cmd)
        
    # Broadcast updated state
    asyncio.run_coroutine_threadsafe(
        ws_manager.broadcast({
            "type": "STATE_UPDATE",
            "state": graph.get_serializable_state()
        }),
        loop
    )

# Assign action listener callback
ws_manager.on_control_action = handle_dashboard_action

# =========================================================================
# BACKGROUND WATCHDOG: HEARTBEAT FAULT DETECTION & SELF-HEALING
# =========================================================================

async def heartbeat_watchdog():
    """Background loop to periodically monitor heartbeats and execute self-healing routes."""
    while True:
        await asyncio.sleep(1.0)
        # Check node timeouts (threshold = 15 seconds)
        dead_nodes = graph.check_timeouts(timeout_threshold=15.0)
        
        for node in dead_nodes:
            log_event("SYSTEM", "NODE_DOWN", f"FAULT DETECTED: Lost connection to Node {node}!")
            
            # Broadcast node down alert packet
            node_down_packet = {
                "id": f"SYS_FAULT_{node}_{int(time.time() * 1000)}",
                "type": "NODE_DOWN",
                "source": node,
                "destination": "ALL",
                "nextHop": "ALL",
                "priority": "SYSTEM",
                "timestamp": int(time.time() * 1000),
                "payload": {}
            }
            await ws_manager.broadcast({
                "type": "PACKET",
                "packet": node_down_packet
            })
            
            # Check if this offline node is part of the currently active path
            if node in graph.active_route:
                log_event("SYSTEM", "SELF_HEAL", f"Node {node} failure broke active route. Rerouting traffic...")
                
                # Measure self-healing recovery time
                heal_start = time.perf_counter()
                trigger_route_programming()
                graph.last_recovery_time = time.perf_counter() - heal_start
                
                log_event("SYSTEM", "SELF_HEAL_DONE", f"Self-Healing completed. Path recovered in {round(graph.last_recovery_time * 1000, 2)} ms.")
                
        if dead_nodes:
            # Broadcast updated state
            await ws_manager.broadcast({
                "type": "STATE_UPDATE",
                "state": graph.get_serializable_state()
            })

# =========================================================================
# METRICS CSV EXPORT ENDPOINT
# =========================================================================

@app.get("/api/metrics/export")
def export_metrics():
    import io
    import csv
    from fastapi.responses import StreamingResponse
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write CSV header row
    writer.writerow([
        "Timestamp", "Source", "Destination", "Algorithm", "Hops", 
        "PDR (%)", "Avg RTT (ms)", "Recovery Time (s)", "Computation Time (ms)"
    ])
    
    # Write logged metrics rows
    for record in graph.metrics_history:
        writer.writerow(record)
        
    output.seek(0)
    return StreamingResponse(
        io.StringIO(output.getvalue()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=mesh_network_metrics.csv"}
    )

@app.on_event("startup")
def startup_event():
    # Save the running event loop globally so background threads can schedule tasks on it
    global loop
    loop = asyncio.get_running_loop()
    
    # Start serial manager
    serial_manager.start()
    
    # Start the watchdog task
    asyncio.create_task(heartbeat_watchdog())
    print("[SERVER] Disaster Mesh Controller booted. Watchdog started.")

@app.on_event("shutdown")
def shutdown_event():
    serial_manager.stop()
    print("[SERVER] Shut down complete.")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Retrieve current network state snapshot
    curr_state = graph.get_serializable_state()
    # Inject historical event logs for layout initialization
    curr_state["eventLogs"] = event_logs
    curr_state["activeAlgorithm"] = active_algorithm
    
    await ws_manager.connect(websocket, curr_state)
    await ws_manager.handle_client_messages(websocket)

if __name__ == "__main__":
    import uvicorn
    # Execute uvicorn server directly on localhost:8001
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8001, reload=False)
