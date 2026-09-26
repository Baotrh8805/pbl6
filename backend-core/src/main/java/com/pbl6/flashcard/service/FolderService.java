package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.folder.FolderResponse;
import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.FolderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class FolderService {

    /**
     * Lồng nhau "không giới hạn" về mặt sản phẩm; 50 chỉ là van an toàn để vòng lặp
     * duyệt tổ tiên không treo nếu dữ liệu bị hỏng thành chu trình.
     */
    public static final int MAX_DEPTH = 50;

    private final FolderRepository folderRepository;

    public FolderService(FolderRepository folderRepository) {
        this.folderRepository = folderRepository;
    }

    @Transactional
    public FolderResponse createFolder(FolderRequest request, User user) {
        List<Folder> all = folderRepository.findByUserOrderByTitleAsc(user);
        Folder parent = resolveParent(request.getParentId(), null, all, user);
        requireUniqueTitle(all, request.getTitle(), request.getParentId(), null);

        Folder folder = new Folder(
                request.getTitle(),
                request.getDescription(),
                request.getAccessType(),
                request.getLevel(),
                Boolean.TRUE.equals(request.getIsPinned()),
                request.getMetadata(),
                user
        );
        folder.setParent(parent);
        return mapToResponse(folderRepository.save(folder));
    }

    /** 1 query lấy toàn bộ folder phẳng rồi dựng cây trong RAM -> không N+1. */
    @Transactional(readOnly = true)
    public List<FolderResponse> getUserFolders(User user) {
        List<FolderResponse> flat = new ArrayList<>();
        for (Folder f : folderRepository.findByUserOrderByTitleAsc(user)) {
            flat.add(mapToResponse(f));
        }
        return buildTree(flat);
    }

    @Transactional
    public FolderResponse updateFolder(UUID id, FolderRequest request, User user) {
        Folder folder = folderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        requireOwner(folder, user);

        List<Folder> all = folderRepository.findByUserOrderByTitleAsc(user);
        Folder parent = resolveParent(request.getParentId(), id, all, user);
        requireUniqueTitle(all, request.getTitle(), request.getParentId(), id);

        // Form sửa thư mục chỉ gửi title/level/description/parentId. Field vắng mặt (null)
        // giữ nguyên giá trị cũ thay vì bị xoá trắng.
        folder.setTitle(request.getTitle());
        if (request.getDescription() != null) folder.setDescription(request.getDescription());
        if (request.getAccessType() != null) folder.setAccessType(request.getAccessType());
        if (request.getLevel() != null) folder.setLevel(request.getLevel());
        if (request.getMetadata() != null) folder.setMetadata(request.getMetadata());
        if (request.getIsPinned() != null) folder.setPinned(request.getIsPinned());
        folder.setParent(parent); // PUT với parentId khác = move

        return mapToResponse(folderRepository.save(folder));
    }

    /**
     * Xoá cha KHÔNG xoá con: FK `ON DELETE SET NULL` (V1__baseline.sql) đẩy folder con và deck bên trong
     * về gốc / "chưa xếp". Chọn vậy để một cú xoá nhầm không cuốn theo cả cây lẫn toàn bộ thẻ.
     */
    @Transactional
    public void deleteFolder(UUID id, User user) {
        Folder folder = folderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        requireOwner(folder, user);
        List<Folder> all = folderRepository.findByUserOrderByTitleAsc(user);
        requireChildrenFitAtRoot(folder, all);
        // Con đang nằm trong persistence context vẫn trỏ tới cha sắp xoá -> Hibernate 6.6 từ chối flush.
        // Gỡ trong bộ nhớ, giống việc FK ON DELETE SET NULL làm ở DB.
        for (Folder f : all) {
            if (f.getParent() != null && f.getParent().getId().equals(id)) f.setParent(null);
        }
        folderRepository.delete(folder);
    }

    // ---------- ràng buộc ----------

    private void requireOwner(Folder folder, User user) {
        if (!folder.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to modify this folder");
        }
    }

    private Folder resolveParent(UUID parentId, UUID selfId, List<Folder> all, User user) {
        if (parentId == null) {
            checkDepth(parentId, selfId, all);
            return null;
        }
        Folder parent = folderRepository.findById(parentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Parent folder not found"));
        if (!parent.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Parent folder does not belong to you");
        }
        checkDepth(parentId, selfId, all);
        return parent;
    }

    private void checkDepth(UUID parentId, UUID selfId, List<Folder> all) {
        Map<UUID, UUID> parentOf = new HashMap<>();
        for (Folder f : all) {
            parentOf.put(f.getId(), f.getParent() == null ? null : f.getParent().getId());
        }
        checkMove(parentOf, selfId, parentId, MAX_DEPTH);
    }

    private void requireUniqueTitle(List<Folder> all, String title, UUID parentId, UUID selfId) {
        for (Folder f : all) {
            if (f.getId().equals(selfId)) continue;
            UUID fParent = f.getParent() == null ? null : f.getParent().getId();
            boolean sameParent = parentId == null ? fParent == null : parentId.equals(fParent);
            if (sameParent && f.getTitle().equalsIgnoreCase(title)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A folder with this name already exists here");
            }
        }
    }

    /**
     * Con được đẩy lên gốc khi xoá cha -> con trùng tên (không phân biệt hoa thường) với folder gốc khác
     * sẽ vi phạm uq_folder_name_at_root. Báo rõ tên để người dùng đổi tên trước, thay vì lỗi DB mơ hồ.
     */
    private void requireChildrenFitAtRoot(Folder folder, List<Folder> all) {
        List<String> clashes = new ArrayList<>();
        for (Folder child : all) {
            if (child.getParent() == null || !child.getParent().getId().equals(folder.getId())) continue;
            for (Folder root : all) {
                if (root.getParent() == null && !root.getId().equals(folder.getId())
                        && root.getTitle().equalsIgnoreCase(child.getTitle())) {
                    clashes.add(child.getTitle());
                    break;
                }
            }
        }
        if (!clashes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Không thể xoá: thư mục con " + String.join(", ", clashes.stream().map(t -> "'" + t + "'").toList())
                            + " trùng tên với thư mục ở cấp gốc. Hãy đổi tên trước khi xoá.");
        }
    }

    // ---------- hàm thuần, test được không cần DB ----------

    /**
     * Chặn cycle + giới hạn độ sâu cho thao tác đặt {@code selfId} vào dưới {@code newParentId}.
     * selfId == null nghĩa là tạo mới (chưa có subtree).
     */
    public static void checkMove(Map<UUID, UUID> parentOf, UUID selfId, UUID newParentId, int maxDepth) {
        int parentDepth = 0; // độ sâu của cha mới; 0 = đặt ở gốc
        for (UUID a = newParentId; a != null; a = parentOf.get(a)) {
            if (a.equals(selfId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot move a folder into its own subtree");
            }
            if (++parentDepth > maxDepth) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Folder hierarchy is corrupted (cycle detected)");
            }
        }
        if (parentDepth + 1 + subtreeHeight(parentOf, selfId) > maxDepth) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Max folder depth is " + maxDepth);
        }
    }

    /** Số tầng con nằm dưới id (lá = 0). */
    private static int subtreeHeight(Map<UUID, UUID> parentOf, UUID id) {
        if (id == null) return 0;
        int height = 0;
        for (Map.Entry<UUID, UUID> e : parentOf.entrySet()) {
            if (id.equals(e.getValue())) {
                height = Math.max(height, 1 + subtreeHeight(parentOf, e.getKey()));
            }
        }
        return height;
    }

    /** Nối children theo parentId, trả về các node gốc. Giữ nguyên thứ tự đầu vào. */
    public static List<FolderResponse> buildTree(List<FolderResponse> flat) {
        Map<UUID, FolderResponse> byId = new HashMap<>();
        for (FolderResponse f : flat) {
            byId.put(f.getId(), f);
        }
        List<FolderResponse> roots = new ArrayList<>();
        for (FolderResponse f : flat) {
            FolderResponse parent = f.getParentId() == null ? null : byId.get(f.getParentId());
            if (parent == null) {
                roots.add(f); // parentId trỏ ra ngoài tập -> coi như gốc
            } else {
                parent.getChildren().add(f);
            }
        }
        return roots;
    }

    private FolderResponse mapToResponse(Folder folder) {
        FolderResponse response = new FolderResponse();
        response.setId(folder.getId());
        response.setTitle(folder.getTitle());
        response.setDescription(folder.getDescription());
        response.setAccessType(folder.getAccessType());
        response.setLevel(folder.getLevel());
        response.setPinned(folder.isPinned());
        response.setMetadata(folder.getMetadata());
        response.setParentId(folder.getParent() == null ? null : folder.getParent().getId());
        return response;
    }
}
