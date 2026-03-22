package com.saro.cyberdeck.server;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "CyberDeckServer";
    private Button btnStartServer;
    private TextView txtStatus, setupText;
    private ProgressBar setupProgress;
    private WebView webView;
    private View webViewContainer, setupContainer;
    private View header; // Added this line

    private static final int STORAGE_PERMISSION_CODE = 200;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        btnStartServer = findViewById(R.id.btnStartServer);
        txtStatus = findViewById(R.id.txtStatus);
        setupText = findViewById(R.id.setupText);
        setupProgress = findViewById(R.id.setupProgress);
        webView = findViewById(R.id.webView);
        webViewContainer = findViewById(R.id.webViewContainer);
        setupContainer = findViewById(R.id.setupContainer);
        header = findViewById(R.id.header);

        setupWebView();

        if (isSystemReady()) {
            setupText.setText("CyberDeck Core is ready (Self-Contained).");
            btnStartServer.setText("START SERVER");
        }

        btnStartServer.setOnClickListener(v -> {
            if (!checkStoragePermissions()) {
                requestStoragePermissions();
                return;
            }

            if (!isSystemReady()) {
                startExtraction();
            } else {
                startServer();
            }
        });
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.setWebViewClient(new WebViewClient());
    }

    private boolean isSystemReady() {
        android.content.SharedPreferences prefs = getSharedPreferences("cyberdeck_prefs", android.content.Context.MODE_PRIVATE);
        int savedVersion = prefs.getInt("extracted_version", -1);
        int currentVersion = -1;
        try {
            currentVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {}
        
        File nodeProjectDir = new File(getFilesDir(), "nodejs-project");
        if (savedVersion != currentVersion || !nodeProjectDir.exists() || !new File(nodeProjectDir, "server.js").exists()) {
            return false;
        }
        return true;
    }

    private void startExtraction() {
        btnStartServer.setEnabled(false);
        setupProgress.setVisibility(View.VISIBLE);
        setupText.setText("Extracting internal assets...");

        new Thread(() -> {
            try {
                // Delete old extraction to prevent stale/corrupt files (e.g. EISDIR)
                File nodeDir = new File(getFilesDir(), "nodejs-project");
                if (nodeDir.exists()) {
                    deleteRecursive(nodeDir);
                }
                copyAssetFolder(getAssets(), "nodejs-project", getFilesDir().getAbsolutePath() + "/nodejs-project");
                mainHandler.post(() -> {
                    android.content.SharedPreferences prefs = getSharedPreferences("cyberdeck_prefs", android.content.Context.MODE_PRIVATE);
                    try {
                        int versionCode = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                        prefs.edit().putInt("extracted_version", versionCode).apply();
                    } catch (Exception e) {}
                    
                    setupText.setText("Extraction Complete.");
                    setupProgress.setVisibility(View.GONE);
                    btnStartServer.setEnabled(true);
                    btnStartServer.setText("START SERVER");
                });
            } catch (IOException e) {
                Log.e(TAG, "Extraction failed", e);
                mainHandler.post(() -> {
                    setupText.setText("FAILED: " + e.getMessage());
                    btnStartServer.setEnabled(true);
                });
            }
        }).start();
    }

    private static void deleteRecursive(File fileOrDir) {
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        fileOrDir.delete();
    }

    private static void copyAssetFolder(AssetManager assetManager, String fromAssetPath, String toPath) throws IOException {
        String[] files = assetManager.list(fromAssetPath);
        if (files != null && files.length > 0) {
            // It's a directory — create it and recurse
            new File(toPath).mkdirs();
            for (String file : files) {
                copyAssetFolder(assetManager, fromAssetPath + "/" + file, toPath + "/" + file);
            }
        } else {
            // It's a file — copy it
            copyAssetFile(assetManager, fromAssetPath, toPath);
        }
    }

    private static void copyAssetFile(AssetManager assetManager, String fromAssetPath, String toPath) throws IOException {
        File targetFile = new File(toPath);
        // If a directory exists with this name, delete it first
        if (targetFile.exists() && targetFile.isDirectory()) {
            deleteRecursive(targetFile);
        }
        File parent = targetFile.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();

        try (InputStream in = assetManager.open(fromAssetPath);
             OutputStream out = new FileOutputStream(targetFile)) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        }
    }

    private void startServer() {
        txtStatus.setText("STATUS: BOOTING...");
        btnStartServer.setEnabled(false);

        Intent intent = new Intent(this, ServerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }

        // Wait for server to bound port
        mainHandler.postDelayed(() -> {
            txtStatus.setText("STATUS: ONLINE (PORT 8888)");
            setupContainer.setVisibility(View.GONE);
            header.setVisibility(View.GONE);
            
            // Go Full Screen - REMOVED to resolve status bar overlapping
            
            webViewContainer.setVisibility(View.VISIBLE);
            webView.loadUrl("http://localhost:8888");
        }, 5000);
    }

    private boolean checkStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        } else {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private void requestStoragePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception e) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                startActivity(intent);
            }
        } else {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_CODE);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
