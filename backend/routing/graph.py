import math
import heapq
import time
from typing import Dict, List, Tuple, Optional

# Node coordinate positions for the A* spatial heuristic (Star configuration)
NODE_COORDINATES = {
    'E': (2.5, 0.8),  # Central Hospital E (Gateway) - Top
    'A': (0.9, 1.9),  # Local Clinic A - Top-Left
    'B': (1.5, 3.7),  # Local Clinic B - Bottom-Left
    'C': (3.5, 3.7),  # Civilian Shelter C - Bottom-Right
    'D': (4.1, 1.9)   # Civilian Shelter D - Top-Right
}

class RoutingGraph:
    def __init__(self):
        # Nodes list
        self.nodes = ['A', 'B', 'C', 'D', 'E']
        
        # Node states: initialized as OFFLINE by default (no nodes show on boot)
        self.node_states = {
            'A': {'status': 'OFFLINE', 'role': 'Local Clinic A', 'battery': 0, 'last_seen': 0.0},
            'B': {'status': 'OFFLINE', 'role': 'Local Clinic B', 'battery': 0, 'last_seen': 0.0},
            'C': {'status': 'OFFLINE', 'role': 'Civilian Shelter C', 'battery': 0, 'last_seen': 0.0},
            'D': {'status': 'OFFLINE', 'role': 'Civilian Shelter D', 'battery': 0, 'last_seen': 0.0},
            'E': {'status': 'OFFLINE', 'role': 'Central Hospital E', 'battery': 0, 'last_seen': 0.0}
        }
        
        # Latency (RTT) matrix: stores link weights between adjacent nodes.
        # Initialize default weights for adjacent links to bootstrap the network.
        # Unconnected nodes are float('inf').
        self.rtt_matrix = {u: {v: float('inf') for v in self.nodes} for u in self.nodes}
        
        # Set initial bidirectional mesh topology links (in ms)
        self.set_link_weight('A', 'B', 45.0)
        self.set_link_weight('A', 'C', 60.0)
        self.set_link_weight('A', 'D', 55.0)
        self.set_link_weight('A', 'E', 80.0)
        self.set_link_weight('B', 'C', 50.0)
        self.set_link_weight('B', 'D', 40.0)
        self.set_link_weight('B', 'E', 65.0)
        self.set_link_weight('C', 'D', 70.0)
        self.set_link_weight('C', 'E', 75.0)
        self.set_link_weight('D', 'E', 30.0)
        
        # Global network settings
        self.is_mock = True
        self.current_source = 'A'
        self.current_destination = 'E'
        self.current_mode = 'NORMAL'  # 'NORMAL' or 'EMERGENCY'
        self.active_route: List[str] = []
        
        # Performance Metrics tracking variables
        self.metrics_history = []
        self.packet_sent_count = 0
        self.packet_ack_count = 0
        self.last_recovery_time = 0.0
        self.last_computation_time = 0.0

    def set_link_weight(self, u: str, v: str, weight: float):
        if u in self.nodes and v in self.nodes:
            self.rtt_matrix[u][v] = weight
            self.rtt_matrix[v][u] = weight

    def get_link_weight(self, u: str, v: str) -> float:
        return self.rtt_matrix[u][v]

    def update_node_heartbeat(self, node_id: str, battery: int):
        if node_id in self.node_states:
            is_newly_online = (self.node_states[node_id]['status'] == 'OFFLINE')
            self.node_states[node_id]['last_seen'] = time.time()
            self.node_states[node_id]['status'] = 'ONLINE'
            self.node_states[node_id]['battery'] = battery
            return is_newly_online
        return False

    def check_timeouts(self, timeout_threshold: float = 15.0) -> List[str]:
        """Checks for nodes that haven't sent a heartbeat within the threshold.
        Returns a list of node letters that just timed out.
        """
        now = time.time()
        timed_out_nodes = []
        for node, state in self.node_states.items():
            # Gateway E is connected via Serial and doesn't timeout the same way, 
            # but standard nodes (A, B, C, D) are checked.
            if node != 'E' and state['status'] == 'ONLINE':
                if now - state['last_seen'] > timeout_threshold:
                    state['status'] = 'OFFLINE'
                    timed_out_nodes.append(node)
        return timed_out_nodes

    def get_online_neighbors(self, node: str) -> List[Tuple[str, float]]:
        """Returns adjacent online nodes and their RTT weights."""
        neighbors = []
        if self.node_states[node]['status'] == 'OFFLINE':
            return neighbors
            
        for target, weight in self.rtt_matrix[node].items():
            if weight != float('inf') and self.node_states[target]['status'] == 'ONLINE':
                neighbors.append((target, weight))
        return neighbors

    # =========================================================================
    # DIJKSTRA'S ALGORITHM
    # =========================================================================
    def compute_dijkstra(self, start: str, end: str) -> List[str]:
        """Computes shortest path from start to end using Dijkstra's algorithm.
        Weights are link RTT values.
        """
        if start not in self.nodes or end not in self.nodes:
            return []
        if self.node_states[start]['status'] == 'OFFLINE' or self.node_states[end]['status'] == 'OFFLINE':
            return []

        queue = [(0.0, start, [start])]
        visited = set()

        while queue:
            cost, current, path = heapq.heappop(queue)

            if current in visited:
                continue
            visited.add(current)

            if current == end:
                return path

            for neighbor, weight in self.get_online_neighbors(current):
                if neighbor not in visited:
                    heapq.heappush(queue, (cost + weight, neighbor, path + [neighbor]))

        return []

    # =========================================================================
    # A* SEARCH ALGORITHM
    # =========================================================================
    def compute_astar(self, start: str, end: str) -> List[str]:
        """Computes shortest path from start to end using A* Search.
        Uses Euclidean distance scaled to ms coordinates as heuristic.
        """
        if start not in self.nodes or end not in self.nodes:
            return []
        if self.node_states[start]['status'] == 'OFFLINE' or self.node_states[end]['status'] == 'OFFLINE':
            return []

        def heuristic(n: str, target: str) -> float:
            # Scale Euclidean coordinate distance to estimated latency (ms)
            # 1 coordinate unit ≈ 25ms of RTT latency.
            pos_n = NODE_COORDINATES[n]
            pos_t = NODE_COORDINATES[target]
            dist = math.sqrt((pos_n[0] - pos_t[0])**2 + (pos_n[1] - pos_t[1])**2)
            return dist * 25.0

        # open_set holds: (f_score, g_score, current_node, path)
        open_set = [(heuristic(start, end), 0.0, start, [start])]
        visited = {}

        while open_set:
            f_score, g_score, current, path = heapq.heappop(open_set)

            if current == end:
                return path

            if current in visited and visited[current] <= g_score:
                continue
            visited[current] = g_score

            for neighbor, weight in self.get_online_neighbors(current):
                tentative_g = g_score + weight
                if neighbor in visited and visited[neighbor] <= tentative_g:
                    continue
                
                h_score = heuristic(neighbor, end)
                f_score = tentative_g + h_score
                heapq.heappush(open_set, (f_score, tentative_g, neighbor, path + [neighbor]))

        return []

    def get_serializable_state(self) -> dict:
        """Returns a snapshot of the current graph state for frontend update."""
        return {
            "nodes": [
                {
                    "id": n,
                    "role": self.node_states[n]["role"],
                    "status": self.node_states[n]["status"],
                    "battery": self.node_states[n]["battery"],
                    "lastSeen": self.node_states[n]["last_seen"]
                } for n in self.nodes
            ],
            "rttMatrix": {
                u: {v: (None if val == float('inf') else round(val, 1)) 
                    for v, val in row.items()} 
                for u, row in self.rtt_matrix.items()
            },
            "isMock": self.is_mock,
            "source": self.current_source,
            "destination": self.current_destination,
            "mode": self.current_mode,
            "route": self.active_route,
            "metrics": {
                "pdr": round((self.packet_ack_count / self.packet_sent_count * 100) if self.packet_sent_count > 0 else 100.0, 1),
                "avgRtt": round(self._get_average_rtt(), 1),
                "hops": max(0, len(self.active_route) - 1),
                "recoveryTime": round(self.last_recovery_time, 2),
                "computationTime": round(self.last_computation_time * 1000, 3) # in ms
            }
        }

    def _get_average_rtt(self) -> float:
        """Helper to calculate average RTT across all online bidirectional links."""
        active_rtts = []
        for u in self.nodes:
            if self.node_states[u]['status'] == 'ONLINE':
                for v in self.nodes:
                    if u != v and self.node_states[v]['status'] == 'ONLINE':
                        w = self.rtt_matrix[u][v]
                        if w != float('inf'):
                            active_rtts.append(w)
        return sum(active_rtts) / len(active_rtts) if active_rtts else 0.0
