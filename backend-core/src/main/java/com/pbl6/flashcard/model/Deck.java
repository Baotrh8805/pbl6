package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// id: slug cho bộ thẻ seed (R__seed_system_decks.sql), UUID cho bộ thẻ người dùng tạo (DeckService).
// visibility = 'public' -> nằm trong Thư viện cộng đồng, ai đăng nhập cũng xem/học được.
@Entity
@Table(name = "decks", indexes = {
        @Index(name = "idx_decks_folder", columnList = "folder_id")
})
public class Deck {

    public static final String PRIVATE = "private";
    public static final String PUBLIC = "public";

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String level;

    @Column(length = 1000)
    private String description;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(nullable = false, length = 10)
    private String visibility = PRIVATE;

    @Column(length = 20)
    private String category; // dokkai, goi, kanji, bunpou, kaiwa, it, business (CHECK ở DB)

    @Column(name = "is_official", nullable = false)
    private boolean official;

    @Column(name = "is_featured", nullable = false)
    private boolean featured;

    @Column(name = "source_deck_id")
    private String sourceDeckId; // nhân bản từ bộ thẻ nào (đếm lượt tải)

    /** V35 (rà soát 27/10): mốc tạo / cập nhật để sắp xếp "mới cập nhật" và lọc theo thời gian; thẻ đổi cũng gọi touch(). */
    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @org.hibernate.annotations.UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    /** Thẻ thêm / sửa / xoá không làm Hibernate coi bộ thẻ là "đã đổi" -> đặt tay mốc cập nhật. */
    public void touch() { this.updatedAt = Instant.now(); }

    @JsonIgnore // cắt vòng lặp Folder -> decks -> Folder khi serialize
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id", foreignKey = @ForeignKey(name = "fk_decks_folder"))
    private Folder folder; // null = chưa xếp vào thư mục nào

    @OneToMany(mappedBy = "deck", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<Flashcard> cards = new ArrayList<>();

    public Deck() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public boolean isPublic() { return PUBLIC.equals(visibility); }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public boolean isOfficial() { return official; }
    public boolean isFeatured() { return featured; }
    public void setOfficial(boolean official) { this.official = official; }
    public void setFeatured(boolean featured) { this.featured = featured; }

    public String getSourceDeckId() { return sourceDeckId; }
    public void setSourceDeckId(String sourceDeckId) { this.sourceDeckId = sourceDeckId; }

    public Folder getFolder() { return folder; }
    public void setFolder(Folder folder) { this.folder = folder; }

    @Transient
    @JsonProperty("folderId")
    public UUID getFolderId() {
        return folder != null ? folder.getId() : null;
    }

    public List<Flashcard> getCards() { return cards; }
    public void setCards(List<Flashcard> cards) { this.cards = cards; }
}
