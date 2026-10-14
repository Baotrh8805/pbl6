package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Một từ vựng / mẫu ngữ pháp bóc tách được (V12). Người dùng duyệt, sửa, bỏ chọn trước khi tạo thẻ. */
@Entity
@Table(name = "extraction_items")
public class ExtractionItem {

    public static final String VOCAB = "vocab";
    public static final String GRAMMAR = "grammar";

    @Id
    private UUID id;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(nullable = false, length = 8)
    private String kind;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 200)
    private String term;

    @Column(length = 200)
    private String surface;

    @Column(length = 200)
    private String reading;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reading_segments", columnDefinition = "jsonb")
    private List<Map<String, String>> readingSegments;

    @Column(name = "han_viet", length = 100)
    private String hanViet;

    @Column(length = 40)
    private String pos;

    @Column(name = "meaning_en", length = 1000)
    private String meaningEn;

    @Column(name = "meaning_vi", length = 1000)
    private String meaningVi;

    @Column(length = 2)
    private String level;

    @Column(name = "level_confidence")
    private Double levelConfidence;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "level_sources", columnDefinition = "jsonb")
    private List<String> levelSources;

    @Column(nullable = false)
    private int frequency = 1;

    @Column(length = 500)
    private String example;

    @Column(name = "example_vi", length = 500)
    private String exampleVi;

    @Column(nullable = false)
    private boolean selected = true;

    public ExtractionItem() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getJobId() { return jobId; }
    public void setJobId(UUID jobId) { this.jobId = jobId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getTerm() { return term; }
    public void setTerm(String term) { this.term = term; }
    public String getSurface() { return surface; }
    public void setSurface(String surface) { this.surface = surface; }
    public String getReading() { return reading; }
    public void setReading(String reading) { this.reading = reading; }
    public List<Map<String, String>> getReadingSegments() { return readingSegments; }
    public void setReadingSegments(List<Map<String, String>> readingSegments) { this.readingSegments = readingSegments; }
    public String getHanViet() { return hanViet; }
    public void setHanViet(String hanViet) { this.hanViet = hanViet; }
    public String getPos() { return pos; }
    public void setPos(String pos) { this.pos = pos; }
    public String getMeaningEn() { return meaningEn; }
    public void setMeaningEn(String meaningEn) { this.meaningEn = meaningEn; }
    public String getMeaningVi() { return meaningVi; }
    public void setMeaningVi(String meaningVi) { this.meaningVi = meaningVi; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public Double getLevelConfidence() { return levelConfidence; }
    public void setLevelConfidence(Double levelConfidence) { this.levelConfidence = levelConfidence; }
    public List<String> getLevelSources() { return levelSources; }
    public void setLevelSources(List<String> levelSources) { this.levelSources = levelSources; }
    public int getFrequency() { return frequency; }
    public void setFrequency(int frequency) { this.frequency = frequency; }
    public String getExample() { return example; }
    public void setExample(String example) { this.example = example; }
    public String getExampleVi() { return exampleVi; }
    public void setExampleVi(String exampleVi) { this.exampleVi = exampleVi; }
    public boolean isSelected() { return selected; }
    public void setSelected(boolean selected) { this.selected = selected; }
}
