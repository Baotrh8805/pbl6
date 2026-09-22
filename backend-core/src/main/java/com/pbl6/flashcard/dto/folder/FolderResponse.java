package com.pbl6.flashcard.dto.folder;

import java.util.UUID;
import java.util.List;

public class FolderResponse {

    private UUID id;
    private String title;
    private String description;
    private String accessType;
    private String level;
    private boolean isPinned;
    private String metadata;

    public FolderResponse() {
    }

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getAccessType() { return accessType; }
    public void setAccessType(String accessType) { this.accessType = accessType; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public boolean isPinned() { return isPinned; }
    public void setPinned(boolean isPinned) { this.isPinned = isPinned; }

    public String getMetadata() { return metadata; }
    public void setMetadata(String metadata) { this.metadata = metadata; }
}
