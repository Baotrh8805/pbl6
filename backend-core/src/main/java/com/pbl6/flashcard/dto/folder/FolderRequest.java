package com.pbl6.flashcard.dto.folder;

import jakarta.validation.constraints.NotBlank;

public class FolderRequest {

    @NotBlank(message = "Title is required")
    private String title;

    private String description;
    private String accessType; // private, shared, public
    private String level; // N1, N2, N3, N4, N5
    private boolean isPinned;
    private String metadata; // JSON chuỗi từ Frontend

    public FolderRequest() {
    }

    public FolderRequest(String title, String description, String accessType, String level, boolean isPinned, String metadata) {
        this.title = title;
        this.description = description;
        this.accessType = accessType;
        this.level = level;
        this.isPinned = isPinned;
        this.metadata = metadata;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getAccessType() {
        return accessType;
    }

    public void setAccessType(String accessType) {
        this.accessType = accessType;
    }

    public String getLevel() {
        return level;
    }

    public void setLevel(String level) {
        this.level = level;
    }

    public boolean isPinned() {
        return isPinned;
    }

    public void setPinned(boolean pinned) {
        isPinned = pinned;
    }

    public String getMetadata() {
        return metadata;
    }

    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }
}
