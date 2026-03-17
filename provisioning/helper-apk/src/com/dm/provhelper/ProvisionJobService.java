package com.dm.provhelper;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.Intent;
import android.content.RestrictionsManager;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;

/**
 * Background job that fetches 3CX provisioning config from TCX-Hub
 * and delivers it to the 3CX app via content intent.
 *
 * Runs on BOOT_COMPLETED / MY_PACKAGE_REPLACED.
 * Retries with exponential backoff via JobScheduler if conditions aren't met.
 */
public class ProvisionJobService extends JobService {
    private static final String TAG = "ProvHelper";
    private static final String TCX_PACKAGE = "com.tcx.sipphone14";
    private static final String PREFS_NAME = "prov_state";
    private static final String KEY_CONFIG_VERSION = "config_version";
    private static final int CONNECT_TIMEOUT = 15_000;
    private static final int READ_TIMEOUT = 30_000;

    private volatile Thread workerThread;

    @Override
    public boolean onStartJob(JobParameters params) {
        Log.i(TAG, "ProvisionJobService started");

        workerThread = new Thread(() -> {
            boolean needsReschedule = false;
            try {
                needsReschedule = doProvision();
            } catch (Exception e) {
                Log.e(TAG, "Provision failed: " + e.getMessage(), e);
                needsReschedule = true;
            }
            jobFinished(params, needsReschedule);
        });
        workerThread.start();

        return true; // work is async
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        Log.w(TAG, "ProvisionJobService stopped by system");
        if (workerThread != null) workerThread.interrupt();
        return true; // reschedule
    }

    /**
     * @return true if job should be rescheduled (retry), false if done
     */
    private boolean doProvision() {
        // Step 1: Read managed config from Intune
        RestrictionsManager rm = (RestrictionsManager) getSystemService(Context.RESTRICTIONS_SERVICE);
        Bundle config = rm.getApplicationRestrictions();

        String serverUrl = config.getString("server_url", "");
        String userEmail = config.getString("user_email", "");
        String apiKey = config.getString("api_key", "");

        // Fallback: read from SharedPreferences (for testing on non-managed devices)
        if (serverUrl.isEmpty() || userEmail.isEmpty() || apiKey.isEmpty()) {
            SharedPreferences debugPrefs = getSharedPreferences("debug_config", MODE_PRIVATE);
            if (serverUrl.isEmpty()) serverUrl = debugPrefs.getString("server_url", "");
            if (userEmail.isEmpty()) userEmail = debugPrefs.getString("user_email", "");
            if (apiKey.isEmpty()) apiKey = debugPrefs.getString("api_key", "");
        }

        if (serverUrl.isEmpty() || userEmail.isEmpty() || apiKey.isEmpty()) {
            Log.w(TAG, "Config not ready (server_url=" + !serverUrl.isEmpty()
                    + " email=" + !userEmail.isEmpty() + " key=" + !apiKey.isEmpty() + ") — retry");
            return true;
        }

        Log.i(TAG, "Config loaded for: " + userEmail + " server: " + serverUrl);

        // Step 2: Check if 3CX is installed
        if (!isPackageInstalled(TCX_PACKAGE)) {
            Log.w(TAG, "3CX app not installed — retry");
            return true;
        }

        // Step 3: Get current config version (for 304 support)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String currentVersion = prefs.getString(KEY_CONFIG_VERSION, "");

        // Step 4: Fetch config from TCX-Hub
        try {
            String email = URLEncoder.encode(userEmail, "UTF-8");
            String version = URLEncoder.encode(currentVersion, "UTF-8");
            String url = serverUrl + "/provision/device?email=" + email + "&version=" + version;

            Log.i(TAG, "Fetching config from: " + url);

            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(READ_TIMEOUT);

            int status = conn.getResponseCode();
            Log.i(TAG, "Server response: " + status);

            if (status == 304) {
                Log.i(TAG, "Config unchanged — nothing to do");
                conn.disconnect();
                return false;
            }

            if (status == 404) {
                Log.w(TAG, "Extension not found for " + userEmail + " — retry");
                conn.disconnect();
                return true;
            }

            if (status == 425) {
                Log.w(TAG, "Config not ready yet — retry");
                conn.disconnect();
                return true;
            }

            if (status != 200) {
                Log.e(TAG, "Unexpected status: " + status);
                conn.disconnect();
                return true;
            }

            // Read the XML body
            byte[] xmlBytes = readStream(conn.getInputStream());
            conn.disconnect();

            String xml = new String(xmlBytes, "UTF-8");
            Log.i(TAG, "Config received, size=" + xmlBytes.length);

            // Extract extension number from filename in Content-Disposition or from XML
            String filename = extractFilename(conn, xml);

            // Step 5: Write to cache
            File cacheFile = new File(getCacheDir(), filename);
            try (FileOutputStream out = new FileOutputStream(cacheFile)) {
                out.write(xmlBytes);
            }
            Log.i(TAG, "Config written to: " + cacheFile.getAbsolutePath());

            // Step 6: Send intent to 3CX
            Uri contentUri = ProvFileProvider.getUriForFile(this, cacheFile);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/3cxconfig");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.setPackage(TCX_PACKAGE);

            Log.i(TAG, "Sending provisioning intent to 3CX...");
            startActivity(intent);
            Log.i(TAG, "Intent sent successfully");

            // Step 7: Ack back to server
            sendAck(serverUrl, apiKey, userEmail);

            // Step 8: Save config version
            String newVersion = sha256(xmlBytes);
            prefs.edit().putString(KEY_CONFIG_VERSION, newVersion).apply();
            Log.i(TAG, "Config version saved: " + newVersion);

            return false; // success — no reschedule

        } catch (Exception e) {
            Log.e(TAG, "HTTP error: " + e.getMessage(), e);
            return true; // retry
        }
    }

    private boolean isPackageInstalled(String pkg) {
        try {
            getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private String extractFilename(HttpURLConnection conn, String xml) {
        // Try Content-Disposition header first
        String disposition = conn.getHeaderField("Content-Disposition");
        if (disposition != null && disposition.contains("filename=")) {
            String name = disposition.replaceAll(".*filename=\"?([^\"]+)\"?.*", "$1");
            if (name.endsWith(".3cxconfig")) return name;
        }
        // Fallback: extract extension number from XML
        int start = xml.indexOf("<Extension>");
        int end = xml.indexOf("</Extension>");
        if (start >= 0 && end > start) {
            String ext = xml.substring(start + 11, end).trim();
            return "3cxprov_" + ext + ".3cxconfig";
        }
        return "3cxprov.3cxconfig";
    }

    private void sendAck(String serverUrl, String apiKey, String email) {
        try {
            String url = serverUrl + "/provision/device/ack";
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(READ_TIMEOUT);
            conn.setDoOutput(true);

            String deviceId = android.provider.Settings.Secure.getString(
                    getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
            String deviceName = android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL;

            String body = "{\"email\":\"" + escapeJson(email)
                    + "\",\"deviceId\":\"" + escapeJson(deviceId)
                    + "\",\"deviceName\":\"" + escapeJson(deviceName) + "\"}";

            conn.getOutputStream().write(body.getBytes("UTF-8"));

            int status = conn.getResponseCode();
            Log.i(TAG, "Ack response: " + status);
            conn.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "Ack failed (non-fatal): " + e.getMessage());
        }
    }

    private static byte[] readStream(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] tmp = new byte[4096];
        int len;
        while ((len = in.read(tmp)) > 0) {
            buf.write(tmp, 0, len);
        }
        return buf.toByteArray();
    }

    private static String sha256(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
