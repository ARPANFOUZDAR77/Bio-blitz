package com.bioblitz.microsurvival

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.bioblitz.microsurvival.data.BioBlitzDatabase

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var database: BioBlitzDatabase
    private lateinit var jsBridge: BioBlitzJavascriptBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        enableImmersiveFullscreen()

        database = BioBlitzDatabase.getInstance(applicationContext)
        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        jsBridge = BioBlitzJavascriptBridge(
            context = applicationContext,
            dao = database.bioBlitzDao()
        )
        webView.addJavascriptInterface(jsBridge, "BioBlitzAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('bioblitz-android-back'));",
                    null
                )
            }
        })

        webView.loadUrl("https://appassets.androidplatform.net/assets/dist/index.html")
    }

    private fun enableImmersiveFullscreen() {
        window.insetsController?.let { controller ->
            controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            controller.systemBarsBehavior =
                WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onPause() {
        super.onPause()
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('bioblitz-lifecycle-pause'));",
            null
        )
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveFullscreen()
        webView.onResume()
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('bioblitz-lifecycle-resume'));",
            null
        )
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("BioBlitzAndroid")
        webView.destroy()
        super.onDestroy()
    }
}
