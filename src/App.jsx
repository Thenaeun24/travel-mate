import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BottomTab from './components/BottomTab';
import Schedule from './pages/Schedule';
import Ledger from './pages/Ledger';

function App() {
  return (
    <Router>
      <div className="app-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <header style={{ 
          padding: '16px', 
          background: 'white', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--color-text)', margin: 0, letterSpacing: '-0.5px' }}>
            나만의 해외여행 메이트
          </h1>
        </header>
        <div className="page-container" style={{ flex: 1, overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/schedule" replace />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/ledger" element={<Ledger />} />
          </Routes>
        </div>
        <BottomTab />
      </div>
    </Router>
  );
}

export default App;
