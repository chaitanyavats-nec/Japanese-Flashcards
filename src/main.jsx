import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerServiceWorker } from './lib/reminders';
import '../style.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline caching and reminders. Production only: in dev, Vite serves
// modules that change on every edit and a cache would only get in the way.
if (import.meta.env.PROD) window.addEventListener('load', registerServiceWorker);
