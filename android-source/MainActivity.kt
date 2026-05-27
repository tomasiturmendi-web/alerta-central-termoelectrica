package com.centraltermoelectrica.alerta

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
        webSettings.geolocationEnabled = true // IMPORTANTE

        // Evitar que abra el navegador externo
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

                // Verificar si tenemos permisos nativos en Android
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
                    // Sí tiene permiso, conceder de forma inmediata al WebView
                    callback?.invoke(origin, true, false)
                }
            }
        }

        // URL del Dashboard/Receptor (reemplazar por la URL final del servidor)
        val appUrl = "https://your-applet-url.com" // O cargamos desde local assets: "file:///android_asset/index.html"
        webView.loadUrl(appUrl)

        // Solicitar permisos de Notificación en Android 13+ si es necesario
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    // Procesar la respuesta a los permisos nativos de ubicación pedidas por el WebView
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
}
