package com.centraltermoelectrica.alerta

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Vibrator
import android.os.VibrationEffect
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // 1. ENCENDER LA PANTALLA MEDIANTE WAKELOCK (Ignora bloqueo de pantalla)
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "AlertaCentral::WakeLockEvacuacion"
        )
        // Adquirir el wakelock por 15 segundos para dar tiempo
        wakeLock?.acquire(15000L)

        // 2. DISPARAR VIBRADOR DE ALTA INTENSIDAD ADICIONAL
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Patrón: Vibrar 1 seg, descansar 0.5 seg, repetir
                vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 1000, 500, 1000, 500, 1000), -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(3000L) // 3 segundos
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. ENVIAR NOTIFICACIÓN CON FULL SCREEN INTENT (Vence pantalla de bloqueo)
        sendFullScreenNotification(remoteMessage)
    }

    private fun sendFullScreenNotification(remoteMessage: RemoteMessage) {
        val channelId = "canal_evacuacion_critica"
        val channelName = "Alertas Críticas de Planta"

        val title = remoteMessage.data["title"] ?: remoteMessage.notification?.title ?: "EMERGENCIA DE CENTRAL"
        val body = remoteMessage.data["body"] ?: remoteMessage.notification?.body ?: "¡EVACUACIÓN INMEDIATA!"

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Crear una intención para lanzar la MainActivity
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("activeAlarm", "ON")
        }

        // Flag FLAG_IMMUTABLE o FLAG_UPDATE_CURRENT para versiones recientes de Android
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        // Este PendingIntent se disparará a pantalla completa e ignorará el bloqueo
        val fullScreenPendingIntent = PendingIntent.getActivity(this, 0, intent, pendingIntentFlags)

        // Sonido de sirena por defecto del sistema o URI personalizado
        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        // Configurar el canal en Android Oreo+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notificaciones de Sirena de Evacuación Georeferenciada"
                enableLights(true)
                lightColor = android.graphics.Color.RED
                enableVibration(true)
                vibrationPattern = longArrayOf(100, 1000, 500, 1000, 100),
                setBypassDnd(true) // INTENTO DE PERMITIR BYPASS DE SILENCIO (NO MOLESTAR)
                
                // Asociar sonido de alarma al canal
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()
                setSound(alarmSound, audioAttributes)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // CONSTRUIR NOTIFICACIÓN DE MÁXIMA PRIORIDAD
        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_absolute_gravity_and_relative_motion) // Cambiar por icono de sirena
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX) // Forzar que sea máxima prioridad
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(alarmSound)
            .setVibrate(longArrayOf(100, 1000, 500, 1000, 200, 1000))
            .setFullScreenIntent(fullScreenPendingIntent, true) // CRÍTICO: Abre la app de golpe sobre la pantalla de bloqueo
            .setAutoCancel(true)
            .setOngoing(true) // Impide descartarla fácil durante la evacuación

        // ID de la notificación para poder descartarla manualmente
        val notificationId = 911
        notificationManager.notify(notificationId, notificationBuilder.build())
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Aquí puedes subir el token a tu base de datos si es necesario directamente
        // database.ref("dispositivos").child(token).setValue(...)
    }
}
