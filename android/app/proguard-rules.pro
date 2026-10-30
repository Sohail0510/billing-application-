# Keep the JavaScript bridge methods if you turn on minification.
-keepclassmembers class com.hisaab.billing.AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
