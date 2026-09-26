package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.folder.FolderResponse;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Thuần logic, không cần DB: dựng cây + chống cycle + giới hạn độ sâu. */
class FolderTreeTest {

    private static final UUID A = UUID.randomUUID();
    private static final UUID B = UUID.randomUUID();
    private static final UUID C = UUID.randomUUID();

    /** A > B > C */
    private Map<UUID, UUID> chain() {
        Map<UUID, UUID> parentOf = new HashMap<>();
        parentOf.put(A, null);
        parentOf.put(B, A);
        parentOf.put(C, B);
        return parentOf;
    }

    private FolderResponse node(UUID id, UUID parentId) {
        FolderResponse f = new FolderResponse();
        f.setId(id);
        f.setParentId(parentId);
        return f;
    }

    @Test
    void buildTree_nests_children_under_parents() {
        List<FolderResponse> flat = new ArrayList<>(List.of(node(A, null), node(B, A), node(C, B)));

        List<FolderResponse> roots = FolderService.buildTree(flat);

        assertEquals(1, roots.size());
        assertEquals(A, roots.get(0).getId());
        assertEquals(B, roots.get(0).getChildren().get(0).getId());
        assertEquals(C, roots.get(0).getChildren().get(0).getChildren().get(0).getId());
    }

    @Test
    void move_into_self_is_rejected() {
        assertThrows(RuntimeException.class,
                () -> FolderService.checkMove(chain(), C, C, FolderService.MAX_DEPTH));
    }

    @Test
    void move_into_own_descendant_is_rejected() {
        assertThrows(RuntimeException.class,
                () -> FolderService.checkMove(chain(), A, C, FolderService.MAX_DEPTH));
    }

    @Test
    void move_to_root_and_to_sibling_is_allowed() {
        assertDoesNotThrow(() -> FolderService.checkMove(chain(), C, null, FolderService.MAX_DEPTH));
        assertDoesNotThrow(() -> FolderService.checkMove(chain(), C, A, FolderService.MAX_DEPTH));
    }

    @Test
    void exceeding_max_depth_is_rejected() {
        // Trần truyền tường minh = 5: cây A>B>C (cao 3) đưa xuống dưới D tầng 3 -> 6 > 5.
        Map<UUID, UUID> parentOf = chain();
        UUID d1 = UUID.randomUUID(), d2 = UUID.randomUUID(), d3 = UUID.randomUUID();
        parentOf.put(d1, null);
        parentOf.put(d2, d1);
        parentOf.put(d3, d2);

        assertThrows(RuntimeException.class, () -> FolderService.checkMove(parentOf, A, d3, 5));
        assertDoesNotThrow(() -> FolderService.checkMove(parentOf, A, d2, 5));
    }

    /** Trần mặc định phải đủ rộng để người dùng coi như lồng không giới hạn. */
    @Test
    void default_depth_allows_deep_nesting() {
        Map<UUID, UUID> parentOf = new HashMap<>();
        UUID prev = null, deepest = null;
        for (int i = 0; i < 20; i++) {
            UUID id = UUID.randomUUID();
            parentOf.put(id, prev);
            prev = id;
            deepest = id;
        }
        UUID target = deepest;
        assertDoesNotThrow(
                () -> FolderService.checkMove(parentOf, null, target, FolderService.MAX_DEPTH));
    }
}
