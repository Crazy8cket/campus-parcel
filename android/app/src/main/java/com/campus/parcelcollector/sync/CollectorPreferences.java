package com.campus.parcelcollector.sync;

import android.content.Context;
import android.content.SharedPreferences;

public final class CollectorPreferences {
    private static final String PREFS = "collector_preferences";
    private static final String KEY_SERVER = "server_url";
    private static final String KEY_DEVICE_TOKEN = "device_token";
    private static final String KEY_DEVICE_NAME = "device_name";
    private static final String KEY_PAIRED_AT = "paired_at";

    private CollectorPreferences() {
    }

    public static String serverUrl(Context context) {
        return prefs(context).getString(KEY_SERVER, "");
    }

    public static void setServerUrl(Context context, String value) {
        prefs(context).edit().putString(KEY_SERVER, value).apply();
    }

    public static String deviceToken(Context context) {
        return prefs(context).getString(KEY_DEVICE_TOKEN, "");
    }

    public static String deviceName(Context context) {
        return prefs(context).getString(KEY_DEVICE_NAME, "Android 采集端");
    }

    public static long pairedAt(Context context) {
        return prefs(context).getLong(KEY_PAIRED_AT, 0);
    }

    public static void savePairing(
        Context context,
        String deviceToken,
        String deviceName
    ) {
        prefs(context).edit()
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putString(KEY_DEVICE_NAME, deviceName)
            .putLong(KEY_PAIRED_AT, System.currentTimeMillis())
            .apply();
    }

    public static void clearPairing(Context context) {
        prefs(context).edit()
            .remove(KEY_DEVICE_TOKEN)
            .remove(KEY_PAIRED_AT)
            .apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}

