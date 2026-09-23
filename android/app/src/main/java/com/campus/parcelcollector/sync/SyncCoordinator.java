package com.campus.parcelcollector.sync;

import android.content.Context;

import com.campus.parcelcollector.data.LocalParcel;
import com.campus.parcelcollector.data.ParcelStore;
import com.campus.parcelcollector.network.SyncClient;
import com.campus.parcelcollector.parser.ParsedParcel;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SyncCoordinator {
    public interface Callback {
        void onComplete(int syncedCount, Exception error);
    }

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private SyncCoordinator() {
    }

    public static int record(Context context, List<ParsedParcel> parcels) {
        return ParcelStore.upsert(context, parcels);
    }

    public static void recordAndSync(
        Context context,
        List<ParsedParcel> parcels,
        Callback callback
    ) {
        record(context, parcels);
        syncAsync(context, callback);
    }

    public static void syncAsync(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            Exception error = null;
            int synced = 0;
            try {
                String serverUrl = CollectorPreferences.serverUrl(appContext);
                String token = CollectorPreferences.deviceToken(appContext);
                List<LocalParcel> pending = ParcelStore.pendingSync(appContext);
                if (!serverUrl.isEmpty() && !token.isEmpty() && !pending.isEmpty()) {
                    synced = SyncClient.sync(serverUrl, token, pending);
                    List<String> ids = new ArrayList<>();
                    for (LocalParcel parcel : pending) ids.add(parcel.id);
                    ParcelStore.markSynced(appContext, ids);
                }
            } catch (Exception exception) {
                error = exception;
            }
            if (callback != null) callback.onComplete(synced, error);
        });
    }
}

