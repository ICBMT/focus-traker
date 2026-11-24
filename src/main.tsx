import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import App from './App';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import CompanionWindow from './components/CompanionPanel';
const compact = isTauri() && getCurrentWindow().label === 'companion';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{compact ? <CompanionWindow /> : <App />}</React.StrictMode>,
);
