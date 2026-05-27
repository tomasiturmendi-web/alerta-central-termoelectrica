import React, { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, ShieldCheck, Cpu, Smartphone } from 'lucide-react';

export default function AndroidPanel() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const manifestCode = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.centraltermoelectrica.alerta">

    <!-- PERMISOS DE ALTA PRIORIDAD SOLICITADOS -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.DISABLE_KEYGUARD" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    
    <!-- PERMISOS REQUERIDOS PARA ANDROID 13+ (NOTIFICACIONES Y SERVICIOS) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

    <!-- PERMISOS REQUERIDOS PARA GEOLOCALIZACIÓN ALTA PRECISIÓN DENTRO DEL WEBVIEW -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Alerta Central"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <!-- ACTIVIDAD PRINCIPAL CON WEBVIEW Y REACCIONES DE DESBLOQUEO -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:showWhenLocked="true"
            android:turnScreenOn="true"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- SERVICIO MÓVIL EN SEGUNDO PLANO ASOCIADO A FIREBASE PUSH -->
        <service
            android:name=".MyFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

    </application>
</manifest>`;

  const mainActivityCode = `package com.centraltermoelectrica.alerta

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val LOCATION_PERMISSION_REQUEST_CODE = 44
    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // CONFIGURACIÓN DE PANTALLA SOBRE EL BLOQUEO (WAKE UP & BYPASS LOCKSCREEN)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        // WebView a pantalla completa
        webView = WebView(this)
        setContentView(webView)

        // Habilitar configuraciones web críticas
        val webSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.allowFileAccess = true
        webSettings.geolocationEnabled = true

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url != null) {
                    view?.loadUrl(url)
                }
                return true
            }
        }

        // ASOCIAR GEOLOCALIZACION DEL WEBVIEW AL SISTEMA OPERATIVO ANDROID
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                geolocationCallback = callback
                geolocationOrigin = origin

                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                        LOCATION_PERMISSION_REQUEST_CODE
                    )
                } else {
                    callback?.invoke(origin, true, false)
                }
            }
        }

        // Cambiar por la URL real provista por Google AI Studio
        val appUrl = window.location.href 
        webView.loadUrl(appUrl)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            geolocationCallback?.invoke(geolocationOrigin, granted, false)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}`;

  const messageServiceCode = `package com.centraltermoelectrica.alerta

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
        wakeLock?.acquire(15000L)

        // 2. DISPARAR VIBRADOR DE ALTA INTENSIDAD ADICIONAL
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 1000, 500, 1000, 500, 1000), -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(3000L)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. ENVIAR NOTIFICACIÓN CON FULL SCREEN INTENT
        sendFullScreenNotification(remoteMessage)
    }

    private fun sendFullScreenNotification(remoteMessage: RemoteMessage) {
        val channelId = "canal_evacuacion_critica"
        val channelName = "Alertas Críticas de Planta"

        val title = remoteMessage.data["title"] ?: remoteMessage.notification?.title ?: "EMERGENCIA DE CENTRAL"
        val body = remoteMessage.data["body"] ?: remoteMessage.notification?.body ?: "¡EVACUACIÓN INMEDIATA!"

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("activeAlarm", "ON")
        }

        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val fullScreenPendingIntent = PendingIntent.getActivity(this, 0, intent, pendingIntentFlags)
        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notificaciones de Sirena de Evacuación Georeferenciada"
                enableLights(true)
                lightColor = android.graphics.Color.RED
                enableVibration(true)
                vibrationPattern = longArrayOf(100, 1000, 500, 1000, 100)
                setBypassDnd(true)
                
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()
                setSound(alarmSound, audioAttributes)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(alarmSound)
            .setVibrate(longArrayOf(100, 1000, 500, 1000, 200, 1000))
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true)
            .setOngoing(true)

        notificationManager.notify(911, notificationBuilder.build())
    }
}`;

  const files = [
    { title: 'AndroidManifest.xml', code: manifestCode, lang: 'xml' },
    { title: 'MainActivity.kt', code: mainActivityCode, lang: 'kotlin' },
    { title: 'MyFirebaseMessagingService.kt', code: messageServiceCode, lang: 'kotlin' }
  ];

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="bg-gray-900 border border-slate-800 rounded-xl p-6 text-gray-100 max-w-5xl mx-auto space-y-8 font-sans">
      <div className="space-y-3 border-b border-gray-800 pb-5">
        <div className="flex items-center space-x-2 text-amber-500 font-mono text-sm tracking-widest uppercase">
          <Terminal className="h-4 w-4" />
          <span>Generación de Aplicación para Android</span>
        </div>
        <h2 className="text-3xl font-bold text-slate-100">Plan de Integración Móvil Nativa</h2>
        <p className="text-gray-400 text-sm max-w-3xl">
          El navegador móvil normal bloquea el encendido forzado de la pantalla. Para saltear esta restricción en la central, 
          debes compilar estos tres archivos de código nativo incluidos en la descarga. Estos archivos interceptan las alertas FCM 
          y despiertan el teléfono automáticamente mediante el servicio en primer plano.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-3">
          <Smartphone className="h-8 w-8 text-sky-400" />
          <h4 className="font-bold text-slate-100 font-mono text-sm">1. Pantalla Completa WebView</h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            La <span className="text-slate-200">MainActivity</span> levanta tu diseño web a pantalla completa e integra el GPS de forma nativa resolviendo los permisos directamente con el chip del dispositivo.
          </p>
        </div>

        <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-3">
          <Cpu className="h-8 w-8 text-emerald-400" />
          <h4 className="font-bold text-slate-100 font-mono text-sm">2. WakeLock & Desbloqueo</h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            Usa los permisos <span className="text-slate-200">WAKE_LOCK</span> y <span className="text-slate-200">DISABLE_KEYGUARD</span> para forzar el encendido de la pantalla a máxima potencia lumínica al recibir el push de evacuación.
          </p>
        </div>

        <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-3">
          <ShieldCheck className="h-8 w-8 text-rose-400" />
          <h4 className="font-bold text-slate-100 font-mono text-sm">3. Full Screen Intent</h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            Inicia un <span className="text-rose-300">FullScreenIntent</span> con prioridad máxima. Esto sobrepone de inmediato la app por encima del patrón o huella digital activa para que el operario actúe.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase text-gray-500 tracking-wider">Códigos fuentes nativos para usar</span>
          <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-mono">
            Directorio: /android-source/
          </span>
        </div>

        {files.map((file, idx) => (
          <div key={idx} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
              <span className="font-mono text-xs text-amber-500 font-bold">{file.title}</span>
              <button
                onClick={() => handleCopy(file.code, idx)}
                className="text-gray-400 hover:text-white text-xs bg-slate-800 hover:bg-slate-750 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors font-mono"
              >
                {copiedIndex === idx ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar código</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 overflow-auto max-h-80 text-left font-mono text-xs leading-relaxed text-gray-300 select-all selection:bg-slate-800">
              <code>{file.code}</code>
            </pre>
          </div>
        ))}
      </div>

      <div className="bg-amber-950/20 border border-amber-900/40 p-5 rounded-lg space-y-2">
        <h4 className="text-amber-500 font-mono font-bold text-sm">⚠️ Nota Crítica Para Despliegues Reales</h4>
        <p className="text-amber-200/80 text-xs leading-relaxed">
          En teléfonos Android comerciales con capas pesadas de fabricantes (ej: Xiaomi, Huawei, Samsung), las políticas estrictas de ahorro de energía pueden suspender las alarmas de fondo. Asegúrate de desactivar explícitamente el "Ahorro de batería" para esta aplicación y habilitar el permiso de manual "Visualizar en Pantalla de Bloqueo" dentro de la configuración de la App para asegurar efectividad total.
        </p>
      </div>
    </div>
  );
}
