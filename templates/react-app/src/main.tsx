/**
 * Vite entry. Registers the NAC manifest before mounting so any
 * component that consults NAC at first paint finds its definitions
 * already registered.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { TODOS_MANIFEST } from './nac/manifest.js';
import './styles.css';

// NAC-3 manifest registration. The reference runtime exports
// `registerManifest` as a side-effect import; we surface the
// registration explicitly so future plugins can chain.
import { registerManifest } from '@yujin/nac';

registerManifest(TODOS_MANIFEST);

const root = document.getElementById('root');
if (!root) throw new Error('root element missing in index.html');
createRoot(root).render(<App />);
