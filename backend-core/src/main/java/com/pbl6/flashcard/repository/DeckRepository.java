package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Deck;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DeckRepository extends JpaRepository<Deck, String> {
    // Bộ thẻ của user + bộ thẻ public (Thư viện) + bộ thẻ được chia sẻ.
    // EntityGraph: lấy luôn thẻ trong cùng query, tránh N+1 (1 query thẻ cho mỗi deck).
    @EntityGraph(attributePaths = "cards")
    @Query("SELECT DISTINCT d FROM Deck d WHERE d.ownerId = :uid OR d.visibility = 'public' "
            + "OR EXISTS (SELECT 1 FROM DeckShare s WHERE s.deckId = d.id AND s.userId = :uid) ORDER BY d.title ASC")
    List<Deck> findReadableWithCards(@Param("uid") Long uid);

    @EntityGraph(attributePaths = "cards")
    @Query("SELECT DISTINCT d FROM Deck d WHERE d.folder.id = :folderId AND (d.ownerId = :uid OR d.visibility = 'public' "
            + "OR EXISTS (SELECT 1 FROM DeckShare s WHERE s.deckId = d.id AND s.userId = :uid)) ORDER BY d.title ASC")
    List<Deck> findReadableInFolderWithCards(@Param("folderId") UUID folderId, @Param("uid") Long uid);

    /** Khoá dòng deck khi ghi: 2 request thêm thẻ song song không lấy trùng position. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Deck d WHERE d.id = :id")
    Optional<Deck> findByIdForUpdate(@Param("id") String id);

    long countByVisibility(String visibility);

    /** Một dòng Thư viện: số liệu tính từ dữ liệu thật. */
    interface LibraryRow {
        String getId();
        String getTitle();
        String getLevel();
        String getDescription();
        String getCategory();
        Boolean getOfficial();
        Boolean getFeatured();
        Long getOwnerId();
        String getAuthorName();
        Long getCardsCount();
        Long getDownloadsCount();
        Long getQuizCount();
        Double getRating();
        Long getRatingsCount();
        Integer getMyRating();
    }

    /**
     * Tìm (q đã lower-case, rỗng = bỏ qua), lọc, sắp xếp và phân trang ở DB. Tham số rỗng = không lọc.
     * tab: all | popular (điểm TB >= 4.5) | official | community | featured.
     * sort: downloads | rating | cards; hoà thì theo lượt tải rồi tiêu đề (thứ tự ổn định giữa các trang).
     */
    @Query(value = """
            SELECT * FROM (
                SELECT d.id AS "id", d.title AS "title", d.level AS "level", d.description AS "description",
                       d.category AS "category", d.is_official AS "official", d.is_featured AS "featured",
                       d.owner_id AS "ownerId", coalesce(u.full_name, u.email) AS "authorName",
                       (SELECT count(*) FROM flashcards f WHERE f.deck_id = d.id) AS "cardsCount",
                       (SELECT count(*) FROM decks c WHERE c.source_deck_id = d.id) AS "downloadsCount",
                       (SELECT count(*) FROM quiz_results q WHERE q.deck_id = d.id) AS "quizCount",
                       (SELECT CAST(avg(r.stars) AS double precision) FROM deck_ratings r WHERE r.deck_id = d.id) AS "rating",
                       (SELECT count(*) FROM deck_ratings r WHERE r.deck_id = d.id) AS "ratingsCount",
                       (SELECT CAST(r.stars AS integer) FROM deck_ratings r WHERE r.deck_id = d.id AND r.user_id = :uid) AS "myRating"
                FROM decks d JOIN users u ON u.id = d.owner_id
                WHERE d.visibility = 'public'
                  AND (:q = '' OR strpos(lower(d.title), :q) > 0 OR strpos(lower(coalesce(d.description, '')), :q) > 0
                       OR strpos(lower(coalesce(u.full_name, '')), :q) > 0)
                  AND (:level = '' OR d.level = :level)
                  AND (:category = '' OR d.category = :category)
            ) x
            WHERE (:tab <> 'official' OR x."official")
              AND (:tab <> 'community' OR NOT x."official")
              AND (:tab <> 'featured' OR x."featured")
              AND (:tab <> 'popular' OR x."rating" >= 4.5)
            ORDER BY CASE WHEN :sort = 'rating' THEN x."rating" END DESC NULLS LAST,
                     CASE WHEN :sort = 'cards' THEN x."cardsCount" END DESC,
                     x."downloadsCount" DESC, x."title" ASC, x."id" ASC
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<LibraryRow> findLibraryPage(@Param("uid") Long uid, @Param("q") String q, @Param("level") String level,
                                     @Param("category") String category, @Param("tab") String tab,
                                     @Param("sort") String sort, @Param("limit") int limit, @Param("offset") int offset);

    @Query(value = """
            SELECT count(*) FROM (
                SELECT d.is_official AS official,
                       (SELECT avg(r.stars) FROM deck_ratings r WHERE r.deck_id = d.id) AS rating, d.is_featured AS featured
                FROM decks d JOIN users u ON u.id = d.owner_id
                WHERE d.visibility = 'public'
                  AND (:q = '' OR strpos(lower(d.title), :q) > 0 OR strpos(lower(coalesce(d.description, '')), :q) > 0
                       OR strpos(lower(coalesce(u.full_name, '')), :q) > 0)
                  AND (:level = '' OR d.level = :level)
                  AND (:category = '' OR d.category = :category)
            ) x
            WHERE (:tab <> 'official' OR x.official)
              AND (:tab <> 'community' OR NOT x.official)
              AND (:tab <> 'featured' OR x.featured)
              AND (:tab <> 'popular' OR x.rating >= 4.5)
            """, nativeQuery = true)
    long countLibrary(@Param("q") String q, @Param("level") String level, @Param("category") String category,
                      @Param("tab") String tab);
}
