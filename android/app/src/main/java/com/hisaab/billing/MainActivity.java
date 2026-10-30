package com.hisaab.billing;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Hosts the billing app (assets/www/index.html) in a WebView.
 * Pages are served from https://appassets.androidplatform.net so on-device storage (IndexedDB) persists.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int MIC_PERMISSION_REQUEST = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private String pendingListenLang;
    private String pendingSpeech;
    private String pendingSpeechLang;
    private TextRecognizer textRecognizer;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.app_surface));
        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.app_surface));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupEdgeToEdge();
        applyInsets(root);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);

        webView.addJavascriptInterface(new AppBridge(this), "HisaabAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                openExternal(uri.toString());
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                String[] types = params.getAcceptTypes();
                boolean imageOnly = types != null && types.length > 0 && types[0] != null && types[0].startsWith("image/");
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(imageOnly ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, imageOnly ? "Choose an image" : "Choose a file"), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(APP_URL);
        }
    }

    /** Lets the app close an open sheet or go back a screen; leaves the app only from the home screen. */
    private void handleBack() {
        webView.evaluateJavascript("window.__hisaabBack ? window.__hisaabBack() : 'false'", value -> {
            if (!"\"true\"".equals(value)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Called on Android 12 and older; newer versions use the OnBackInvokedCallback above.
        handleBack();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** Starts listening for one phrase. Needs the microphone permission, asked once. */
    void startListening(final String lang) {
        runOnUiThread(() -> {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pendingListenLang = lang;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION_REQUEST);
                return;
            }
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                deliverSpeechError("Voice is not available on this phone.");
                return;
            }
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                recognizer.setRecognitionListener(new SpeechListener());
            }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        });
    }

    /** Reads the text on a label photo and hands the result to the web app. Runs entirely on the phone. */
    void recognizeLabel(final String base64) {
        runOnUiThread(() -> {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    deliverOcrError("That photo could not be opened. Try again.");
                    return;
                }
                if (textRecognizer == null) textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                InputImage image = InputImage.fromBitmap(bitmap, 0);
                textRecognizer.process(image)
                        .addOnSuccessListener(result -> deliverOcr(result.getText()))
                        .addOnFailureListener(e -> deliverOcrError("Could not read the photo. Try a clearer picture."));
            } catch (Exception e) {
                deliverOcrError("Could not read the photo. Try a clearer picture.");
            }
        });
    }

    private void deliverOcr(String text) {
        webView.evaluateJavascript("window.__hisaabOcr && window.__hisaabOcr(" + JSONObject.quote(text == null ? "" : text) + ")", null);
    }

    private void deliverOcrError(String message) {
        webView.evaluateJavascript("window.__hisaabOcrError && window.__hisaabOcrError(" + JSONObject.quote(message) + ")", null);
    }

    /** Reads a reply aloud. The text-to-speech engine starts on first use. */
    void speak(final String text, final String lang) {
        runOnUiThread(() -> {
            if (tts == null) {
                pendingSpeech = text;
                pendingSpeechLang = lang;
                tts = new TextToSpeech(this, status -> {
                    if (status != TextToSpeech.SUCCESS) {
                        tts = null;
                        pendingSpeech = null;
                        return;
                    }
                    if (pendingSpeech != null) speakNow(pendingSpeech, pendingSpeechLang);
                    pendingSpeech = null;
                });
                return;
            }
            speakNow(text, lang);
        });
    }

    private void speakNow(String text, String lang) {
        if (tts == null) return;
        Locale locale = "hi-IN".equals(lang) ? Locale.forLanguageTag("hi-IN") : Locale.forLanguageTag("en-IN");
        if (tts.setLanguage(locale) < TextToSpeech.LANG_AVAILABLE) tts.setLanguage(Locale.ENGLISH);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hisaab-reply");
    }

    private void deliverSpeech(String text) {
        webView.evaluateJavascript("window.__hisaabSpeech && window.__hisaabSpeech(" + JSONObject.quote(text) + ")", null);
    }

    private void deliverSpeechError(String message) {
        webView.evaluateJavascript("window.__hisaabSpeechError && window.__hisaabSpeechError(" + JSONObject.quote(message) + ")", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != MIC_PERMISSION_REQUEST) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }
        String lang = pendingListenLang;
        pendingListenLang = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && lang != null) {
            startListening(lang);
        } else {
            deliverSpeechError("Microphone permission is needed. You can allow it in the phone's app settings.");
        }
    }

    /** Translates recognizer events into the callbacks the web app listens for. */
    private class SpeechListener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onPartialResults(Bundle partialResults) {}
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onResults(Bundle results) {
            ArrayList<String> list = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (list == null || list.isEmpty()) {
                deliverSpeechError("I did not hear anything. Try again.");
                return;
            }
            deliverSpeech(list.get(0));
        }

        @Override
        public void onError(int error) {
            switch (error) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    deliverSpeechError("I did not hear anything. Try again.");
                    break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    deliverSpeechError("Microphone permission is needed.");
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    deliverSpeechError("Voice needs internet on this phone. Check your connection and try again.");
                    break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    deliverSpeechError("Voice is busy. Try again in a moment.");
                    break;
                default:
                    deliverSpeechError("Could not hear you. Try again.");
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (textRecognizer != null) textRecognizer.close();
        if (tts != null) tts.shutdown();
        if (webView != null) {
            webView.removeJavascriptInterface("HisaabAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    void openExternal(String url) {
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException e) {
                android.widget.Toast.makeText(this, "No app found to open this link", android.widget.Toast.LENGTH_SHORT).show();
            }
        });
    }

    private boolean isNight() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Draws behind the status and navigation bars on every Android version; insets are applied as padding. */
    @SuppressWarnings("deprecation")
    private void setupEdgeToEdge() {
        Window window = getWindow();
        boolean light = !isNight();
        if (Build.VERSION.SDK_INT < 35) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light ? mask : 0, mask);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (light) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @SuppressWarnings("deprecation")
    private void applyInsets(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        root.requestApplyInsets();
    }
}
