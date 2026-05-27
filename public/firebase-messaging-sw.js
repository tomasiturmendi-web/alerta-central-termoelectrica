// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
  apiKey: "AIzaSyB7z5w4fgNw1QTV-Cx37j-m8r8I94J1Vuk",
  authDomain: "alertacentral-9ba4f.firebaseapp.com",
  projectId: "alertacentral-9ba4f",
  storageBucket: "alertacentral-9ba4f.firebasestorage.app",
  messagingSenderId: "770130153303",
  appId: "1:770130153303:web:ade358f215f5a7c46f3812"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Captura la señal con el celular bloqueado o navegador cerrado
  messaging.onBackgroundMessage((payload) => {
    console.log('Alerta recibida en segundo plano: ', payload);

    // Intentamos leer de 'notification' o de 'data'
    const titulo = payload.notification?.title || payload.data?.title || "EMERGENCIA DE PLANTA";
    const cuerpo = payload.notification?.body || payload.data?.body || "¡EVACUACIÓN INMEDIATA AL PUNTO DE ENCUENTRO!";
    
    const latPlanta = payload.data?.lat ? parseFloat(payload.data.lat) : null;
    const lonPlanta = payload.data?.lon ? parseFloat(payload.data.lon) : null;

    const opcionesNotificacion = {
      body: cuerpo,
      icon: "https://img.icons8.com/color/480/siren.png", 
      vibrate: [500, 300, 500, 300, 500, 300, 1000, 500, 1000], // Patrón de vibración prolongado
      tag: 'alerta-evacuacion',
      renotify: true,
      requireInteraction: true, // No desaparece hasta que el usuario la descarte
      data: {
        url: "/", // Volver al inicio para pintar la pantalla de rojo
        latPlanta: latPlanta,
        lonPlanta: lonPlanta
      }
    };

    return self.registration.showNotification(titulo, opcionesNotificacion);
  });

  // Evento al hacer click en la notificación flotante
  self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Elimina el banner de la pantalla

    // Buscamos si la web ya estaba abierta en alguna pestaña del celular
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Si la pestaña ya existía, la trae al frente (focus)
        for (let i = 0; i < windowClients.length; i++) {
          let client = windowClients[i];
          if (client.url.includes(event.notification.data.url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Si el navegador estaba cerrado por completo, abre una pestaña nueva
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  });

  // Habilitadores de Criterio PWA (Para que Chrome/Safari permitan instalación local)
  const CACHE_NAME = 'alerta-central-pwa-v1';
  const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon.png'
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      }).then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }).then(() => self.clients.claim())
    );
  });

  // Interceptador de peticiones para garantizar el modo Offline / Criterio PWA
  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Solo interceptamos peticiones del propio origen que sean GET
    if (url.origin === self.location.origin && event.request.method === 'GET') {
      // Ignorar llamadas de desarrollo en caliente (HMR, websocket) si hubiera
      if (url.pathname.includes('/@vite') || url.pathname.includes('node_modules')) {
        return;
      }
      
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((response) => {
            // Guardamos copias en cache de los recursos locales consumidos de forma transparente
            if (response && response.status === 200 && response.type === 'basic') {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          }).catch(() => {
            // Fallback en caso de desconexión extrema
            return caches.match('/');
          });
        })
      );
    }
  });

} catch (e) {
  console.error("No se pudo iniciar el Firebase Service Worker de mensajería.", e);
}
