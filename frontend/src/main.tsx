import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', event => event.preventDefault(), { capture: true });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
