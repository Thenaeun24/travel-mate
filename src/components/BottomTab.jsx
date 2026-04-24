import React from 'react';
import { NavLink } from 'react-router-dom';

const BottomTab = () => {
  return (
    <nav className="bottom-nav">
      <NavLink 
        to="/schedule" 
        className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}
      >
        <div className="nav-icon">🗺️</div>
        <span>일정</span>
      </NavLink>
      
      <NavLink 
        to="/ledger" 
        className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}
      >
        <div className="nav-icon">💰</div>
        <span>가계부</span>
      </NavLink>
    </nav>
  );
};

export default BottomTab;
