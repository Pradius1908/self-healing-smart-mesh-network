import React, { useState } from 'react';

export default function ControlPanel({ source, destination, algorithm, mode, onSendAction }) {
  const [selectedSource, setSelectedSource] = useState(source || 'A');
  const [selectedDest, setSelectedDest] = useState(destination || 'E');
  const [selectedAlgo, setSelectedAlgo] = useState(algorithm || 'dijkstra');

  const handleApplyRoute = () => {
    onSendAction({
      action: 'APPLY_ROUTE',
      payload: {
        source: selectedSource,
        destination: selectedDest,
        algorithm: selectedAlgo
      }
    });
  };

  const handleToggleMode = (newMode) => {
    onSendAction({
      action: 'SET_MODE',
      payload: {
        mode: newMode
      }
    });
  };

  const handleReset = () => {
    setSelectedSource('A');
    setSelectedDest('E');
    setSelectedAlgo('dijkstra');
    onSendAction({ action: 'RESET' });
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <h2 style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)' }}>Controller Console</h2>
      
      {/* 1. Path Source and Destination Selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Source Node</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer'
            }}
          >
            {['A', 'B', 'C', 'D'].map(node => (
              <option key={node} value={node}>Node {node}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Destination</label>
          <select
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer'
            }}
          >
            {['A', 'B', 'C', 'D', 'E'].map(node => (
              <option key={node} value={node} disabled={node === selectedSource}>Node {node} {node === 'E' ? '(Gateway)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Algorithm Selectors */}
      <div>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Pathfinding Algorithm</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={() => setSelectedAlgo('dijkstra')}
            style={{
              padding: '0.5rem',
              backgroundColor: selectedAlgo === 'dijkstra' ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${selectedAlgo === 'dijkstra' ? 'var(--accent-cyan)' : 'var(--border-card)'}`,
              color: selectedAlgo === 'dijkstra' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.85rem',
              transition: 'all 0.3s ease'
            }}
          >
            Dijkstra (RTT)
          </button>
          <button
            onClick={() => setSelectedAlgo('astar')}
            style={{
              padding: '0.5rem',
              backgroundColor: selectedAlgo === 'astar' ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${selectedAlgo === 'astar' ? 'var(--accent-cyan)' : 'var(--border-card)'}`,
              color: selectedAlgo === 'astar' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.85rem',
              transition: 'all 0.3s ease'
            }}
          >
            A* Heuristic
          </button>
        </div>
      </div>

      {/* 3. Apply Action */}
      <button
        onClick={handleApplyRoute}
        style={{
          width: '100%',
          padding: '0.65rem',
          backgroundColor: 'var(--accent-cyan)',
          border: 'none',
          color: '#000000',
          fontWeight: 'bold',
          borderRadius: '6px',
          cursor: 'pointer',
          marginTop: '0.25rem',
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 12px rgba(6, 182, 212, 0.25)'
        }}
        onMouseEnter={(e) => e.target.style.filter = 'brightness(1.15)'}
        onMouseLeave={(e) => e.target.style.filter = 'none'}
      >
        APPLY ROUTE PATH
      </button>

      <div style={{ height: '1px', backgroundColor: 'var(--border-card)', margin: '0.5rem 0' }}></div>

      {/* 4. Network Mode Toggle */}
      <div>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Network Mode</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={() => handleToggleMode('NORMAL')}
            style={{
              padding: '0.5rem',
              backgroundColor: mode === 'NORMAL' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
              border: `1px solid ${mode === 'NORMAL' ? 'var(--accent-green)' : 'var(--border-card)'}`,
              color: mode === 'NORMAL' ? 'var(--accent-green)' : 'var(--text-secondary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
          >
            Normal Mode
          </button>
          <button
            onClick={() => handleToggleMode('EMERGENCY')}
            style={{
              padding: '0.5rem',
              backgroundColor: mode === 'EMERGENCY' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${mode === 'EMERGENCY' ? 'var(--accent-red)' : 'var(--border-card)'}`,
              color: mode === 'EMERGENCY' ? 'var(--accent-red)' : 'var(--text-secondary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}
          >
            Emergency Mode
          </button>
        </div>
      </div>

      {/* 5. System Reset */}
      <button
        onClick={handleReset}
        style={{
          width: '100%',
          padding: '0.5rem',
          backgroundColor: 'transparent',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: 'var(--accent-red)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: '500',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
        }}
      >
        RESET ALL METRICS
      </button>
    </div>
  );
}
