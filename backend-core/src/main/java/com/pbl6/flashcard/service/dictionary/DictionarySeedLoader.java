package com.pbl6.flashcard.service.dictionary;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Nạp nghĩa tiếng Việt dịch sẵn (spec 2026-10-26 §4.3, §6.3) vào dict_meanings với status MACHINE / source SEED, để hàng chờ admin
 * thấy và người học có nghĩa Việt ngay. Hai file trong classpath dict/: jlpt_meaning_vi.csv (nạp trước, thắng khi trùng khoá) rồi
 * jmdict_common_meaning_vi.csv. Chỉ chèn dòng chưa có (ON CONFLICT DO NOTHING) nên KHÔNG BAO GIỜ đè bản admin đã sửa; đủ số dòng
 * seed thì bỏ qua cả lượt (khởi động lại không quét lại 37 nghìn dòng trên Supabase).
 * Tắt bằng app.dictionary.seed.enabled=false (test tích hợp nạp file nhỏ bằng {@link #load(List)}).
 */
@Component
public class DictionarySeedLoader {

    private static final Logger log = LoggerFactory.getLogger(DictionarySeedLoader.class);
    public static final List<String> DEFAULT_FILES = List.of("dict/jlpt_meaning_vi.csv", "dict/jmdict_common_meaning_vi.csv");
    private static final int BATCH = 1000;

    private final DictionaryStore store;
    private final boolean enabled;

    public DictionarySeedLoader(DictionaryStore store, @Value("${app.dictionary.seed.enabled:true}") boolean enabled) {
        this.store = store;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!enabled) return;
        CompletableFuture.runAsync(() -> {
            try {
                int n = load(DEFAULT_FILES.stream().map(f -> (Resource) new ClassPathResource(f)).toList());
                if (n > 0) log.info("Từ điển: đã nạp {} nghĩa tiếng Việt dịch sẵn", n);
            } catch (RuntimeException | IOException e) {
                log.warn("Từ điển: không nạp được nghĩa dịch sẵn: {}", e.getMessage());
            }
        });
    }

    /** Nạp các file theo thứ tự; trả số dòng mới chèn. Đủ khoá rồi (số dòng SEED ≥ số khoá trong file) → 0. */
    public int load(List<Resource> files) throws IOException {
        Map<String, String[]> rows = new java.util.LinkedHashMap<>();
        for (Resource r : files) {
            if (!r.exists()) continue;
            try (Reader reader = new BufferedReader(new InputStreamReader(r.getInputStream(), StandardCharsets.UTF_8))) {
                List<List<String>> table = parseCsv(reader);
                if (table.isEmpty()) continue;
                Map<String, Integer> col = new HashMap<>();
                List<String> header = table.get(0);
                for (int i = 0; i < header.size(); i++) col.put(header.get(i).strip().replace("﻿", ""), i);
                Integer key = col.get("entry_key");
                Integer vi = col.get("meaning_vi");
                if (key == null || vi == null) {
                    log.warn("Từ điển: {} thiếu cột entry_key / meaning_vi, bỏ qua", r.getFilename());
                    continue;
                }
                for (List<String> row : table.subList(1, table.size())) {
                    String k = get(row, key);
                    String m = get(row, vi);
                    if (k == null || m == null || DictionaryKeys.tryParse(k) == null || rows.containsKey(k)) continue;
                    rows.put(k, new String[]{k, get(row, col.get("expression")), get(row, col.get("reading")),
                            normLevel(get(row, col.get("level"))), m});
                }
            }
        }
        if (rows.isEmpty() || store.countSeed() >= rows.size()) return 0;
        int inserted = 0;
        List<String[]> batch = new ArrayList<>(BATCH);
        for (String[] r : rows.values()) {
            batch.add(r);
            if (batch.size() == BATCH) {
                inserted += store.insertSeed(batch);
                batch.clear();
            }
        }
        if (!batch.isEmpty()) inserted += store.insertSeed(batch);
        return inserted;
    }

    private static String normLevel(String s) {
        if (s == null) return null;
        Set<String> ok = new LinkedHashSet<>(List.of("N5", "N4", "N3", "N2", "N1"));
        return ok.contains(s.strip()) ? s.strip() : null;
    }

    private static String get(List<String> row, Integer i) {
        if (i == null || i >= row.size()) return null;
        String v = row.get(i).strip();
        return v.isEmpty() ? null : v;
    }

    /** CSV RFC 4180 tối giản: dấu phẩy, ngoặc kép bọc trường, "" là ngoặc kép, xuống dòng trong trường được bọc. */
    static List<List<String>> parseCsv(Reader in) throws IOException {
        List<List<String>> out = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        boolean any = false;
        int c;
        while ((c = in.read()) != -1) {
            char ch = (char) c;
            any = true;
            if (quoted) {
                if (ch == '"') {
                    in.mark(1);
                    int next = in.read();
                    if (next == '"') {
                        cell.append('"');
                    } else {
                        quoted = false;
                        if (next != -1) in.reset();
                    }
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r') {
                    in.mark(1);
                    if (in.read() != '\n') in.reset();
                }
                row.add(cell.toString());
                cell.setLength(0);
                out.add(row);
                row = new ArrayList<>();
                any = false;
            } else {
                cell.append(ch);
            }
        }
        if (any || cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            out.add(row);
        }
        return out;
    }
}
