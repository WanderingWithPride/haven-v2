package com.saro.cyberdeck.server;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;

import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;

public class ServerService extends Service {

    private static final String TAG = "CyberDeckService";
    private static final String CHANNEL_ID = "CyberDeckServerChannel";
    private static final int NOTIFICATION_ID = 1;

    private boolean isRunning = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (isRunning) return START_STICKY;

        createNotificationChannel();
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);

        startNodeEngine();
        isRunning = true;

        return START_STICKY;
    }

    private void startNodeEngine() {
        new Thread(() -> {
            try {
                String nodeDir = getFilesDir().getAbsolutePath() + "/nodejs-project";
                String mainJs = nodeDir + "/server.js";
                String dataDir = Environment.getExternalStorageDirectory().getAbsolutePath() + "/CyberDeck";


                // Ensure data dir exists
                new File(dataDir).mkdirs();

                Log.d(TAG, "Starting Node.js Engine...");
                Log.d(TAG, "Main Script: " + mainJs);
                Log.d(TAG, "Data Dir: " + dataDir);

                // Set environment variables for CyberDeck
                NodeEngine.setEnv("CYBERDECK_DATA_HOME", dataDir);
                NodeEngine.setEnv("NODE_ENV", "production");
                NodeEngine.setEnv("TMPDIR", getCacheDir().getAbsolutePath());
                NodeEngine.setEnv("HOME", getFilesDir().getAbsolutePath());

                // Arguments for Node.js
                String[] args = { mainJs };

                // This call blocks while the Node.js engine is running
                int exitCode = NodeEngine.startNode(args);
                Log.d(TAG, "Node.js engine exited with code: " + exitCode);

            } catch (Exception e) {
                Log.e(TAG, "Node.js execution failed", e);
            } finally {
                isRunning = false;
                stopForeground(true);
                stopSelf();
            }
        }).start();
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("CyberDeck Server")
                .setContentText("Status: Online (Self-Contained)")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "CyberDeck Server Service Channel",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
