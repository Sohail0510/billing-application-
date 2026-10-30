package com.hisaab.billing;

import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Methods the web app calls as window.HisaabAndroid.*. Each returns a short message for a toast,
 * or an empty string when the system UI (share sheet) speaks for itself.
 */
public class AppBridge {
    private final MainActivity activity;

    AppBridge(MainActivity activity) {
        this.activity = activity;
    }

    private static String safeName(String name) {
        String n = name == null ? "file" : name.replaceAll("[^A-Za-z0-9._-]+", "_");
        return n.isEmpty() ? "file" : n;
    }

    /** Writes the file to the app cache and opens the Android share sheet (WhatsApp, Gmail, Drive…). */
    @JavascriptInterface
    public String shareFile(String base64, String fileName, String mimeType, String text) {
        try {
            File dir = new File(activity.getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) return "Could not prepare the file for sharing.";
            File file = new File(dir, safeName(fileName));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, fileName);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.setClipData(ClipData.newRawUri(fileName, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            final Intent chooser = Intent.createChooser(send, "Share " + fileName);
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            return "";
        } catch (Exception e) {
            return "Could not share the file: " + e.getMessage();
        }
    }

    /** Saves into Downloads/Hisaab on Android 10+; older versions get the share sheet to pick a place. */
    @JavascriptInterface
    public String saveFile(String base64, String fileName, String mimeType) {
        if (Build.VERSION.SDK_INT < 29) {
            String msg = shareFile(base64, fileName, mimeType, "");
            return msg.isEmpty() ? "Choose where to save the file" : msg;
        }
        String name = safeName(fileName);
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Hisaab");
            Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) return "Could not save to Downloads.";
            try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
                if (out == null) return "Could not save to Downloads.";
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            return "Saved to Downloads/Hisaab/" + name;
        } catch (Exception e) {
            return "Could not save the file: " + e.getMessage();
        }
    }

    @JavascriptInterface
    public void openExternal(String url) {
        activity.openExternal(url);
    }

    /** True when this phone has a speech recognition service. */
    @JavascriptInterface
    public boolean canListen() {
        return SpeechRecognizer.isRecognitionAvailable(activity);
    }

    /** Starts one listening session; the result comes back to window.__hisaabSpeech or window.__hisaabSpeechError. */
    @JavascriptInterface
    public void listen(String lang) {
        activity.startListening(lang == null || lang.isEmpty() ? "en-IN" : lang);
    }

    /** Reads text aloud in English (en-IN) or Hindi (hi-IN). */
    @JavascriptInterface
    public void speak(String text, String lang) {
        activity.speak(text == null ? "" : text, lang == null ? "en-IN" : lang);
    }
}
