import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './editor.jsx';
import './editor.css';
import './editor-fixes.css';

createRoot(document.getElementById('root')).render(<App />);
