package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Hàm thuần của xuất bộ thẻ (UC-29): ô CSV, escape HTML cho Anki, tên tệp. */
class DeckExportServiceTest {

    @Test
    void csv_cells_quote_escape_and_block_formulas() {
        assertEquals("", DeckExportService.cell(null));
        assertEquals("ăn", DeckExportService.cell("ăn"));
        assertEquals("\"a, b\"", DeckExportService.cell("a, b"));
        assertEquals("\"nói \"\"chào\"\"\"", DeckExportService.cell("nói \"chào\""));
        assertEquals("\"1\n2\"", DeckExportService.cell("1\n2"));
        assertEquals("'=1+1", DeckExportService.cell("=1+1"));
        assertEquals("'@cmd", DeckExportService.cell("@cmd"));
    }

    @Test
    void anki_html_escapes_and_keeps_columns() {
        assertEquals("a &lt;b&gt; &amp; c<br>d e", DeckExportService.html("a <b> & c\nd\te"));
    }

    @Test
    void slug_is_ascii() {
        assertEquals("bai-1-chao-hoi", DeckExportService.slug("Bài 1: Chào hỏi"));
        assertEquals("dong-tu-n5", DeckExportService.slug("Động từ N5"));
        assertEquals("bo-the", DeckExportService.slug("日本語"));
        assertEquals("bo-the", DeckExportService.slug(null));
    }
}
