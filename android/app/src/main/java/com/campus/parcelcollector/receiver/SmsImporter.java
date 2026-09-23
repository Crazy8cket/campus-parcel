package com.campus.parcelcollector.receiver;

import android.content.Context;
import android.database.Cursor;
import android.provider.Telephony;

import com.campus.parcelcollector.parser.ParcelParser;
import com.campus.parcelcollector.parser.ParsedParcel;
import com.campus.parcelcollector.sync.SyncCoordinator;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

public final class SmsImporter {
    private static final long SEVEN_DAYS_MS = 7L * 24 * 60 * 60 * 1000;

    private SmsImporter() {
    }

    public static int importRecent(Context context, int days) {
        long since = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000;
        List<ParsedParcel> results = new ArrayList<>();
        try (Cursor cursor = context.getContentResolver().query(
            Telephony.Sms.Inbox.CONTENT_URI,
            new String[]{
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            },
            Telephony.Sms.DATE + " >= ?",
            new String[]{String.valueOf(since)},
            Telephony.Sms.DATE + " DESC"
        )) {
            if (cursor == null) return 0;
            int addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY);
            int dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE);
            while (cursor.moveToNext()) {
                String sender = cursor.getString(addressIndex);
                String body = cursor.getString(bodyIndex);
                long date = cursor.getLong(dateIndex);
                String eventId = eventId(sender, date, body);
                results.addAll(ParcelParser.parse(body, "sms", sender, date, eventId));
                if (results.size() >= 500) break;
            }
        }
        if (results.isEmpty()) return 0;
        int changed = SyncCoordinator.record(context, results);
        SyncCoordinator.syncAsync(context, null);
        return changed;
    }

    private static String eventId(String sender, long timestamp, String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(
                (sender + "|" + timestamp + "|" + body).getBytes(StandardCharsets.UTF_8)
            );
            StringBuilder builder = new StringBuilder();
            for (int index = 0; index < 8; index++) {
                builder.append(String.format("%02x", hash[index]));
            }
            return builder.toString();
        } catch (Exception ignored) {
            return sender + "|" + timestamp;
        }
    }
}

