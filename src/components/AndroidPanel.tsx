import React, { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, ShieldCheck, Cpu, Smartphone } from 'lucide-react';

export default function AndroidPanel() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const manifestCode = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.centraltermoelectrica.alerta">

    <!-- PERMISOS DE ALTA PRIORIDAD Y DESBLOQUEO DE PANTALLA -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.DISABLE_KEYGUARD" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <!-- PERMISOS DE SERVICIO EN SEGUNDO PLANO Y NOTIFICACIONES -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- PERMISOS DE GEOLOCALIZACIÓN -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Alerta Central"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <!-- ACTIVIDAD PRINCIPAL (Muestra la pantalla de emergencia sobre el bloqueo) -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleInstance"
            android:showWhenLocked="true"
            android:turnScreenOn="true"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- SERVICIO NATIVO EN SEGUNDO PLANO (Monitorea Firebase 24/7 y despierta la pantalla) -->
        <service
            android:name=".AlertaBackgroundService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="shortService" />

    </application>
</manifest>`;

  const mainActivityCode = `package com.centraltermoelectrica.alerta

import android.Manifest
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
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

        // 1. INICIAR SERVICIO NATIVO DE MONITOREO EN SEGUNDO PLANO
        val serviceIntent = Intent(this, AlertaBackgroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // 2. FORZAR ENCENDIDO Y DESBLOQUEO VISUAL DE PANTALLA
        desbloquearPantalla()

        // 3. CONFIGURAR WEBVIEW A PANTALLA COMPLETA
        webView = WebView(this)
        setContentView(webView)

        val webSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.allowFileAccess = true
        webSettings.setGeolocationEnabled(true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url != null) {
                    view?.loadUrl(url)
                }
                return true
            }
        }

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

        // URL pública en GitHub Pages
        val appUrl = "https://tomasiturmendi-web.github.io/alerta-central-termoelectrica/"
        webView.loadUrl(appUrl)

        // Solicitar permiso de notificaciones en Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        desbloquearPantalla()
    }

    private fun desbloquearPantalla() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
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

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class AlertaBackgroundService : Service() {

    private var isRunning = false
    private var mediaPlayer: MediaPlayer? = null
    private var isAlarmActive = false
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val channelId = "servicio_alerta_monitoreo"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Servicio de Monitoreo Continuo",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Alerta Central")
            .setContentText("Monitoreo de señal en tiempo real activo...")
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(1001, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            isRunning = true
            iniciarEscuchaFirebase()
        }
        return START_STICKY
    }

    private fun iniciarEscuchaFirebase() {
        thread {
            val dbUrl = "https://alertacentral-9ba4f-default-rtdb.firebaseio.com/estadoAlarma.json"
            
            while (isRunning) {
                try {
                    val url = URL(dbUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000

                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        val response = reader.readLine()?.replace("\"", "")?.trim() ?: "OFF"
                        reader.close()

                        if (response == "ON" && !isAlarmActive) {
                            isAlarmActive = true
                            dispararAlertaNativa()
                        } else if (response == "OFF" && isAlarmActive) {
                            isAlarmActive = false
                            detenerAlertaNativa()
                        }
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                // Consulta la base de datos cada 1.5 segundos
                Thread.sleep(1500)
            }
        }
    }

    private fun dispararAlertaNativa() {
        // 1. ENCENDER PANTALLA MEDIANTE WAKELOCK DE ALTA POTENCIA
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "AlertaCentral::WakeLockEmergencia"
            )
            wakeLock?.acquire(30000L)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 2. REPRODUCIR SONIDO DE SIRENA CONTINUA SOBRE MODO SILENCIOSO
        try {
            if (mediaPlayer == null) {
                val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

                mediaPlayer = MediaPlayer().apply {
                    setDataSource(applicationContext, alarmSound)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.21) {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                        )
                    }
                    isLooping = true
                    prepare()
                    start()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. LANZAR MAINACTIVITY SOBRE LA PANTALLA DE BLOQUEO
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
            }
            startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun detenerAlertaNativa() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }

        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        isRunning = false
        detenerAlertaNativa()
        super.onDestroy()
    }
}`;

  const files = [
    { title: 'AndroidManifest.xml', code: manifestCode, lang: 'xml' },
    { title: 'MainActivity.kt', code: mainActivityCode, lang: 'kotlin' },
    { title: 'AlertaBackgroundService.kt', code: messageServiceCode, lang: 'kotlin' }
  ];

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-850 rounded-xl p-6 text-slate-300 max-w-5xl mx-auto space-y-8 font-sans">
      <div className="space-y-3 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-2 text-rose-500 font-mono text-sm tracking-widest uppercase font-bold">
          <Terminal className="h-4 w-4" />
          <span>Generación de Aplicación para Android</span>
        </div>
        <h2 className="text-3xl font-bold text-slate-100">Plan de Integración Móvil Nativa</h2>
        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
          El navegador móvil normal bloquea el encendido forzado de la pantalla. Para saltear esta restricción en la central, 
          debes compilar estos tres archivos de código nativo incluidos en la descarga. Estos archivos interceptan las alertas FCM 
          y despiertan el teléfono automáticamente mediante el servicio en primer plano.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-slate-950 p-5 rounded-lg border border-slate-850 space-y-3">
          <Smartphone className="h-8 w-8 text-sky-400" />
          <h4 className="font-bold text-slate-200 font-mono text-sm">1. Pantalla Completa WebView</h4>
          <p className="text-slate-450 text-xs leading-relaxed">
            La <span className="text-slate-300 font-semibold">MainActivity</span> levanta tu diseño web a pantalla completa e integra el GPS de forma nativa resolviendo los permisos directamente con el chip del dispositivo.
          </p>
        </div>

        <div className="bg-slate-950 p-5 rounded-lg border border-slate-850 space-y-3">
          <Cpu className="h-8 w-8 text-sky-400" />
          <h4 className="font-bold text-slate-200 font-mono text-sm">2. WakeLock & Desbloqueo</h4>
          <p className="text-slate-450 text-xs leading-relaxed">
            Usa los permisos <span className="text-slate-300 font-semibold">WAKE_LOCK</span> y <span className="text-slate-300 font-semibold">DISABLE_KEYGUARD</span> para forzar el encendido de la pantalla a máxima potencia lumínica al recibir el push de evacuación.
          </p>
        </div>

        <div className="bg-slate-950 p-5 rounded-lg border border-slate-850 space-y-3">
          <ShieldCheck className="h-8 w-8 text-rose-500" />
          <h4 className="font-bold text-slate-200 font-mono text-sm">3. Full Screen Intent</h4>
          <p className="text-slate-450 text-xs leading-relaxed">
            Inicia un <span className="text-rose-450 font-semibold">FullScreenIntent</span> con prioridad máxima. Esto sobrepone de inmediato la app por encima del patrón o huella digital activa para que el operario actúe.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase text-slate-500 tracking-wider font-semibold">Códigos fuentes nativos para usar</span>
          <span className="text-xs bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-1 rounded-full font-mono font-bold">
            Directorio: /android-source/
          </span>
        </div>

        {files.map((file, idx) => (
          <div key={idx} className="border border-slate-855 rounded-lg overflow-hidden bg-slate-950">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
              <span className="font-mono text-xs text-sky-400 font-bold">{file.title}</span>
              <button
                onClick={() => handleCopy(file.code, idx)}
                className="text-slate-400 hover:text-slate-200 border border-slate-800 text-xs bg-slate-955 hover:bg-slate-900 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors font-mono cursor-pointer font-bold"
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
            <pre className="p-4 overflow-auto max-h-80 text-left font-mono text-xs leading-relaxed text-slate-300 select-all bg-slate-950">
              <code>{file.code}</code>
            </pre>
          </div>
        ))}
      </div>

      <div className="bg-amber-955/20 border border-amber-900/40 p-5 rounded-lg space-y-2">
        <h4 className="text-amber-400 font-mono font-bold text-sm">⚠️ Nota Crítica Para Despliegues Reales</h4>
        <p className="text-amber-500/90 text-xs leading-relaxed">
          En teléfonos Android comerciales con capas pesadas de fabricantes (ej: Xiaomi, Huawei, Samsung), las políticas estrictas de ahorro de energía pueden suspender las alarmas de fondo. Asegúrate de desactivar explícitamente el "Ahorro de batería" para esta aplicación y habilitar el permiso de manual "Visualizar en Pantalla de Bloqueo" dentro de la configuración de la App para asegurar efectividad total.
        </p>
      </div>
    </div>
  );
}
