import React, { useEffect, useRef, useState } from 'react';

export default function PacketMonitor({ packets, isEmergencyMode }) {
  const containerRef = useRef(null);
  const [autoscroll, setAutoscroll] = useState(true);

  useEffect(() => {
    if (autoscroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [packets, autoscroll]);

  // Handle manual scroll to toggle autoscroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user scrolled up by more than 15px, disable autoscroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 15;
    setAutoscroll(isAtBottom);
  };

  // Filter packets based on emergency status
  // "Emergency Banner: Highlight emergency traffic. Hide routine packets."
  const filteredPackets = packets.filter(p => {
    if (isEmergencyMode) {
      // Hide routine packets and heartbeat packets in emergency mode
      return p.type !== 'ROUTINE' && p.type !== 'HEARTBEAT';
    }
    return true; // Show all packets in normal mode
  });

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '350px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)' }}>Packet Monitor</h2>
        <span 
          style={{ 
            fontSize: '0.7rem', 
            fontFamily: 'var(--font-mono)', 
            padding: '0.2rem 0.4rem', 
            borderRadius: '4px',
            backgroundColor: isEmergencyMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.1)',
            color: isEmergencyMode ? 'var(--accent-red)' : 'var(--accent-cyan)'
          }}
        >
          {isEmergencyMode ? 'EMERGENCY FILTER ACTIVE' : 'MONITORING ALL TRAFFIC'}
        </span>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          backgroundColor: '#050508',
          border: '1px solid var(--border-card)',
          borderRadius: '6px',
          padding: '0.75rem',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          color: '#39ff14', // Classic matrix green terminal text
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}
      >
        {filteredPackets.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
            No packets detected. Waiting for stream...
          </div>
        ) : (
          filteredPackets.map((packet, idx) => {
            const isEmType = packet.type === 'EMERGENCY' || packet.priority === 'EMERGENCY';
            const textStyle = isEmType 
              ? { color: '#ff3333', fontWeight: 'bold' } 
              : packet.type === 'HEARTBEAT' 
                ? { color: '#64748b' } // Grey out heartbeats
                : { color: '#39ff14' };

            return (
              <div 
                key={`pkt-${idx}`} 
                style={{ 
                  borderBottom: '1px solid rgba(255, 255, 255, 0.03)', 
                  paddingBottom: '0.4rem',
                  lineHeight: '1.4',
                  ...textStyle 
                }}
              >
                <div>
                  <span style={{ color: '#888', marginRight: '0.4rem' }}>{idx+1}.</span>
                  {JSON.stringify(packet)}
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span>Showing {filteredPackets.length} packets</span>
        <button 
          onClick={() => setAutoscroll(prev => !prev)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: autoscroll ? 'var(--accent-cyan)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontWeight: '500'
          }}
        >
          {autoscroll ? '● Auto-scroll ON' : '○ Auto-scroll OFF'}
        </button>
      </div>
    </div>
  );
}
