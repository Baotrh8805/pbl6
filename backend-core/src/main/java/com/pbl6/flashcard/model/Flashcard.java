package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

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
}
