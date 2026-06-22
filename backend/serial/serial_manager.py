import json
import time
import threading
import random
from typing import Callable, Optional

# Attempt to import serial.
try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

class SerialManager:
    def __init__(self, graph, on_packet_received: Callable[[dict], None]):
        self.graph = graph
        self.on_packet_received = on_packet_received
        
        self.port: Optional[str] = None
        self.baudrate = 115200
        self.serial_conn: Optional[serial.Serial] = None
        self.is_mock = True
        self.running = False
        
        # Threads
        self.thread: Optional[threading.Thread] = None
        self.watchdog_thread: Optional[threading.Thread] = None

    def start(self, preferred_port: Optional[str] = None):
        self.running = True
        
        # Start the background COM port connection watchdog thread
        self.watchdog_thread = threading.Thread(target=self._serial_connect_watchdog, args=(preferred_port,), daemon=True)
        self.watchdog_thread.start()
        print("[SERIAL] Hot-plug watchdog started. Scanning for ESP32 Gateway...")

    def stop(self):
        self.running = False
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
        print("[SERIAL] Stopped.")

    def send_packet(self, packet: dict):
        """Sends a JSON command packet to the Gateway via Serial."""
        packet_str = json.dumps(packet)
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write((packet_str + "\n").encode('utf-8'))
                print(f"[SERIAL TX] Sent: {packet_str}")
            except Exception as e:
                print(f"[SERIAL TX ERROR] Failed to send packet: {e}")
                self._handle_disconnect()
        else:
            print(f"[SERIAL TX WARNING] Discarding packet. Gateway offline: {packet_str}")

    # =========================================================================
    # HOT-PLUG SERIAL PORT CONNECTION WATCHDOG
    # =========================================================================
    def _serial_connect_watchdog(self, preferred_port: Optional[str] = None):
        while self.running:
            if not self.serial_conn or not self.serial_conn.is_open:
                if SERIAL_AVAILABLE:
                    ports = list(serial.tools.list_ports.comports())
                    port_names = [p.device for p in ports]
                    
                    target_port = preferred_port
                    connected = False
                    
                    # 1. Try preferred port if specified
                    if target_port and target_port in port_names:
                        try:
                            self._establish_connection(target_port)
                            connected = True
                        except Exception:
                            pass
                            
                    # 2. Iterate through all active COM ports until one successfully opens
                    if not connected and port_names:
                        for p_name in port_names:
                            try:
                                self._establish_connection(p_name)
                                connected = True
                                break
                            except Exception:
                                pass
                                
                    if not connected:
                        # No physical hardware gateway found on any COM port
                        self._handle_disconnect()
                else:
                    print("[SERIAL WARNING] pyserial library is not available.")
                    self._handle_disconnect()
                    
            time.sleep(2.0) # Check ports every 2 seconds

    def _establish_connection(self, port_name: str):
        """Attempts to open a connection to the specified serial port."""
        self.serial_conn = serial.Serial(port_name, self.baudrate, timeout=1.0)
        self.port = port_name
        self.is_mock = False
        self.graph.is_mock = False
        
        # Mark Gateway Node E as ONLINE immediately
        self.graph.node_states['E']['status'] = 'ONLINE'
        self.graph.node_states['E']['last_seen'] = time.time()
        
        print(f"[SERIAL] Successfully connected to Gateway Node E on {port_name}")
        
        # Broadcast connection notification to frontend
        self.on_packet_received({
            "id": f"SYS_CONNECT_{int(time.time() * 1000)}",
            "type": "SYSTEM",
            "source": "E",
            "destination": "ALL",
            "nextHop": "ALL",
            "priority": "SYSTEM",
            "timestamp": int(time.time() * 1000),
            "payload": {
                "text": f"Connected to Gateway Node E on {port_name}"
            }
        })
        
        # Spin up the read loop thread
        self.thread = threading.Thread(target=self._serial_read_loop, daemon=True)
        self.thread.start()

    def _handle_disconnect(self):
        """Resets connections and updates node states to OFFLINE when connection drops."""
        self.is_mock = True
        self.graph.is_mock = True
        if self.serial_conn:
            try:
                self.serial_conn.close()
            except Exception:
                pass
            self.serial_conn = None
            
        any_change = False
        for n in self.graph.nodes:
            if self.graph.node_states[n]['status'] != 'OFFLINE':
                self.graph.node_states[n]['status'] = 'OFFLINE'
                any_change = True
                
        if any_change:
            print("[SERIAL] Lost Gateway connection. All nodes set to OFFLINE.")
            self.on_packet_received({
                "id": f"SYS_DISCONNECT_{int(time.time() * 1000)}",
                "type": "SYSTEM",
                "source": "E",
                "destination": "ALL",
                "nextHop": "ALL",
                "priority": "SYSTEM",
                "timestamp": int(time.time() * 1000),
                "payload": {
                    "text": "Gateway connection lost. Scanning COM ports..."
                }
            })

    # =========================================================================
    # REAL SERIAL READING LOOP
    # =========================================================================
    def _serial_read_loop(self):
        buffer = ""
        while self.running and self.serial_conn and self.serial_conn.is_open:
            try:
                if self.serial_conn.in_waiting > 0:
                    data = self.serial_conn.read(self.serial_conn.in_waiting).decode('utf-8', errors='ignore')
                    buffer += data
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if line:
                            self._process_raw_line(line)
                else:
                    time.sleep(0.05)
            except Exception as e:
                print(f"[SERIAL RX ERROR] Error reading: {e}")
                self._handle_disconnect()
                break

    def _process_raw_line(self, line: str):
        try:
            packet = json.loads(line)
            if "type" in packet and "source" in packet:
                self._handle_incoming_packet(packet)
        except json.JSONDecodeError:
            # Prints non-JSON serial outputs (debug prints)
            print(f"[ESP32 Debug] {line}")
            
            # Send raw debug print to frontend dashboard via WS broadcaster callback
            self.on_packet_received({
                "type": "DEBUG_LOG",
                "source": "E",
                "payload": {
                    "text": line
                },
                "timestamp": int(time.time() * 1000)
            })

    # =========================================================================
    # COMMON PACKET HANDLER
    # =========================================================================
    def _handle_incoming_packet(self, packet: dict):
        packet_type = packet.get("type")
        source = packet.get("source")
        
        # Track statistics
        self.graph.packet_ack_count += 1
        
        # Automatically update node heartbeat (mark ONLINE) for ANY packet received from a valid node
        if source in self.graph.nodes:
            payload = packet.get("payload", {})
            battery = 100
            if isinstance(payload, dict):
                battery = payload.get("battery", 100)
            is_new = self.graph.update_node_heartbeat(source, battery)
            if is_new:
                print(f"[SYSTEM] Node {source} discovered (ONLINE) via {packet_type}!")
        
        # 1. RTT updates
        if packet_type == "SYSTEM":
            payload = packet.get("payload", {})
            target = payload.get("target")
            rtt = payload.get("rtt")
            if target and rtt is not None:
                self.graph.set_link_weight(source, target, float(rtt))

        # 2. Emergency Mode activation
        elif packet_type == "EMERGENCY":
            if self.graph.current_mode != 'EMERGENCY':
                self.graph.current_mode = 'EMERGENCY'
                print(f"[SYSTEM] Emergency status reported by Node {source}!")
                
        # 3. Emergency Mode restoration
        elif packet_type == "NORMAL_RESTORE":
            if self.graph.current_mode != 'NORMAL':
                self.graph.current_mode = 'NORMAL'
                print(f"[SYSTEM] Normal operation restored by Node {source}!")

        # Push to WS broadcaster
        self.on_packet_received(packet)
