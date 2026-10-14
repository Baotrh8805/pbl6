package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.Map;

@Entity
@Table(name = "flashcards")
public class Flashcard {

    @Id
    private String id;

    @JsonIgnore // cắt vòng lặp Deck -> cards -> Deck khi serialize
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deck_id", nullable = false)
    private Deck deck;

    @Column(nullable = false)
    private String term;

    private String reading;

    /** Nội dung nhiều dòng: dòng đầu = định nghĩa chính, các dòng sau = định nghĩa phụ / ví dụ / ghi chú. */
    @Column(nullable = false, columnDefinition = "text")
    private String meaning;

    private Integer position;

    // Metadata do bóc tách AI sinh ra (V12). Thẻ tạo tay: level/segments/hanViet null, kind = vocab.
    @Column(length = 2)
    private String level;

    @Column(nullable = false, length = 8)
    private String kind = KIND_VOCAB;

    /** [{kanji, kana}] từng đoạn để hiện furigana theo chữ; null = chỉ có cách đọc cả từ. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reading_segments", columnDefinition = "jsonb")
    private List<Map<String, String>> readingSegments;

    @Column(name = "han_viet", length = 100)
    private String hanViet;

    public static final String KIND_VOCAB = "vocab";
    public static final String KIND_GRAMMAR = "grammar";

    public Flashcard() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Deck getDeck() { return deck; }
    public void setDeck(Deck deck) { this.deck = deck; }

    public String getTerm() { return term; }
    public void setTerm(String term) { this.term = term; }

    public String getReading() { return reading; }
    public void setReading(String reading) { this.reading = reading; }

    public String getMeaning() { return meaning; }
    public void setMeaning(String meaning) { this.meaning = meaning; }

    public Integer getPosition() { return position; }
    public void setPosition(Integer position) { this.position = position; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind != null ? kind : KIND_VOCAB; }

    public List<Map<String, String>> getReadingSegments() { return readingSegments; }
    public void setReadingSegments(List<Map<String, String>> readingSegments) { this.readingSegments = readingSegments; }

    public String getHanViet() { return hanViet; }
    public void setHanViet(String hanViet) { this.hanViet = hanViet; }
}
