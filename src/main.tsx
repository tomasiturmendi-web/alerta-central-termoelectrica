import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registro de Service Worker para habilitar criterios PWA ("Agregar a pantalla de inicio")
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = (import.meta as any).env?.BASE_URL;
    const swPath = baseUrl && baseUrl !== '/' 
      ? (baseUrl.endsWith('/') ? `${baseUrl}firebase-messaging-sw.js` : `${baseUrl}/firebase-messaging-sw.js`)
      : '/firebase-messaging-sw.js';

    navigator.serviceWorker.register(swPath)
      .then((registration) => {
        console.log('PWA ServiceWorker registrado con éxito en ámbito:', registration.scope);
      })
      .catch((error) => {
        console.error('Error al registrar PWA ServiceWorker:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
