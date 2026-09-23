package com.campus.parcelcollector.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.campus.parcelcollector.parser.ParsedParcel;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class ParcelStore {
    private static final String PREFS = "parcel_collector_store";
    private static final String KEY_ITEMS = "items";
    private static final int MAX_ITEMS = 1000;

    private ParcelStore() {
    }

    public static synchronized int upsert(Context context, List<ParsedParcel> parsedItems) {
        List<LocalParcel> items = read(context);
        int changed = 0;
        for (ParsedParcel parsed : parsedItems) {
            LocalParcel existing = findExisting(items, parsed);
            if (existing == null) {
                items.add(LocalParcel.fromParsed(parsed));
                changed++;
                continue;
            }
            if (!parsed.pickupCode.isEmpty() && !parsed.pickupCode.equals(existing.pickupCode)) {
                existing.pickupCode = parsed.pickupCode;
                existing.station = parsed.station;
                existing.courier = parsed.courier;
                existing.rawText = parsed.rawText;
                existing.confidence = parsed.confidence;
                existing.synced = false;
                changed++;
            }
        }
        if (items.size() > MAX_ITEMS) {
            items.sort(Comparator.comparingLong((LocalParcel parcel) -> parcel.occurredAt).reversed());
            items = new ArrayList<>(items.subList(0, MAX_ITEMS));
        }
        write(context, items);
        return changed;
    }

    public static synchronized List<LocalParcel> list(Context context) {
        List<LocalParcel> items = read(context);
        items.sort(Comparator.comparingLong((LocalParcel parcel) -> parcel.occurredAt).reversed());
        return items;
    }

    public static synchronized List<LocalParcel> pendingSync(Context context) {
        List<LocalParcel> pending = new ArrayList<>();
        for (LocalParcel parcel : read(context)) {
            if (!parcel.synced) pending.add(parcel);
        }
        return pending;
    }

    public static synchronized void markSynced(Context context, List<String> ids) {
        Set<String> idSet = new HashSet<>(ids);
        List<LocalParcel> items = read(context);
        for (LocalParcel item : items) {
            if (idSet.contains(item.id)) item.synced = true;
        }
        write(context, items);
    }

    public static synchronized int updateStatus(Context context, String parcelId, String status) {
        List<LocalParcel> items = read(context);
        int changed = 0;
        for (LocalParcel item : items) {
            if (item.id.equals(parcelId)) {
                item.status = status;
                item.synced = false;
                changed++;
            }
        }
        write(context, items);
        return changed;
    }

    public static synchronized void clear(Context context) {
        preferences(context).edit().remove(KEY_ITEMS).apply();
    }

    private static LocalParcel findExisting(List<LocalParcel> items, ParsedParcel parsed) {
        for (LocalParcel item : items) {
            if (!parsed.dedupeHint.isEmpty() && parsed.dedupeHint.equals(item.dedupeHint)) {
                return item;
            }
        }
        if (!parsed.pickupCode.isEmpty()) return null;
        for (LocalParcel item : items) {
            if (item.pickupCode.isEmpty()
                && !parsed.orderNumber.isEmpty()
                && parsed.orderNumber.equals(item.orderNumber)
                && parsed.station.equals(item.station)) {
                return item;
            }
            if (item.pickupCode.isEmpty()
                && !parsed.trackingNumber.isEmpty()
                && parsed.trackingNumber.equals(item.trackingNumber)) {
                return item;
            }
        }
        return null;
    }

    private static List<LocalParcel> read(Context context) {
        String raw = preferences(context).getString(KEY_ITEMS, "[]");
        List<LocalParcel> items = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                JSONObject json = array.optJSONObject(index);
                if (json != null) items.add(LocalParcel.fromJson(json));
            }
        } catch (JSONException ignored) {
            return new ArrayList<>();
        }
        return items;
    }

    private static void write(Context context, List<LocalParcel> items) {
        JSONArray array = new JSONArray();
        for (LocalParcel item : items) {
            try {
                array.put(item.toJson());
            } catch (JSONException ignored) {
                // Skip an invalid item instead of corrupting the whole local queue.
            }
        }
        preferences(context).edit().putString(KEY_ITEMS, array.toString()).apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}

