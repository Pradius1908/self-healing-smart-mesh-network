import React from 'react';

export default function MetricsChart({ history }) {
  // Helper to draw a single SVG sparkline path
  const renderSparkline = (dataList, minVal, maxVal, width, height, strokeColor, gradientId) => {
    if (dataList.length < 2) {
      return (
        <svg width="100%" height={height}>
          <text x={width/2} y={height/2} textAnchor="middle" fill="var(--text-muted)" fontSize="12">
            Awaiting telemetry data...
          </text>
        </svg>
      );
    }

    const padding = 15;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = dataList.map((val, idx) => {
      const x = padding + (idx / (dataList.length - 1)) * chartWidth;
      
      // Calculate normalized y-coordinate (inverted for SVG coords)
      let normY = 0.5; // fallback
      if (maxVal !== minVal) {
        normY = (val - minVal) / (maxVal - minVal);
      }
      const y = padding + chartHeight - normY * chartHeight;
      return { x, y };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    // Area path for gradient fill under the line
    const areaPathData = `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <svg width="100%" height={height} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />

        {/* Area fill */}
        <path d={areaPathData} fill={`url(#${gradientId})`} />

        {/* Sparkline Line */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))' }}
        />

        {/* Data points */}
        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={idx === points.length - 1 ? "4" : "1.5"}
            fill={strokeColor}
            stroke="#0a0a0e"
            strokeWidth={idx === points.length - 1 ? "1.5" : "0.5"}
          />
        ))}

        {/* Min/Max value overlays */}
        <text x={padding} y={padding - 4} fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">
          {Math.round(maxVal)}
        </text>
        <text x={padding} y={padding + chartHeight + 11} fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">
          {Math.round(minVal)}
        </text>
      </svg>
    );
  };

  const pdrData = history.map(h => h.pdr);
  const rttData = history.map(h => h.rtt);

  // Bounds math
  const maxPdr = Math.max(100, ...pdrData);
  const minPdr = Math.max(0, Math.min(...pdrData) - 5);
  
  const maxRtt = Math.max(100, ...rttData) + 10;
  const minRtt = Math.max(0, Math.min(...rttData) - 10);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>Real-Time Performance Indicators</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* PDR Chart */}
        <div style={{ background: '#07070b', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Packet Delivery Ratio (PDR)</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              {pdrData.length > 0 ? `${pdrData[pdrData.length - 1]}%` : '-'}
            </span>
          </div>
          {renderSparkline(pdrData, minPdr, maxPdr, 220, 100, 'var(--accent-green)', 'pdr-grad')}
        </div>

        {/* RTT Latency Chart */}
        <div style={{ background: '#07070b', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Average RTT Latency</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              {rttData.length > 0 ? `${rttData[rttData.length - 1]} ms` : '-'}
            </span>
          </div>
          {renderSparkline(rttData, minRtt, maxRtt, 220, 100, 'var(--accent-cyan)', 'rtt-grad')}
        </div>
      </div>
    </div>
  );
}
