import com.campus.parcelcollector.parser.ParcelParser;
import com.campus.parcelcollector.parser.ParsedParcel;

import java.util.List;

public final class ParcelParserSmoke {
    public static void main(String[] args) {
        check("菜鸟", "【菜鸟驿站】您的包裹已到幸福路菜鸟驿站，取件码 1-2-3456，请及时取件。", "1-2-3456", "幸福路菜鸟驿站");
        check("丰巢", "【丰巢】您的包裹已放入东区3号柜，请凭取件码 483920 到柜机取件。", "483920", "东区3号柜");
        checkMulti();
        checkPending();
        checkNoise();
        System.out.println("ParcelParser smoke tests passed");
    }

    private static void check(String name, String text, String code, String station) {
        List<ParsedParcel> parcels = ParcelParser.parse(text, "sms", "test", 1L, name);
        require(parcels.size() == 1, name + ": size");
        require(code.equals(parcels.get(0).pickupCode), name + ": code");
        require(station.equals(parcels.get(0).station), name + ": station");
    }

    private static void checkMulti() {
        List<ParsedParcel> parcels = ParcelParser.parse(
            "【兔喜生活】取件码为 16-4-9626, 15-3-2194，请到南区兔喜驿站取件。",
            "sms",
            "test",
            1L,
            "multi"
        );
        require(parcels.size() == 2, "multi: size");
        require("16-4-9626".equals(parcels.get(0).pickupCode), "multi: first");
        require("15-3-2194".equals(parcels.get(1).pickupCode), "multi: second");
    }

    private static void checkPending() {
        List<ParsedParcel> parcels = ParcelParser.parse(
            "【京东物流】您的订单号 200012345678 已到达东区校园服务中心，正在安排上架。",
            "sms",
            "test",
            1L,
            "pending"
        );
        require(parcels.size() == 1, "pending: size");
        require(parcels.get(0).pickupCode.isEmpty(), "pending: no code");
        require("200012345678".equals(parcels.get(0).orderNumber), "pending: order");
        require("东区校园服务中心".equals(parcels.get(0).station), "pending: station");
    }

    private static void checkNoise() {
        List<ParsedParcel> parcels = ParcelParser.parse(
            "【银行】您的支付验证码是 839201，请勿告诉他人。",
            "sms",
            "test",
            1L,
            "noise"
        );
        require(parcels.isEmpty(), "noise: ignored");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}

