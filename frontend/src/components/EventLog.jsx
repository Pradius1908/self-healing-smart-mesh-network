import React, { useEffect, useRef } from 'react';

export default function EventLog({ logs }) {
  const containerRef = useRef(null);

  // Auto-scroll to bottom on new event logs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getEventBadgeStyle = (type) => {
    switch (type) {
      case 'EMERGENCY':
        return { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)' };
      case 'NODE_DOWN':
        return { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.2)' };
      case 'NODE_UP':
        return { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)', border: '1px solid rgba(16, 185, 129, 0.2)' };
      case 'ROUTE_UPDATED':
        return { backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.2)' };
      case 'RTT_UPDATED':
        return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.2)' };
      case 'RESET':
        return { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--accent-orange)', border: '1px solid rgba(249, 115, 22, 0.2)' };
      default:
        return { backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255, 255, 255, 0.1)' };
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '350px' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Event Logger</h2>
      
      <div 
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          paddingRight: '0.25rem'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem 0' }}>
            No network events logged yet.
          </div>
        ) : (
          logs.map((log, idx) => (
            <div 
              key={`log-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.85rem',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.015)',
                borderLeft: `2px solid ${getEventBadgeStyle(log.type).color}`
              }}
            >
              {/* Timestamp */}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.8rem', minWidth: '70px', marginTop: '1px' }}>
                [{formatTime(log.timestamp)}]
              </span>
              
              {/* Badge type label */}
              <span 
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  ...getEventBadgeStyle(log.type)
                }}
              >
                {log.type}
              </span>

              {/* Log Message */}
              <span style={{ color: 'var(--text-primary)', flex: 1, wordBreak: 'break-word' }}>
                {log.details}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
