import React from 'react';
import ReactDOM from 'react-dom/client';

export const App = () => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>OrgSphere</h1>
      <p>Organization Management System — Implementation in Progress</p>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
