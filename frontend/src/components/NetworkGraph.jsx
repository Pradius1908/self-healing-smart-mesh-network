import React, { useState, useEffect, useRef } from 'react';

const DEFAULT_ANCHORS = {
  'E': { x: 250, y: 250 },
  'A': { x: 130, y: 130 },
  'B': { x: 130, y: 370 },
  'C': { x: 370, y: 370 },
  'D': { x: 370, y: 130 }
};

const DEFAULT_RTTS = {
  'A-B': 45, 'B-A': 45,
  'A-C': 60, 'C-A': 60,
  'A-D': 55, 'D-A': 55,
  'A-E': 80, 'E-A': 80,
  'B-C': 50, 'C-B': 50,
  'B-D': 40, 'D-B': 40,
  'B-E': 65, 'E-B': 65,
  'C-D': 70, 'D-C': 70,
  'C-E': 75, 'E-C': 75,
  'D-E': 30, 'E-D': 30
};

const LINKS = [
  { u: 'A', v: 'B' },
  { u: 'A', v: 'C' },
  { u: 'A', v: 'D' },
  { u: 'A', v: 'E' },
  { u: 'B', v: 'C' },
  { u: 'B', v: 'D' },
  { u: 'B', v: 'E' },
  { u: 'C', v: 'D' },
  { u: 'C', v: 'E' },
  { u: 'D', v: 'E' }
];

