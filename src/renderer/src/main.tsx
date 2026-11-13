import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './components/Widget';
import { Dashboard } from './components/Dashboard';
import './styles/global.css';

document.documentElement.classList.toggle('widget-window', location.hash === '#widget');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{location.hash === '#widget' ? <Widget /> : <Dashboard />}</React.StrictMode>
);
