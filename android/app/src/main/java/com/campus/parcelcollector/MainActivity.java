package com.campus.parcelcollector;

import android.Manifest;
import android.app.Activity;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.campus.parcelcollector.data.LocalParcel;
import com.campus.parcelcollector.data.ParcelStore;
import com.campus.parcelcollector.network.SyncClient;
import com.campus.parcelcollector.parser.ParcelParser;
import com.campus.parcelcollector.parser.ParsedParcel;
import com.campus.parcelcollector.receiver.SmsImporter;
import com.campus.parcelcollector.sync.CollectorPreferences;
import com.campus.parcelcollector.sync.SyncCoordinator;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int SMS_PERMISSION_REQUEST = 1001;
    private static final ExecutorService UI_WORKER = Executors.newSingleThreadExecutor();

    private EditText serverInput;
    private EditText pairInput;
    private TextView statusText;
    private LinearLayout parcelList;
    private Button pairButton;
    private Button permissionButton;
    private Button importButton;
    private Button syncButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        serverInput = findViewById(R.id.serverInput);
        pairInput = findViewById(R.id.pairInput);
        statusText = findViewById(R.id.statusText);
        parcelList = findViewById(R.id.parcelList);
        pairButton = findViewById(R.id.pairButton);
        permissionButton = findViewById(R.id.permissionButton);
        importButton = findViewById(R.id.importButton);
        syncButton = findViewById(R.id.syncButton);

        serverInput.setText(CollectorPreferences.serverUrl(this));
        pairButton.setOnClickListener(this::pairDevice);
        permissionButton.setOnClickListener(this::requestSmsPermissions);
        findViewById(R.id.notificationAccessButton).setOnClickListener(this::openNotificationAccess);
        importButton.setOnClickListener(this::importRecentSms);
        findViewById(R.id.manualImportButton).setOnClickListener(this::importClipboard);
        syncButton.setOnClickListener(this::syncNow);
        refreshUi();
        SyncCoordinator.syncAsync(this, null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshUi();
    }

    private void pairDevice(View unused) {
        String serverUrl = normalizeServerUrl(serverInput.getText().toString());
        String code = pairInput.getText().toString().trim();
        if (TextUtils.isEmpty(serverUrl) || !serverUrl.matches("https?://.+")) {
            toast("请填写完整的同步服务地址");
            return;
        }
        if (!code.matches("\\d{6}")) {
            toast("请输入小程序显示的 6 位配对码");
            return;
        }

        CollectorPreferences.setServerUrl(this, serverUrl);
        pairButton.setEnabled(false);
        UI_WORKER.execute(() -> {
            try {
                SyncClient.PairingResult result = SyncClient.claimPairing(
                    serverUrl,
                    code,
                    Build.MANUFACTURER + " " + Build.MODEL
                );
                CollectorPreferences.savePairing(
                    this,
                    result.deviceToken,
                    Build.MANUFACTURER + " " + Build.MODEL
                );
                runOnUiThread(() -> {
                    pairButton.setEnabled(true);
                    pairInput.setText("");
                    toast("连接成功");
                    refreshUi();
                    SyncCoordinator.syncAsync(this, null);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    pairButton.setEnabled(true);
                    toast(error.getMessage() == null ? "连接失败" : error.getMessage());
                });
            }
        });
    }

    private void requestSmsPermissions(View unused) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{
                Manifest.permission.READ_SMS,
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.POST_NOTIFICATIONS
            }, SMS_PERMISSION_REQUEST);
        } else {
            requestPermissions(new String[]{
                Manifest.permission.READ_SMS,
                Manifest.permission.RECEIVE_SMS
            }, SMS_PERMISSION_REQUEST);
        }
    }

    private void openNotificationAccess(View unused) {
        startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    private void importRecentSms(View unused) {
        if (checkSelfPermission(Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            toast("请先授权读取短信权限");
            return;
        }
        importButton.setEnabled(false);
        importButton.setText("正在导入...");
        UI_WORKER.execute(() -> {
            int count;
            try {
                count = SmsImporter.importRecent(this, 7);
            } catch (Exception error) {
                count = -1;
            }
            int finalCount = count;
            runOnUiThread(() -> {
                importButton.setEnabled(true);
                importButton.setText("导入最近 7 天快递短信");
                toast(finalCount < 0 ? "导入失败" : "新增 " + finalCount + " 条识别记录");
                refreshUi();
            });
        });
    }

    private void syncNow(View unused) {
        syncButton.setEnabled(false);
        syncButton.setText("同步中...");
        SyncCoordinator.syncAsync(this, (count, error) -> runOnUiThread(() -> {
            syncButton.setEnabled(true);
            syncButton.setText("立即同步");
            toast(error == null ? "已同步 " + count + " 条" : error.getMessage());
            refreshUi();
        }));
    }

    private void importClipboard(View unused) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()
            || clipboard.getPrimaryClip() == null
            || clipboard.getPrimaryClip().getItemCount() == 0) {
            toast("剪贴板中没有文本");
            return;
        }
        String text = clipboard.getPrimaryClip()
            .getItemAt(0)
            .coerceToText(this)
            .toString()
            .trim();
        if (text.isEmpty()) {
            toast("剪贴板中没有文本");
            return;
        }

        String eventId = "manual|" + Integer.toHexString(text.hashCode());
        List<ParsedParcel> parcels = ParcelParser.parse(
            text,
            "manual",
            "",
            System.currentTimeMillis(),
            eventId
        );
        if (parcels.isEmpty()) {
            toast("没有识别到取件码、订单号或运单号");
            return;
        }
        int changed = ParcelStore.upsert(this, parcels);
        SyncCoordinator.syncAsync(this, null);
        refreshUi();
        toast(changed > 0 ? "已识别 " + changed + " 条" : "内容已经存在");
    }

    private void refreshUi() {
        String token = CollectorPreferences.deviceToken(this);
        List<LocalParcel> items = ParcelStore.list(this);
        int pendingSync = 0;
        for (LocalParcel item : items) {
            if (!item.synced) pendingSync++;
        }

        String connection = token.isEmpty()
            ? "未连接"
            : "已连接 · " + CollectorPreferences.deviceName(this);
        statusText.setText(
            connection
                + "\n本机识别 " + items.size() + " 条"
                + " · 待同步 " + pendingSync + " 条"
                + "\n最近 7 天短信导入需要读取短信权限"
        );
        renderParcels(items);
    }

    private void renderParcels(List<LocalParcel> items) {
        parcelList.removeAllViews();
        if (items.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("暂无识别记录");
            empty.setTextColor(Color.parseColor("#65736A"));
            empty.setTextSize(14);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, dp(28), 0, dp(28));
            parcelList.addView(empty);
            return;
        }

        int count = Math.min(items.size(), 20);
        SimpleDateFormat format = new SimpleDateFormat("MM-dd HH:mm", Locale.CHINA);
        for (int index = 0; index < count; index++) {
            LocalParcel item = items.get(index);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setPadding(dp(14), dp(13), dp(14), dp(13));
            row.setBackgroundColor(Color.WHITE);
            row.setTag(index);

            TextView code = new TextView(this);
            code.setText(item.pickupCode.isEmpty() ? "待出码" : item.pickupCode);
            code.setTextColor(item.pickupCode.isEmpty()
                ? Color.parseColor("#95520E")
                : Color.parseColor("#17211B"));
            code.setTextSize(item.pickupCode.isEmpty() ? 20 : 24);
            code.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            row.addView(code);

            TextView meta = new TextView(this);
            meta.setText(
                item.station.isEmpty() ? "驿站待识别" : item.station
            );
            meta.setTextColor(Color.parseColor("#44564C"));
            meta.setTextSize(14);
            meta.setPadding(0, dp(4), 0, 0);
            row.addView(meta);

            TextView footer = new TextView(this);
            footer.setText(
                item.courier
                    + " · " + format.format(new Date(item.occurredAt))
                    + (item.synced ? " · 已同步" : " · 待同步")
            );
            footer.setTextColor(Color.parseColor("#718078"));
            footer.setTextSize(12);
            footer.setPadding(0, dp(4), 0, 0);
            row.addView(footer);

            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.setMargins(0, 0, 0, dp(8));
            parcelList.addView(row, params);
        }
    }

    private String normalizeServerUrl(String value) {
        return value.trim().replaceAll("/+$", "");
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
