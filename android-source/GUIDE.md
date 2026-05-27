# Guía de Compilación de Aplicación Android Nativa para la Alerta Central

Esta guía explica detalladamente cómo estructurar e integrar el WebView de alta prioridad con Firebase Cloud Messaging (FCM) e ignorar los estados de bloqueo del celular para que la pantalla se encienda de golpe ante una alarma en el radio de 500 metros.

## 1. Funcionamiento del Sistema de Desbloqueo Nativo

Para lograr que una app venza el bloqueo de pantalla (`Keyguard`), el silencio del dispositivo (`Do Not Disturb`) y se encienda la pantalla de manera inmediata en Android, se requiere una combinación de tecnologías nativas que las páginas webs estándar en navegadores como Chrome o Safari no están autorizadas a ejecutar por razones de seguridad:

1. **`FullScreenIntent`**: La notificación push de Firebase llega con prioridad máxima y un intent designado como pantalla completa. En lugar de mostrar un "banner flotante" silencioso, Android ejecuta de forma inmediata la actividad asociada si la pantalla está apagada.
2. **`showWhenLocked` y `turnScreenOn`**: Modifican los flags de la ventana de la `MainActivity` nativa de Android, instruyendo al gestor de ventanas del sistema operativo que dibuje la interfaz por encima de cualquier patrón, clave o huella digital activa durante la alarma de evacuación.
3. **`WakeLock` (SCREEN_BRIGHT_WAKE_LOCK)**: Obliga físicamente al chip de energía del celular a energizar la pantalla LCD/OLED de inmediato al recibir la notificación push desde la Central.
4. **Bypass no-molestar (DND)**: El canal de notificaciones nativas de Android está configurado con relevancia `IMPORTANCE_HIGH` y `setBypassDnd(true)` para que resuene de forma estridente sin importar la configuración de silencio activa.

---

## 2. Instrucciones para cargar en Android Studio

1. **Crear proyecto nuevo**: Crea un proyecto en Android Studio con una plantilla vacía de actividad (`Empty Views Activity`).
2. **Dependencias Gradle (`app/build.gradle`)**: Asegúrate de tener añadidas las dependencias de Firebase Messaging y soporte AppCompat:
   ```groovy
   dependencies {
       implementation 'androidx.appcompat:appcompat:1.6.1'
       implementation 'com.google.android.material:material:1.9.0'
       
       // Firebase Cloud Messaging (FCM)
       implementation platform('com.google.firebase:firebase-bom:32.2.0')
       implementation 'com.google.firebase:firebase-messaging'
   }
   ```
3. **Copiar archivos**:
   - Reemplaza el archivo `AndroidManifest.xml` de tu proyecto con el de la carpeta `/android-source/AndroidManifest.xml`.
   - Copia `MainActivity.kt` y `MyFirebaseMessagingService.kt` en la carpeta de código fuente de tu paquete (ej. `com.centraltermoelectrica.alerta`).
4. **Acoplar tu URL de producción**:
   - Dentro de `MainActivity.kt`, ubica la variable `val appUrl = "https://your-applet-url.com"` y cámbiala por la URL pública definitiva de tu aplicación React.
5. **Configurar Servicios de Firebase**:
   - Descarga tu archivo `google-services.json` desde la Consola de Firebase del proyecto `alertacentral-9ba4f`.
   - Coloca `google-services.json` dentro de la carpeta `app/` de tu proyecto Android y compila en modo release.

---

## 3. Comprobación y Permisos Físicos en el Teléfono

Una vez instalada la aplicación en el dispositivo físico, para asegurar el correcto funcionamiento, es necesario:
- **Habilitar mostrar sobre otras aplicaciones**: En algunos sistemas modificados (Xiaomi MIUI, Huawei, Samsung OneUI) se debe otorgar manualmente el permiso "Mostrar en pantalla de bloqueo" en la configuración de la App para asegurar que ignore el bloqueo de inmediato.
- **Permitir Notificaciones de alta importancia**: Asegurar que la App esté excluida del optimizador de batería de Android para que el proceso en segundo plano de FCM no se congele.
