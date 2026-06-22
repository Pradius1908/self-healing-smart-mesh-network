import React, { useEffect, useRef, useState } from 'react';

export default function SerialConsole({ logs, onClear }) {
  const containerRef = useRef(null);
  const [autoscroll, setAutoscroll] = useState(true);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (autoscroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoscroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 15;
    setAutoscroll(isAtBottom);
  };

  const filteredLogs = logs.filter(log => 
    log.payload?.text?.toLowerCase().includes(filterText.toLowerCase()) ?? true
  );

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '350px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)' }}>ESP32 Serial Console</h2>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Filter logs..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.75rem',
              backgroundColor: '#07070b',
              border: '1px solid var(--border-card)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              maxWidth: '110px'
            }}
          />
          <button 
            onClick={onClear}
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.75rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          backgroundColor: '#030305',
          border: '1px solid var(--border-card)',
          borderRadius: '6px',
          padding: '0.75rem',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          color: '#00ff66', // Clean matrix green/cyberpunk green terminal
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
            No serial output. Keep Arduino Serial Monitor closed to release port.
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            const text = log.payload?.text || '';
            let lineStyle = { whiteSpace: 'pre-wrap', wordBreak: 'break-all' };
            
            // Highlight warnings, system notices, and config prints
            if (text.includes('[CONFIG]') || text.includes('[SYSTEM]')) {
              lineStyle.color = 'var(--accent-orange)';
            } else if (text.includes('[METRICS]')) {
              lineStyle.color = 'var(--accent-cyan)';
            } else if (text.includes('[MESH]')) {
              lineStyle.color = 'var(--accent-blue)';
              lineStyle.fontWeight = 'bold';
            } else if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
              lineStyle.color = 'var(--accent-red)';
            }

            return (
              <div 
                key={`log-${idx}`} 
                style={{ 
                  borderBottom: '1px solid rgba(255, 255, 255, 0.02)', 
                  paddingBottom: '0.2rem',
                  lineHeight: '1.3',
                  ...lineStyle 
                }}
              >
                {text}
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span>Showing {filteredLogs.length} lines</span>
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
