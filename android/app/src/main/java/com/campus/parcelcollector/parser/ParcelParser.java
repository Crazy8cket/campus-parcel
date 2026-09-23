package com.campus.parcelcollector.parser;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ParcelParser {
    private static final String CODE_PATTERN =
        "(?:[A-Za-z]{1,4}\\s*[-－—]?\\s*\\d{2,8}|\\d{1,4}(?:\\s*[-－—]\\s*\\d{1,6}){1,4}|\\d{4,8})";
    private static final String PICKUP_KEYWORDS =
        "取件验证码|取件码|取货码|提货码|提货号|自提码|驿站码|快件码|包裹码";
    private static final Pattern PICKUP_PATTERN = Pattern.compile(
        "(?i)(?:" + PICKUP_KEYWORDS + ")\\s*(?:为|是|[:：])?\\s*("
            + CODE_PATTERN + "(?:\\s*[,，、]\\s*" + CODE_PATTERN + ")*)"
    );
    private static final Pattern ORDER_PATTERN = Pattern.compile(
        "(?:订单号|订单编号|订单)\\s*(?:为|是|[:：])?\\s*([A-Za-z0-9][A-Za-z0-9-]{7,})",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern TRACKING_PATTERN = Pattern.compile(
        "(?:运单号|快递单号|物流单号|(?<!订)单号)\\s*(?:为|是|[:：])?\\s*([A-Za-z]{0,4}\\d[A-Za-z0-9-]{7,})",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern ARRIVAL_PATTERN =
        Pattern.compile("到达|到件|派送|取件|驿站|快递柜");
    private static final Pattern DASH_PATTERN = Pattern.compile("[－—–]");
    private static final Pattern SPACE_PATTERN = Pattern.compile("[ \\t]+");

    private static final String[] LOGISTICS_SIGNALS = {
        "快递", "包裹", "取件", "取货", "提货", "驿站", "快递柜",
        "丰巢", "菜鸟", "兔喜", "物流", "到件", "派件", "签收"
    };
    private static final String[] NOISE_SIGNALS = {
        "验证码", "校验码", "动态码", "登录密码", "支付密码",
        "银行", "余额", "转账", "消费", "积分兑换"
    };
    private static final String[][] COURIERS = {
        {"顺丰速运", "顺丰|SF Express|SF\\d"},
        {"京东物流", "京东物流|京东快递|京东"},
        {"中通快递", "中通"},
        {"圆通速递", "圆通"},
        {"韵达快递", "韵达"},
        {"申通快递", "申通"},
        {"极兔速递", "极兔|JT"},
        {"邮政EMS", "邮政|EMS|中国邮政"},
        {"德邦快递", "德邦"},
        {"菜鸟驿站", "菜鸟"},
        {"丰巢", "丰巢"},
        {"兔喜生活", "兔喜"}
    };
    private static final Pattern[] STATION_PATTERNS = {
        Pattern.compile("(?:已到达|已到|到达|送至|已存放至|已放入|请到|放至|位于)\\s*([^，。；;\\n]{2,48}?(?:菜鸟驿站|快递驿站|驿站|快递柜|丰巢柜|服务点|代收点|快递点|服务中心|校园中心|超市|便利店|门店|小区|学院|大学|号柜))"),
        Pattern.compile("([\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-]{2,48}?(?:菜鸟驿站|快递驿站|驿站|快递柜|丰巢柜|服务点|代收点|快递点|服务中心|校园中心|超市|便利店))"),
        Pattern.compile("([0-9A-Za-z一二三四五六七八九十]+号(?:柜|快递柜|丰巢柜))")
    };

    private ParcelParser() {
    }

    public static List<ParsedParcel> parse(
        String input,
        String source,
        String sender,
        long occurredAt,
        String eventId
    ) {
        String text = normalizeText(input);
        List<ParsedParcel> empty = new ArrayList<>();
        if (text.isEmpty() || shouldIgnore(text)) return empty;

        List<String> pickupCodes = extractPickupCodes(text);
        String station = extractStation(text);
        String orderNumber = extractMatch(ORDER_PATTERN, text);
        String trackingNumber = extractMatch(TRACKING_PATTERN, text);
        String courier = detectCourier(text, station);

        if (pickupCodes.isEmpty() && orderNumber.isEmpty() && trackingNumber.isEmpty()) {
            return empty;
        }
        if (pickupCodes.isEmpty() && !ARRIVAL_PATTERN.matcher(text).find()) {
            return empty;
        }

        if (pickupCodes.isEmpty()) pickupCodes.add("");
        List<String> codes = pickupCodes;
        for (String pickupCode : codes) {
            ParsedParcel parcel = new ParsedParcel();
            parcel.source = source == null ? "manual" : source;
            parcel.sender = sender == null ? "" : sender;
            parcel.pickupCode = pickupCode;
            parcel.station = station;
            parcel.courier = courier;
            parcel.trackingNumber = trackingNumber;
            parcel.orderNumber = orderNumber;
            parcel.rawText = text;
            parcel.confidence = pickupCode.isEmpty() ? 0.65 : 0.95;
            parcel.occurredAt = occurredAt > 0 ? occurredAt : System.currentTimeMillis();
            parcel.dedupeHint = joinKey(
                eventId,
                pickupCode,
                trackingNumber,
                orderNumber,
                station
            );
            empty.add(parcel);
        }
        return empty;
    }

    private static String normalizeText(String value) {
        if (value == null) return "";
        String text = value.replace("\r\n", "\n").replace('\r', '\n');
        text = SPACE_PATTERN.matcher(text).replaceAll(" ");
        text = DASH_PATTERN.matcher(text).replaceAll("-");
        return text.trim();
    }

    private static String normalizeCode(String value) {
        return normalizeText(value)
            .replaceAll("\\s+", "")
            .replaceAll("[，,、；;。]+$", "")
            .toUpperCase(Locale.ROOT);
    }

    private static boolean isValidPickupCode(String value) {
        String code = normalizeCode(value);
        if (code.length() < 2 || code.length() > 24) return false;
        if (!code.matches("[A-Z0-9-]+")) return false;
        if (code.matches("\\d{4}")) {
            int year = Integer.parseInt(code.substring(0, 2));
            return year < 19 || year > 30;
        }
        return true;
    }

    private static List<String> extractPickupCodes(String text) {
        Matcher matcher = PICKUP_PATTERN.matcher(text);
        Set<String> results = new LinkedHashSet<>();
        if (!matcher.find()) return new ArrayList<>();
        for (String token : matcher.group(1).split("[,，、]")) {
            String code = normalizeCode(token);
            if (isValidPickupCode(code)) results.add(code);
        }
        return new ArrayList<>(results);
    }

    private static String extractStation(String text) {
        for (Pattern pattern : STATION_PATTERNS) {
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                String station = cleanStation(matcher.group(1));
                if (!station.isEmpty()) return station;
            }
        }
        return "";
    }

    private static String cleanStation(String value) {
        if (value == null) return "";
        String station = value
            .replaceAll("^[\\s:：,，。；;、-]+", "")
            .replaceAll("^(请|凭|到|在|至|已到|已到达|已放入|已存放至|放至)+", "")
            .replaceAll("[\\s:：,，。；;、]+$", "")
            .replaceAll("^\\[[^\\]]+\\]", "")
            .trim();
        if (station.length() > 40) station = station.substring(0, 40);
        if (station.matches("^(取件|取货|提货|凭取件).*")) return "";
        return station;
    }

    private static String extractMatch(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? normalizeCode(matcher.group(1)) : "";
    }

    private static String detectCourier(String text, String station) {
        String haystack = text + "\n" + station;
        for (String[] courier : COURIERS) {
            if (Pattern.compile(courier[1], Pattern.CASE_INSENSITIVE)
                .matcher(haystack)
                .find()) {
                return courier[0];
            }
        }
        return "其他快递";
    }

    private static boolean hasLogisticsSignal(String text) {
        for (String signal : LOGISTICS_SIGNALS) {
            if (text.contains(signal)) return true;
        }
        return false;
    }

    private static boolean shouldIgnore(String text) {
        if (!hasLogisticsSignal(text)) return true;
        int noiseCount = 0;
        for (String signal : NOISE_SIGNALS) {
            if (text.contains(signal)) noiseCount++;
        }
        return noiseCount >= 2;
    }

    private static String joinKey(String... parts) {
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part == null) part = "";
            builder.append(part).append('|');
        }
        return builder.toString();
    }
}
