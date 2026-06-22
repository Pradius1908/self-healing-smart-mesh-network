# Research Notes: Adaptive Disaster Communication Mesh

This document logs architectural and research considerations for the Adaptive Self-Healing Disaster Communication Mesh Network.

## Research Objectives

1. **Path Cost Optimization**: Traditional mesh networks use hop count (minimum hops) to route. Under disaster scenarios, link congestion or path degradation (due to rubble, smoke, interference) makes hop-count routing highly inefficient. We propose using **Round Trip Time (RTT)** as a dynamic link cost metric to optimize data flow.
2. **Self-Healing Topology**: If an intermediate node goes offline (due to battery exhaustion or physical damage), the network should self-detect the link breakage via heartbeat timeout and re-establish routes automatically within a target threshold of seconds.
3. **Traffic Class Differentiation**: Priority queuing must ensure that `EMERGENCY` traffic is dispatched immediately and does not experience queue delays due to high-volume `ROUTINE` telemetry traffic.

## Path Computation Algorithms

### 1. Dijkstra's Algorithm
Dijkstra's algorithm computes the shortest path from a single source node to all other nodes in a weighted graph.
* **Graph Representation**: Vertices \(V = \{A, B, C, D, E\}\). Edges \(E\) have weights derived from RTT:
  \[W(u, v) = \text{RTT}_{u, v}\]
* **Update Frequency**: When RTT changes by more than \(\delta = 20\%\), the backend triggers a Dijkstra execution.

### 2. A* Search Algorithm
For directed, localized routing towards the Hospital Gateway (Node E), A* incorporates a heuristic distance to speed up search.
* **Heuristic Function \(h(n)\)**: Estimating physical or logical distance to Node E. In this topology:
  * For standard client nodes, \(h(n)\) represents historical average latency or hop estimation.
  * Node-to-Gateway mapping score can be used as an inverse weight modifier.
* **Cost Function**:
  \[f(n) = g(n) + h(n)\]
  where \(g(n)\) is the actual accumulated RTT cost from the source node to node \(n\).

## Future Work & Scalability
* **Multi-PHY Interface Adaptation**: Adapting the backend and firmware interfaces to handle LoRa (Long Range) links, satellite modems, and cellular links side-by-side with Wi-Fi painlessMesh.
* **Dynamic Node Registration**: Supporting auto-scaling from 5 to N nodes without needing to hardcode node IDs.
