import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registro de Service Worker para habilitar criterios PWA ("Agregar a pantalla de inicio")
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
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
