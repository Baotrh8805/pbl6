package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DeckPerformanceIT extends IntegrationTest {

    @Autowired
    EntityManagerFactory emf;

    @Test
    void listing_decks_does_not_issue_one_query_per_deck() throws Exception {
        String token = newUser();
        for (int i = 0; i < 6; i++) {
            call(post("/api/decks"), token, Map.of("title", "P" + i, "level", "N5",
                    "cards", List.of(Map.of("term", "a", "meaning", "b"), Map.of("term", "c", "meaning", "d"))))
                    .andExpect(status().isCreated());
        }
        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();

        JsonNode decks = read(call(get("/api/decks"), token, null).andExpect(status().isOk()));

        assertTrue(decks.size() >= 16, "6 deck của user + 10 deck public của Thư viện");
        // 1 query nạp user trong JWT filter + 1 query quyền được chia sẻ + 1 query deck kèm thẻ.
        // Không phụ thuộc số deck (N+1 cũ: 1 + số deck).
        assertTrue(stats.getPrepareStatementCount() <= 3, "số query: " + stats.getPrepareStatementCount());
    }

    @Test
    void concurrent_card_additions_get_distinct_positions() throws Exception {
        String token = newUser();
        String deckId = read(call(post("/api/decks"), token, Map.of("title", "C", "level", "N5"))).get("id").asText();

        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                int n = i;
                results.add(pool.submit(() -> call(post("/api/decks/" + deckId + "/cards"), token,
                        Map.of("term", "t" + n, "meaning", "m")).andReturn().getResponse().getStatus()));
            }
            for (Future<Integer> r : results) assertEquals(201, r.get());
        } finally {
            pool.shutdown();
        }

        Set<Integer> positions = new HashSet<>();
        read(call(get("/api/decks/" + deckId), token, null)).get("cards")
                .forEach(c -> positions.add(c.get("position").asInt()));
        assertEquals(Set.of(1, 2, 3, 4, 5, 6, 7, 8), positions);
    }

    @Test
    void concurrent_reviews_of_the_same_card_never_fail() throws Exception {
        String token = newUser();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                results.add(pool.submit(() -> call(post("/api/reviews"), token,
                        Map.of("cardId", "n4-1", "grade", "good")).andReturn().getResponse().getStatus()));
            }
            for (Future<Integer> r : results) assertEquals(200, r.get());
        } finally {
            pool.shutdown();
        }
        JsonNode reviews = read(call(get("/api/reviews"), token, null));
        assertEquals(1, reviews.size());
        assertEquals(6, reviews.get(0).get("reps").asInt(), "6 lần chấm tuần tự hoá, không mất lần nào");
    }
}
