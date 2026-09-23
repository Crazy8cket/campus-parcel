package com.campus.parcelcollector.service;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.campus.parcelcollector.parser.ParcelParser;
import com.campus.parcelcollector.parser.ParsedParcel;
import com.campus.parcelcollector.sync.SyncCoordinator;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class ParcelNotificationListenerService extends NotificationListenerService {
    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.tencent.mm",
        "com.taobao.taobao",
        "com.jingdong.app.mall",
        "com.xunmeng.pinduoduo",
        "com.cainiao.wireless",
        "com.sf.activity",
        "com.yto.android",
        "com.zto.ztoapp",
        "com.yunda.app",
        "cn.com.chinapost.ems"
    ));

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        if (!ALLOWED_PACKAGES.contains(sbn.getPackageName())) return;

        Bundle extras = sbn.getNotification().extras;
        String title = value(extras, Notification.EXTRA_TITLE);
        String text = value(extras, Notification.EXTRA_TEXT);
        String bigText = value(extras, Notification.EXTRA_BIG_TEXT);
        String content = (title + "\n" + text + "\n" + bigText).trim();
        if (content.isEmpty()) return;

        String eventId = eventId(
            sbn.getPackageName(),
            sbn.getPostTime(),
            content
        );
        List<ParsedParcel> parcels = ParcelParser.parse(
            content,
            "notification",
            sbn.getPackageName(),
            sbn.getPostTime(),
            eventId
        );
        if (parcels.isEmpty()) return;
        SyncCoordinator.recordAndSync(this, parcels, null);
    }

    private static String value(Bundle extras, String key) {
        if (extras == null) return "";
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString();
    }

    private static String eventId(String packageName, long postTime, String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(
                (packageName + "|" + postTime + "|" + content)
                    .getBytes(StandardCharsets.UTF_8)
            );
            StringBuilder builder = new StringBuilder();
            for (int index = 0; index < 8; index++) {
                builder.append(String.format("%02x", hash[index]));
            }
            return builder.toString();
        } catch (Exception ignored) {
            return packageName + "|" + postTime;
        }
    }
}

