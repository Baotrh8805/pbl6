package com.pbl6.flashcard.dto.folder;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
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
    private UUID parentId;
    private List<FolderResponse> children = new ArrayList<>();
    /** Quyền của người gọi: owner | viewer (được chia sẻ hoặc public). */
    private String access = OWNER;
    /** Tên chủ thư mục, chỉ có khi người gọi không phải chủ. */
    private String ownerName;

    public static final String OWNER = "owner";
    public static final String VIEWER = "viewer";

    public FolderResponse() {
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
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

    @JsonProperty("isPinned")
    public boolean isPinned() {
        return isPinned;
    }

    public void setPinned(boolean isPinned) {
        this.isPinned = isPinned;
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

    public List<FolderResponse> getChildren() {
        return children;
    }

    public void setChildren(List<FolderResponse> children) {
        this.children = children;
    }

    public String getAccess() {
        return access;
    }

    public void setAccess(String access) {
        this.access = access;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }
}
