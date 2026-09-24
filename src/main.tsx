import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { seedIfEmpty } from './lib/seed';
import { initSync } from './lib/sync';

async function start() {
  await seedIfEmpty();
  void initSync();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