export default function NetworkGraph({ nodes, rttMatrix, activeRoute, lastPacket }) {
  const [animatedPackets, setAnimatedPackets] = useState([]);
  
  const [positions, setPositions] = useState({
    'E': { x: 250, y: 250 },
    'A': { x: 130, y: 130 },
    'B': { x: 130, y: 370 },
    'C': { x: 370, y: 370 },
    'D': { x: 370, y: 130 }
  });

  const rttMatrixRef = useRef(rttMatrix);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    rttMatrixRef.current = rttMatrix;
    nodesRef.current = nodes;
  }, [rttMatrix, nodes]);

  // Physics animation loop to scale distances based on measured RTT
  useEffect(() => {
    let animId;
    
    const tick = () => {
      setPositions(prev => {
        const next = { ...prev };
        const fx = { 'E': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0 };
        const fy = { 'E': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0 };
        
        const getLocalNodeState = (nodeId) => {
          const node = nodesRef.current.find(n => n.id === nodeId);
          return node ? node.status : 'OFFLINE';
        };
        
        // 1. Very weak centering gravity to prevent float nodes from drifting off-screen,
        // without forcing them back to specific static anchor coords.
        const kCenterGravity = 0.005;
        const floatNodes = ['A', 'B', 'C', 'D'];
        
        floatNodes.forEach(nodeId => {
          if (getLocalNodeState(nodeId) === 'ONLINE') {
            const pos = prev[nodeId] || DEFAULT_ANCHORS[nodeId];
            fx[nodeId] += kCenterGravity * (250 - pos.x);
            fy[nodeId] += kCenterGravity * (250 - pos.y);
          }
        });
        
        // 2. Link Spring forces
        const kSpring = 0.05;
        const getLinkWeightLocal = (u, v) => {
          const matrix = rttMatrixRef.current;
          if (matrix && matrix[u] && matrix[u][v] !== null && matrix[u][v] !== undefined) {
            return matrix[u][v];
          }
          return DEFAULT_RTTS[`${u}-${v}`] || 50;
        };
        
        LINKS.forEach(link => {
          const u = link.u;
          const v = link.v;
          
          if (getLocalNodeState(u) === 'ONLINE' && getLocalNodeState(v) === 'ONLINE') {
            const posU = prev[u] || DEFAULT_ANCHORS[u];
            const posV = prev[v] || DEFAULT_ANCHORS[v];
            
            const dx = posV.x - posU.x;
            const dy = posV.y - posU.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            const rtt = getLinkWeightLocal(u, v);
            const targetDist = 60 + Math.min(rtt, 150) * 2.2;
            
            const force = kSpring * (dist - targetDist);
            const forceX = force * (dx / dist);
            const forceY = force * (dy / dist);
            
            if (u !== 'E') {
              fx[u] += forceX;
              fy[u] += forceY;
            }
            if (v !== 'E') {
              fx[v] -= forceX;
              fy[v] -= forceY;
            }
          }
        });
        
        // 3. Node repulsion forces to prevent overlaps
        const kRepel = 700;
        const allNodes = ['E', 'A', 'B', 'C', 'D'];
        for (let i = 0; i < allNodes.length; i++) {
          for (let j = i + 1; j < allNodes.length; j++) {
            const u = allNodes[i];
            const v = allNodes[j];
            if (getLocalNodeState(u) === 'ONLINE' && getLocalNodeState(v) === 'ONLINE') {
              const posU = prev[u] || DEFAULT_ANCHORS[u];
              const posV = prev[v] || DEFAULT_ANCHORS[v];
              
              const dx = posV.x - posU.x;
              const dy = posV.y - posU.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              
              if (dist < 80) {
                const force = -kRepel / (dist * dist || 1);
                const forceX = force * (dx / dist);
                const forceY = force * (dy / dist);
                
                if (u !== 'E') {
                  fx[u] += forceX;
                  fy[u] += forceY;
                }
                if (v !== 'E') {
                  fx[v] -= forceX;
                  fy[v] -= forceY;
                }
              }
            }
          }
        }
        
        // 4. Update coordinates with boundary limits
        floatNodes.forEach(nodeId => {
          if (getLocalNodeState(nodeId) === 'ONLINE') {
            const currentPos = prev[nodeId] || DEFAULT_ANCHORS[nodeId];
            const maxForce = 15;
            const forceX = Math.max(-maxForce, Math.min(maxForce, fx[nodeId]));
            const forceY = Math.max(-maxForce, Math.min(maxForce, fy[nodeId]));
            
            let nx = currentPos.x + forceX;
            let ny = currentPos.y + forceY;
            
            nx = Math.max(30, Math.min(470, nx));
            ny = Math.max(30, Math.min(470, ny));
            
            next[nodeId] = { x: nx, y: ny };
          }
        });
        
        return next;
      });
      
      animId = requestAnimationFrame(tick);
    };
    
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Trigger packet animation when a new packet is observed
  useEffect(() => {
    if (!lastPacket) return;
    
    const src = lastPacket.source;
    let dst = lastPacket.nextHop;
    
    if (dst === 'ALL' || dst === '?') {
      dst = lastPacket.destination;
    }
    
    // Animate only if both source and destination are online/visible
    if (positions[src] && positions[dst] && src !== dst) {
      if (getNodeState(src) === 'ONLINE' && getNodeState(dst) === 'ONLINE') {
        const packetId = Math.random().toString(36).substr(2, 9);
        const isEmergency = lastPacket.priority === 'EMERGENCY' || lastPacket.type === 'EMERGENCY';
        
        const newAnimPacket = {
          id: packetId,
          x1: positions[src].x,
          y1: positions[src].y,
          x2: positions[dst].x,
          y2: positions[dst].y,
          color: isEmergency ? 'var(--accent-red)' : 'var(--accent-cyan)'
        };
        
        setAnimatedPackets(prev => [...prev, newAnimPacket]);
        
        setTimeout(() => {
          setAnimatedPackets(prev => prev.filter(p => p.id !== packetId));
        }, 800);
      }
    }
  }, [lastPacket, positions]);

  const getNodeState = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    return node ? node.status : 'OFFLINE';
  };

  const getLinkWeight = (u, v) => {
    if (rttMatrix && rttMatrix[u]) {
      return rttMatrix[u][v];
    }
    return null;
  };

  const isLinkActiveRoute = (u, v) => {
    if (!activeRoute || activeRoute.length < 2) return false;
    for (let i = 0; i < activeRoute.length - 1; i++) {
      const p1 = activeRoute[i];
      const p2 = activeRoute[i+1];
      if ((p1 === u && p2 === v) || (p1 === v && p2 === u)) {
        return true;
      }
    }
    return false;
  };

  // Filter links: only draw links where BOTH endpoints are ONLINE
  const visibleLinks = LINKS.filter(link => 
    getNodeState(link.u) === 'ONLINE' && getNodeState(link.v) === 'ONLINE'
  );

  // Filter nodes: only render nodes that are ONLINE
  const visibleNodes = Object.entries(positions).filter(([nodeId]) => 
    getNodeState(nodeId) === 'ONLINE'
  );

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-cyan)' }}>Topology Visualizer</h2>
      <div style={{ position: 'relative', width: '100%', flex: 1, background: '#07070b', borderRadius: '8px', overflow: 'hidden', minHeight: '380px' }}>
        <svg viewBox="0 0 500 500" style={{ width: '100%', height: '100%' }}>
          <defs>
            <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. Draw all visible topology edges */}
          {visibleLinks.map((link, idx) => {
            const posU = positions[link.u];
            const posV = positions[link.v];
            const rtt = getLinkWeight(link.u, link.v);
            const isActive = isLinkActiveRoute(link.u, link.v);
            
            let strokeColor = 'rgba(59, 130, 246, 0.4)'; // Subtle blue for idle link
            let strokeWidth = 2.5;
            let isDashed = rtt === null;
            
            if (isActive) {
              strokeColor = 'var(--accent-cyan)';
              strokeWidth = 4;
              isDashed = false;
            }

            return (
              <g key={`link-${idx}`}>
                <line
                  x1={posU.x}
                  y1={posU.y}
                  x2={posV.x}
                  y2={posV.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isDashed ? "4,4" : "none"}
                  className={isActive ? "glow-active-link" : ""}
                  style={{
                    filter: isActive ? 'url(#glow-cyan)' : 'none',
                    transition: 'stroke 0.5s ease, stroke-width 0.5s ease'
                  }}
                />
                
                {/* RTT Text overlay on link center */}
                {rtt !== null && (
                  <g transform={`translate(${(posU.x + posV.x) / 2}, ${(posU.y + posV.y) / 2 - 8})`}>
                    <rect
                      x="-22"
                      y="-8"
                      width="44"
                      height="15"
                      rx="3"
                      fill="#0a0a0e"
                      stroke="rgba(255, 255, 255, 0.15)"
                      strokeWidth="0.5"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--text-secondary)"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                    >
                      {rtt}ms
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. Draw flying animated packets */}
          {animatedPackets.map(packet => (
            <circle key={packet.id} r="7" fill={packet.color}>
              <animateMotion
                dur="0.8s"
                repeatCount="1"
                fill="freeze"
                path={`M ${packet.x1} ${packet.y1} L ${packet.x2} ${packet.y2}`}
              />
              <animate
                attributeName="opacity"
                values="1;0.8;0"
                keyTimes="0;0.7;1"
                dur="0.8s"
                repeatCount="1"
                fill="freeze"
              />
            </circle>
          ))}

          {/* 3. Draw all visible nodes */}
          {visibleNodes.map(([nodeId, pos]) => {
            const isGateway = nodeId === 'E';
            const nodeInfo = nodes.find(n => n.id === nodeId) || {};
            const battery = nodeInfo.battery ?? 0;
            
            let fill = '#0e1814';
            let stroke = 'var(--accent-green)';
            let glowFilter = 'url(#glow-green)';

            if (isGateway) {
              stroke = 'var(--accent-orange)';
              fill = '#1d1916';
              glowFilter = 'url(#glow-green)';
            }

            const isSelectedSource = activeRoute && activeRoute[0] === nodeId;
            const isSelectedDest = activeRoute && activeRoute[activeRoute.length - 1] === nodeId;
            const isPathNode = activeRoute && activeRoute.includes(nodeId);

            return (
              <g key={`node-${nodeId}`} style={{ cursor: 'pointer' }}>
                {/* Highlight ring for active selection */}
                {(isSelectedSource || isSelectedDest) && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="28"
                    fill="none"
                    stroke={isSelectedSource ? 'var(--accent-cyan)' : 'var(--accent-blue)'}
                    strokeWidth="1.5"
                    strokeDasharray="4,2"
                    style={{
                      animation: 'flow-dash 8s linear infinite'
                    }}
                  />
                )}

                {/* Main Node Circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isGateway ? "22" : "19"}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isPathNode ? "3" : "2"}
                  style={{
                    filter: glowFilter,
                    transition: 'all 0.5s ease'
                  }}
                />

                {/* Inner status marker */}
                <circle
                  cx={pos.x + (isGateway ? 13 : 11)}
                  cy={pos.y - (isGateway ? 13 : 11)}
                  r="4.5"
                  fill="var(--accent-green)"
                  stroke="#0a0a0e"
                  strokeWidth="1"
                />

                {/* Node Label Text */}
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="var(--text-primary)"
                  fontWeight="bold"
                  fontSize={isGateway ? "13" : "11"}
                >
                  {nodeId}
                </text>

                {/* Role/Descriptor Text placed below node */}
                <text
                  x={pos.x}
                  y={pos.y + (isGateway ? 38 : 34)}
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize="9.5"
                  fontWeight="500"
                >
                  {isGateway ? 'Hospital (Gateway)' : (nodeId === 'A' || nodeId === 'B' ? 'Clinic' : 'Shelter')}
                </text>

                {/* Battery percentage overlay */}
                <text
                  x={pos.x}
                  y={pos.y - (isGateway ? 34 : 30)}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="9.5"
                  fontFamily="var(--font-mono)"
                >
                  🔋{battery}%
                </text>
              </g>
            );
          })}
        </svg>
        
        {visibleNodes.length === 0 && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '0.5rem',
            color: 'var(--text-muted)',
            fontSize: '0.9rem'
          }}>
            <span>📡 Awaiting ESP32 Gateway Node E Connection...</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Plug Gateway ESP32 into Laptop to bootstrap network.</span>
          </div>
        )}
      </div>
    </div>
  );
}
