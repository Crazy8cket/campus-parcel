package com.campus.parcelcollector.data;

import com.campus.parcelcollector.parser.ParsedParcel;

import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;

public final class LocalParcel {
    public String id = "";
    public String source = "manual";
    public String sender = "";
    public String pickupCode = "";
    public String station = "";
    public String courier = "其他快递";
    public String trackingNumber = "";
    public String orderNumber = "";
    public String rawText = "";
    public String dedupeHint = "";
    public double confidence = 0;
    public long occurredAt = 0;
    public String status = "pending";
    public boolean synced = false;
    public long createdAt = 0;

    public static LocalParcel fromParsed(ParsedParcel parsed) {
        LocalParcel local = new LocalParcel();
        local.id = UUID.randomUUID().toString();
        local.source = parsed.source;
        local.sender = parsed.sender;
        local.pickupCode = parsed.pickupCode;
        local.station = parsed.station;
        local.courier = parsed.courier;
        local.trackingNumber = parsed.trackingNumber;
        local.orderNumber = parsed.orderNumber;
        local.rawText = parsed.rawText;
        local.dedupeHint = parsed.dedupeHint;
        local.confidence = parsed.confidence;
        local.occurredAt = parsed.occurredAt;
        local.createdAt = System.currentTimeMillis();
        return local;
    }

    public static LocalParcel fromJson(JSONObject json) {
        LocalParcel parcel = new LocalParcel();
        parcel.id = json.optString("id");
        parcel.source = json.optString("source", "manual");
        parcel.sender = json.optString("sender");
        parcel.pickupCode = json.optString("pickupCode");
        parcel.station = json.optString("station");
        parcel.courier = json.optString("courier", "其他快递");
        parcel.trackingNumber = json.optString("trackingNumber");
        parcel.orderNumber = json.optString("orderNumber");
        parcel.rawText = json.optString("rawText");
        parcel.dedupeHint = json.optString("dedupeHint");
        parcel.confidence = json.optDouble("confidence", 0);
        parcel.occurredAt = json.optLong("occurredAt");
        parcel.status = json.optString("status", "pending");
        parcel.synced = json.optBoolean("synced", false);
        parcel.createdAt = json.optLong("createdAt");
        return parcel;
    }

    public JSONObject toJson() throws JSONException {
        return new JSONObject()
            .put("id", id)
            .put("source", source)
            .put("sender", sender)
            .put("pickupCode", pickupCode)
            .put("station", station)
            .put("courier", courier)
            .put("trackingNumber", trackingNumber)
            .put("orderNumber", orderNumber)
            .put("rawText", rawText)
            .put("dedupeHint", dedupeHint)
            .put("confidence", confidence)
            .put("occurredAt", occurredAt)
            .put("status", status)
            .put("synced", synced)
            .put("createdAt", createdAt);
    }

    public JSONObject toSyncJson() throws JSONException {
        return new JSONObject()
            .put("source", source)
            .put("sender", sender)
            .put("pickupCode", pickupCode)
            .put("station", station)
            .put("courier", courier)
            .put("trackingNumber", trackingNumber)
            .put("orderNumber", orderNumber)
            .put("rawText", rawText)
            .put("dedupeHint", dedupeHint)
            .put("confidence", confidence)
            .put("occurredAt", Instant.ofEpochMilli(occurredAt).toString());
    }
}

