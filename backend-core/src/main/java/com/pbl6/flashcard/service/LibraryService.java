package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.dto.library.LibraryDeckResponse;
import com.pbl6.flashcard.dto.library.LibraryDeckResponse.Featured;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.repository.DeckRatingRepository;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.FlashcardRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;

/** Thư viện cộng đồng = bộ thẻ public. Tìm/lọc/sắp xếp/phân trang và số liệu đều tính ở DB. */
@Service
public class LibraryService {

    private final DeckRepository deckRepository;
    private final FlashcardRepository flashcardRepository;
    private final DeckRatingRepository ratingRepository;

    public LibraryService(DeckRepository deckRepository, FlashcardRepository flashcardRepository,
                          DeckRatingRepository ratingRepository) {
        this.deckRepository = deckRepository;
        this.flashcardRepository = flashcardRepository;
        this.ratingRepository = ratingRepository;
    }

    /** Tham số đã được controller validate; null/rỗng = không lọc. */
    public record Query(String q, String level, String category, String tab, String sort, int page, int size) {}

    @Transactional(readOnly = true)
    public LibraryDeckResponse.Page list(Long uid, Query query) {
        String q = query.q() == null ? "" : query.q().trim().toLowerCase(Locale.ROOT);
        String level = nz(query.level());
        String category = nz(query.category());
        String tab = query.tab() == null ? "all" : query.tab();
        String sort = query.sort() == null ? "downloads" : query.sort();

        List<LibraryDeckResponse> items = deckRepository
                .findLibraryPage(uid, q, level, category, tab, sort, query.size(), query.page() * query.size())
                .stream().map(r -> LibraryDeckResponse.of(r, uid)).toList();
        long total = deckRepository.countLibrary(q, level, category, tab);
        return new LibraryDeckResponse.Page(items, total, query.page(), query.size(),
                deckRepository.countByVisibility(Deck.PUBLIC), featured(uid));
    }

    /** Bộ thẻ gắn cờ nổi bật; chưa gắn thì bộ được tải nhiều nhất. Kèm thẻ đầu tiên làm thẻ mẫu. */
    private Featured featured(Long uid) {
        List<DeckRepository.LibraryRow> rows = deckRepository.findLibraryPage(uid, "", "", "", "featured", "downloads", 1, 0);
        if (rows.isEmpty()) rows = deckRepository.findLibraryPage(uid, "", "", "", "all", "downloads", 1, 0);
        if (rows.isEmpty()) return null;
        LibraryDeckResponse deck = LibraryDeckResponse.of(rows.get(0), uid);
        CardResponse sample = flashcardRepository.findFirstByDeck_IdOrderByPositionAsc(deck.id())
                .map(CardResponse::of).orElse(null);
        return new Featured(deck, sample);
    }

    /** Chấm sao bộ thẻ public của người khác; chấm lại thì ghi đè. */
    @Transactional
    public LibraryDeckResponse.Rating rate(Long uid, String deckId, int stars) {
        Deck deck = deckRepository.findById(deckId).filter(Deck::isPublic)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bộ thẻ."));
        if (uid.equals(deck.getOwnerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể tự đánh giá bộ thẻ của mình.");
        }
        ratingRepository.upsert(deckId, uid, (short) stars);
        DeckRatingRepository.Summary s = ratingRepository.summary(deckId);
        return new LibraryDeckResponse.Rating(LibraryDeckResponse.round1(s.getRating()), s.getRatingsCount(), stars);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
