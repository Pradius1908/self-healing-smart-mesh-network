import React, { useState, useEffect } from 'react';

export default function NodeTable({ nodes }) {
  const [now, setNow] = useState(Date.now() / 1000);

  // Update timer tick to show real-time relative time ("3s ago")
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now() / 1000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLastSeen = (lastSeenTime, status) => {
    if (status === 'OFFLINE') return <span style={{ color: 'var(--accent-red)' }}>Offline</span>;
    if (!lastSeenTime) return '-';
    
    const diff = Math.max(0, Math.floor(now - lastSeenTime));
    if (diff < 2) return <span style={{ color: 'var(--accent-green)' }}>Just now</span>;
    return `${diff}s ago`;
  };

  return (
    <div className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Node Inventory & Health</h2>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '0.75rem 0.5rem' }}>Node</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Role Descriptor</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Battery</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Last Heard</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const isOnline = node.status === 'ONLINE';
              
              return (
                <tr 
                  key={node.id} 
                  style={{ 
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    backgroundColor: isOnline ? 'transparent' : 'rgba(239, 68, 68, 0.03)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    Node {node.id}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                    {node.role}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span 
                      style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px',
                        backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isOnline ? 'var(--accent-green)' : 'var(--accent-red)',
                        fontWeight: '500'
                      }}
                    >
                      <span 
                        style={{ 
                          width: '6px', 
                          height: '6px', 
                          borderRadius: '50%', 
                          backgroundColor: isOnline ? 'var(--accent-green)' : 'var(--accent-red)'
                        }} 
                      />
                      {node.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)' }}>
                    {isOnline ? (
                      <span style={{ color: node.battery > 30 ? 'var(--text-primary)' : 'var(--accent-orange)' }}>
                        🔋 {node.battery}%
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)' }}>
                    {formatLastSeen(node.lastSeen, node.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
