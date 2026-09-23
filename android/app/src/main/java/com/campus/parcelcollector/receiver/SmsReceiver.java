package com.campus.parcelcollector.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import com.campus.parcelcollector.parser.ParcelParser;
import com.campus.parcelcollector.parser.ParsedParcel;
import com.campus.parcelcollector.sync.SyncCoordinator;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

public final class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String sender = "";
        long timestamp = 0;
        for (SmsMessage message : messages) {
            if (message == null) continue;
            body.append(message.getMessageBody());
            if (sender.isEmpty()) sender = message.getOriginatingAddress();
            timestamp = Math.max(timestamp, message.getTimestampMillis());
        }

        String eventId = eventId(sender, timestamp, body.toString());
        List<ParsedParcel> parcels = ParcelParser.parse(
            body.toString(),
            "sms",
            sender,
            timestamp,
            eventId
        );
        if (parcels.isEmpty()) return;

        PendingResult pendingResult = goAsync();
        SyncCoordinator.recordAndSync(context, parcels, (count, error) -> pendingResult.finish());
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

