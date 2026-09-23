package com.campus.parcelcollector.network;

import com.campus.parcelcollector.data.LocalParcel;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class SyncClient {
    private static final int TIMEOUT_MS = 12000;

    private SyncClient() {
    }

    public static PairingResult claimPairing(
        String serverUrl,
        String code,
        String deviceName
    ) throws IOException, JSONException {
        JSONObject body = new JSONObject()
            .put("code", code)
            .put("deviceName", deviceName);
        JSONObject json = request(serverUrl, "/api/v1/pairings/claim", "POST", null, body);
        PairingResult result = new PairingResult();
        result.deviceId = json.getString("deviceId");
        result.deviceToken = json.getString("deviceToken");
        result.sessionToken = json.getString("sessionToken");
        return result;
    }

    public static int sync(
        String serverUrl,
        String deviceToken,
        List<LocalParcel> parcels
    ) throws IOException, JSONException {
        JSONArray array = new JSONArray();
        for (LocalParcel parcel : parcels) array.put(parcel.toSyncJson());
        JSONObject body = new JSONObject().put("parcels", array);
        JSONObject response = request(
            serverUrl,
            "/api/v1/parcels/sync",
            "POST",
            deviceToken,
            body
        );
        return response.optInt("accepted", 0);
    }

    private static JSONObject request(
        String serverUrl,
        String path,
        String method,
        String token,
        JSONObject body
    ) throws IOException, JSONException {
        String baseUrl = String.valueOf(serverUrl).trim().replaceAll("/+$", "");
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        connection.setDoOutput(true);

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 200 && statusCode < 300
            ? connection.getInputStream()
            : connection.getErrorStream();
        String responseBody = readAll(stream);
        JSONObject json = responseBody.isEmpty() ? new JSONObject() : new JSONObject(responseBody);
        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException(json.optString("error", "HTTP " + statusCode));
        }
        return json;
    }

    private static String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    public static final class PairingResult {
        public String deviceId;
        public String deviceToken;
        public String sessionToken;
    }
}

