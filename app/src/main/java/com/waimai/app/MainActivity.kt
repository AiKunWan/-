package com.waimai.app

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        // 把 assets/ 目录映射为 https://appassets.androidplatform.net/assets/
        // 用 https 虚拟域让 WebView 的 IndexedDB / 存储 API 正常工作（file:// 下会失效）
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }

        // 拦截请求，交给 AssetLoader 从本地 assets 返回，全程不联网
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request?.url)
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    // 返回键：先退 WebView 历史，再退出 Activity
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
