package com.pbl6.flashcard.dto.extraction;

import com.pbl6.flashcard.model.ExtractionItem;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ExtractionItemResponse(UUID id, String kind, int position, String term, String surface,
                                     String reading, List<Map<String, String>> readingSegments, String hanViet,
                                     String pos, String meaningEn, String meaningVi, String level,
                                     Double levelConfidence, List<String> levelSources, int frequency,
                                     String example, String exampleVi, boolean selected) {

    public static ExtractionItemResponse of(ExtractionItem i) {
        return new ExtractionItemResponse(i.getId(), i.getKind(), i.getPosition(), i.getTerm(), i.getSurface(),
                i.getReading(), i.getReadingSegments(), i.getHanViet(), i.getPos(), i.getMeaningEn(),
                i.getMeaningVi(), i.getLevel(), i.getLevelConfidence(), i.getLevelSources(), i.getFrequency(),
                i.getExample(), i.getExampleVi(), i.isSelected());
    }
}
