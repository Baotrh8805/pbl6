package com.pbl6.flashcard.dto.folder;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class FolderRequest {

    // Giới hạn khớp độ dài cột trong Folder.java: tràn cột phải là 400, không phải 500 từ DB.
    @NotBlank(message = "Title is required")
    @Size(max = 100, message = "Title must be at most 100 characters")
    private String title;

    @Size(max = 500, message = "Description must be at most 500 characters")
    private String description;

    @Pattern(regexp = "private|shared|public", message = "accessType must be private, shared or public")
    private String accessType; // private, shared, public

    @Pattern(regexp = "N[1-5]", message = "level must be N1..N5")
    private String level; // N1, N2, N3, N4, N5
    // Boolean: null = "không gửi" -> PUT giữ nguyên trạng thái ghim, không vô tình bỏ ghim.
    private Boolean isPinned;
    private String metadata; // JSON chuỗi từ Frontend
    private UUID parentId; // null = đặt ở gốc; PUT với parentId khác = move

    public FolderRequest() {
    }

    public FolderRequest(String title, String description, String accessType, String level, Boolean isPinned,
            String metadata) {
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

    // Tên JSON "isPinned" (không có @JsonProperty, Jackson đặt tên theo getter thành "pinned")
    @JsonProperty("isPinned")
    public Boolean getIsPinned() {
        return isPinned;
    }

    @JsonProperty("isPinned")
    public void setIsPinned(Boolean pinned) {
        isPinned = pinned;
    }

    public String getMetadata() {
        return metadata;
    }

    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }

    public UUID getParentId() {
        return parentId;
    }

    public void setParentId(UUID parentId) {
        this.parentId = parentId;
    }
}
