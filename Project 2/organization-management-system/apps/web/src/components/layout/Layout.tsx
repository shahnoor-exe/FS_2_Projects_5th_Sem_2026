import React from 'react';
import { Sidebar, NavigationTab } from './Sidebar.js';
import { Navbar } from './Navbar.js';

interface LayoutProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentTab, onTabChange, children }) => {
  return (
    <div className="app-container">
      <Sidebar currentTab={currentTab} onTabChange={onTabChange} />
      <div className="main-wrapper">
        <Navbar />
        <main className="content-area" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};
