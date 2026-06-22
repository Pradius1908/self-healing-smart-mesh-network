import React, { useState, useEffect, useRef } from 'react';
import NetworkGraph from './components/NetworkGraph';
import ControlPanel from './components/ControlPanel';
import NodeTable from './components/NodeTable';
import EventLog from './components/EventLog';
import PacketMonitor from './components/PacketMonitor';
import MetricsChart from './components/MetricsChart';
import SerialConsole from './components/SerialConsole';

export default function App() {
  const [nodes, setNodes] = useState([
    { id: 'A', role: 'Local Clinic A', status: 'OFFLINE', battery: 0, lastSeen: null },
    { id: 'B', role: 'Local Clinic B', status: 'OFFLINE', battery: 0, lastSeen: null },
    { id: 'C', role: 'Civilian Shelter C', status: 'OFFLINE', battery: 0, lastSeen: null },
    { id: 'D', role: 'Civilian Shelter D', status: 'OFFLINE', battery: 0, lastSeen: null },
    { id: 'E', role: 'Central Hospital E', status: 'OFFLINE', battery: 0, lastSeen: null }
  ]);
  
  const [rttMatrix, setRttMatrix] = useState({});
  const [activeRoute, setActiveRoute] = useState([]);
  const [source, setSource] = useState('A');
  const [destination, setDestination] = useState('E');
  const [mode, setMode] = useState('NORMAL');
  const [algorithm, setAlgorithm] = useState('dijkstra');
  
  const [logs, setLogs] = useState([]);
  const [packets, setPackets] = useState([]);
  const [serialLogs, setSerialLogs] = useState([]);
  const [lastPacket, setLastPacket] = useState(null);
  const [isMock, setIsMock] = useState(false);
  
  // Research Features: Metrics tracking states
  const [metricsSummary, setMetricsSummary] = useState({
    pdr: 100.0,
    avgRtt: 0.0,
    hops: 0,
    recoveryTime: 0.0,
    computationTime: 0.0
  });
  const [metricsHistory, setMetricsHistory] = useState([]);
  
  const [socketStatus, setSocketStatus] = useState('DISCONNECTED'); // CONNECTING, CONNECTED, DISCONNECTED
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Connect to backend WebSocket API
  const connectWebSocket = () => {
    setSocketStatus('CONNECTING');
    console.log("[WS] Connecting to backend...");
    
    // Connect to port 8001 using 127.0.0.1 on localhost to avoid IPv6 resolution issues on Windows
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `ws://${host}:8001/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setSocketStatus('CONNECTED');
      console.log("[WS] Connection established.");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'INIT_STATE':
            const init = msg.state;
            setNodes(init.nodes);
            setRttMatrix(init.rttMatrix);
            setSource(init.source);
            setDestination(init.destination);
            setMode(init.mode);
            setAlgorithm(init.activeAlgorithm);
            setActiveRoute(init.route);
            setLogs(init.eventLogs || []);
            setIsMock(init.isMock || false);
            
            if (init.metrics) {
              setMetricsSummary(init.metrics);
              setMetricsHistory([{
                pdr: init.metrics.pdr,
                rtt: init.metrics.avgRtt,
                timestamp: Date.now()
              }]);
            }
            break;
            
          case 'STATE_UPDATE':
            const update = msg.state;
            setNodes(update.nodes);
            setRttMatrix(update.rttMatrix);
            setSource(update.source);
            setDestination(update.destination);
            setMode(update.mode);
            setAlgorithm(update.activeAlgorithm || algorithm);
            setActiveRoute(update.route);
            setIsMock(update.isMock || false);
            
            if (update.metrics) {
              setMetricsSummary(update.metrics);
              setMetricsHistory(prev => {
                const newEntry = {
                  pdr: update.metrics.pdr,
                  rtt: update.metrics.avgRtt,
                  timestamp: Date.now()
                };
                return [...prev, newEntry].slice(-30); // Keep last 30
              });
            }
            break;
            
          case 'EVENT_LOG':
            setLogs(prev => [...prev, msg.log].slice(-100)); // Keep last 100
            break;
            
          case 'PACKET':
            if (msg.packet.type === 'DEBUG_LOG') {
              setSerialLogs(prev => [...prev, msg.packet].slice(-200)); // Keep last 200 lines
            } else {
              setPackets(prev => [...prev, msg.packet].slice(-100)); // Keep last 100
              setLastPacket(msg.packet);
            }
            break;
            
          default:
            console.log("[WS WARNING] Unknown message type:", msg.type);
        }
      } catch (err) {
        console.error("[WS ERROR] Error parsing websocket message:", err);
      }
    };

    socket.onclose = () => {
      setSocketStatus('DISCONNECTED');
      console.log("[WS] Connection closed. Attempting reconnect in 3s...");
      
      // Prevent spawning multiple loops
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWebSocket();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error("[WS ERROR] Socket encountered error:", err);
      socket.close();
    };
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Send action to backend via websocket
  const handleSendAction = (actionObj) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(actionObj));
      console.log("[WS TX] Sent action:", actionObj);
    } else {
      console.warn("[WS WARNING] Cannot send action. Socket is not connected.");
    }
  };

  const isEmergency = mode === 'EMERGENCY';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Flashing Red Emergency Banner */}
      {isEmergency && (
        <div 
          className="flash-red-alert"
          style={{
            padding: '0.65rem',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '0.95rem',
            letterSpacing: '1px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '2px solid var(--accent-red)'
          }}
        >
          <span>🚨</span> CRITICAL SOS SYSTEM ACTIVE — EMERGENCY DATA TRIAgE ROUTING PROTOCOL ENABLED <span>🚨</span>
        </div>
      )}

      {/* 1.5. Simulation Mode Warnings Banner */}
      {isMock && (
        <div 
          style={{
            padding: '0.6rem 1rem',
            textAlign: 'center',
            backgroundColor: 'rgba(249, 115, 22, 0.12)',
            borderBottom: '1px solid var(--accent-orange)',
            color: 'var(--accent-orange)',
            fontSize: '0.85rem',
            fontWeight: '600',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          ⚠️ DEMO SIMULATION ACTIVE — No physical Gateway detected on USB Serial. Close other Serial Monitors and reconnect Node E to run physical hardware.
        </div>
      )}

      {/* 2. Header Bar */}
      <header 
        style={{
          padding: '1.25rem 2rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          backgroundColor: 'rgba(10, 10, 14, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
            Adaptive Self-Healing Disaster Mesh
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            IEEE Research Demo • Operational Dashboard Console
          </p>
        </div>

        {/* Action Controls & WebSockets Connection Beacon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          
          {/* CSV Export Link styled as premium button */}
          <a
            href={`http://${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '127.0.0.1' : window.location.hostname}:8001/api/metrics/export`}
            download
            style={{
              padding: '0.5rem 0.85rem',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid var(--accent-blue)',
              color: 'var(--accent-blue)',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: '600',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
            }}
          >
            📥 Export Metrics CSV
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span 
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: socketStatus === 'CONNECTED' ? 'var(--accent-green)' : 'var(--accent-orange)',
                boxShadow: socketStatus === 'CONNECTED' ? '0 0 8px var(--accent-green)' : '0 0 8px var(--accent-orange)'
              }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              CONTROLLER: {socketStatus}
            </span>
          </div>
        </div>
      </header>

      {/* 3. Core NOC Grid Dashboard Layout */}
      <main 
        style={{
          flex: 1,
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(400px, 2.25fr) minmax(320px, 1.25fr)',
          gap: '1.25rem',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto'
        }}
      >
        {/* Left Column: Controls and Routing Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <ControlPanel 
            source={source}
            destination={destination}
            algorithm={algorithm}
            mode={mode}
            onSendAction={handleSendAction}
          />
          
          {/* Path display panel */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>Current Routing Path</h3>
            {activeRoute && activeRoute.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {activeRoute.map((node, i) => (
                  <React.Fragment key={`path-node-${i}`}>
                    <span 
                      style={{
                        padding: '0.35rem 0.6rem',
                        backgroundColor: i === 0 ? 'rgba(6, 182, 212, 0.15)' : i === activeRoute.length - 1 ? 'rgba(249, 115, 22, 0.15)' : 'var(--bg-secondary)',
                        border: `1px solid ${i === 0 ? 'var(--accent-cyan)' : i === activeRoute.length - 1 ? 'var(--accent-orange)' : 'var(--border-card)'}`,
                        color: i === 0 ? 'var(--accent-cyan)' : i === activeRoute.length - 1 ? 'var(--accent-orange)' : 'var(--text-primary)',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {node}
                    </span>
                    {i < activeRoute.length - 1 && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
                No active route paths established.
              </span>
            )}
          </div>
        </div>

        {/* Middle Column: Metrics Counters + Topology Visualizer + Metrics Graphs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Real-time metrics counters grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {[
              { label: 'Packet Delivery (PDR)', val: `${metricsSummary.pdr}%`, color: 'var(--accent-green)' },
              { label: 'Avg Link Latency', val: `${metricsSummary.avgRtt} ms`, color: 'var(--accent-cyan)' },
              { label: 'Active Path Hops', val: `${metricsSummary.hops} hops`, color: 'var(--text-primary)' },
              { label: 'Timeout Healing', val: `${metricsSummary.recoveryTime} s`, color: 'var(--accent-orange)' },
              { label: 'Route Calc Time', val: `${metricsSummary.computationTime} ms`, color: 'var(--accent-blue)' }
            ].map((m, i) => (
              <div key={i} className="glass-panel" style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center', textAlign: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{m.label}</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: m.color, fontFamily: 'var(--font-mono)' }}>{m.val}</span>
              </div>
            ))}
          </div>

          {/* Topology Panel */}
          <div style={{ flex: 1 }}>
            <NetworkGraph 
              nodes={nodes}
              rttMatrix={rttMatrix}
              activeRoute={activeRoute}
              lastPacket={lastPacket}
            />
          </div>

          {/* Performance line charts */}
          <MetricsChart history={metricsHistory} />
        </div>

        {/* Right Column: Node Table */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <NodeTable nodes={nodes} />
        </div>
      </main>

      {/* 4. Bottom Row: Event Logger, Packet Monitor & Serial Debug Console */}
      <footer 
        style={{
          padding: '0 1.5rem 1.5rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.25rem',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto'
        }}
      >
        <EventLog logs={logs} />
        <PacketMonitor packets={packets} isEmergencyMode={isEmergency} />
        <SerialConsole logs={serialLogs} onClear={() => setSerialLogs([])} />
      </footer>
    </div>
  );
}
