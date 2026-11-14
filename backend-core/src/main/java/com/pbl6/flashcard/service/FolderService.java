package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.folder.FolderMemberResponse;
import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.folder.FolderResponse;
import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.FolderShare;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.FolderRepository;
import com.pbl6.flashcard.repository.FolderShareRepository;
import com.pbl6.flashcard.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FolderService {

    /**
     * Lồng nhau "không giới hạn" về mặt sản phẩm; 50 chỉ là van an toàn để vòng lặp
     * duyệt tổ tiên không treo nếu dữ liệu bị hỏng thành chu trình.
     */
    public static final int MAX_DEPTH = 50;

    static final String NOT_FOUND = "Không tìm thấy thư mục.";
    static final String DUPLICATE_NAME = "Đã có thư mục cùng tên ở vị trí này.";

    private final FolderRepository folderRepository;
    private final FolderShareRepository shareRepository;
    private final UserRepository userRepository;

    public FolderService(FolderRepository folderRepository, FolderShareRepository shareRepository,
                         UserRepository userRepository) {
        this.folderRepository = folderRepository;
        this.shareRepository = shareRepository;
        this.userRepository = userRepository;
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
                request.getLevel() == null || request.getLevel().isEmpty() ? null : request.getLevel(),
                Boolean.TRUE.equals(request.getIsPinned()),
                request.getMetadata(),
                user
        );
        folder.setParent(parent);
        return mapToResponse(folderRepository.save(folder), FolderResponse.OWNER);
    }

    /** 1 query lấy toàn bộ folder phẳng rồi dựng cây trong RAM -> không N+1. */
    @Transactional(readOnly = true)
    public List<FolderResponse> getUserFolders(User user) {
        List<FolderResponse> flat = new ArrayList<>();
        for (Folder f : folderRepository.findByUserOrderByTitleAsc(user)) {
            flat.add(mapToResponse(f, FolderResponse.OWNER));
        }
        return buildTree(flat);
    }

    /** Một thư mục (kèm cây con) mà user xem được: của mình, được chia sẻ, hoặc public. Khác = 404. */
    @Transactional(readOnly = true)
    public FolderResponse getFolder(UUID id, User user) {
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
        Long ownerId = folder.getUser().getId();
        boolean owner = ownerId.equals(user.getId());
        if (!owner && !folderRepository.isSharedWith(id, user.getId())) throw notFound();

        FolderResponse node = subtrees(ownerId, Set.of(id), owner ? FolderResponse.OWNER : FolderResponse.VIEWER).get(0);
        if (!owner) {
            node.setOwnerName(ownerName(folder.getUser()));
            // Không dẫn người xem lên thư mục cha mà họ không có quyền
            if (node.getParentId() != null && !folderRepository.isSharedWith(node.getParentId(), user.getId())) {
                node.setParentId(null);
            }
        }
        return node;
    }

    /** Thư mục người khác chia sẻ trực tiếp cho mình (kèm cây con). Thư mục nằm trong thư mục cũng được chia sẻ thì chỉ hiện gốc. */
    @Transactional(readOnly = true)
    public List<FolderResponse> getSharedWithMe(User user) {
        Set<UUID> sharedIds = shareRepository.findByUserId(user.getId()).stream()
                .map(FolderShare::getFolderId).collect(Collectors.toSet());
        if (sharedIds.isEmpty()) return List.of();

        Map<Long, User> owners = new HashMap<>();
        for (Folder f : folderRepository.findAllById(sharedIds)) {
            owners.putIfAbsent(f.getUser().getId(), f.getUser());
        }
        List<FolderResponse> result = new ArrayList<>();
        for (User owner : owners.values()) {
            for (FolderResponse node : subtrees(owner.getId(), sharedIds, FolderResponse.VIEWER)) {
                node.setOwnerName(ownerName(owner));
                node.setParentId(null); // người xem không đi lên được thư mục cha của chủ
                result.add(node);
            }
        }
        result.sort((a, b) -> a.getTitle().compareToIgnoreCase(b.getTitle()));
        return result;
    }

    @Transactional
    public FolderResponse updateFolder(UUID id, FolderRequest request, User user) {
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
        requireOwner(folder, user);

        List<Folder> all = folderRepository.findByUserOrderByTitleAsc(user);
        Folder parent = resolveParent(request.getParentId(), id, all, user);
        requireUniqueTitle(all, request.getTitle(), request.getParentId(), id);

        // Form sửa thư mục chỉ gửi title/level/description/parentId. Field vắng mặt (null)
        // giữ nguyên giá trị cũ thay vì bị xoá trắng.
        folder.setTitle(request.getTitle());
        if (request.getDescription() != null) folder.setDescription(request.getDescription());
        if (request.getAccessType() != null) folder.setAccessType(request.getAccessType());
        if (request.getLevel() != null) folder.setLevel(request.getLevel().isEmpty() ? null : request.getLevel());
        if (request.getMetadata() != null) folder.setMetadata(request.getMetadata());
        if (request.getIsPinned() != null) folder.setPinned(request.getIsPinned());
        folder.setParent(parent); // PUT với parentId khác = move

        return mapToResponse(folderRepository.save(folder), FolderResponse.OWNER);
    }

    /**
     * Xoá cha KHÔNG xoá con: FK `ON DELETE SET NULL` (V1__baseline.sql) đẩy folder con và deck bên trong
     * về gốc / "chưa xếp". Chọn vậy để một cú xoá nhầm không cuốn theo cả cây lẫn toàn bộ thẻ.
     */
    @Transactional
    public void deleteFolder(UUID id, User user) {
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
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

    // ---------- chia sẻ (chỉ chủ thư mục) ----------

    @Transactional(readOnly = true)
    public List<FolderMemberResponse> members(UUID id, User user) {
        requireOwner(folderRepository.findById(id).orElseThrow(FolderService::notFound), user);
        return shareRepository.findMembers(id);
    }

    /** Cho người dùng (theo email) quyền xem thư mục; đã có thì giữ nguyên. Trả danh sách sau khi đổi. */
    @Transactional
    public List<FolderMemberResponse> share(UUID id, String email, User user) {
        requireOwner(folderRepository.findById(id).orElseThrow(FolderService::notFound), user);
        User target = userRepository.findByEmail(User.normalizeEmail(email))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Không tìm thấy người dùng với email này."));
        if (target.getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bạn đã là chủ thư mục này.");
        }
        if (shareRepository.findByFolderIdAndUserId(id, target.getId()).isEmpty()) {
            shareRepository.save(new FolderShare(id, target.getId()));
        }
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
        if (PRIVATE.equals(folder.getAccessType())) folder.setAccessType(SHARED); // nhãn hiển thị
        return shareRepository.findMembers(id);
    }

    @Transactional
    public void unshare(UUID id, Long targetUserId, User user) {
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
        requireOwner(folder, user);
        shareRepository.findByFolderIdAndUserId(id, targetUserId).ifPresent(shareRepository::delete);
        shareRepository.flush();
        if (SHARED.equals(folder.getAccessType()) && shareRepository.findMembers(id).isEmpty()) {
            folder.setAccessType(PRIVATE);
        }
    }

    /**
     * public: ai đăng nhập có link đều xem được. private: chỉ người được mời (nhãn tự thành 'shared' khi còn
     * người được mời). Tách khỏi PUT /folders/{id} vì PUT đó coi parentId vắng mặt là "chuyển về gốc".
     */
    @Transactional
    public FolderResponse setLinkAccess(UUID id, boolean isPublic, User user) {
        Folder folder = folderRepository.findById(id).orElseThrow(FolderService::notFound);
        requireOwner(folder, user);
        folder.setAccessType(isPublic ? PUBLIC : shareRepository.findMembers(id).isEmpty() ? PRIVATE : SHARED);
        return mapToResponse(folder, FolderResponse.OWNER);
    }

    private static final String PRIVATE = "private";
    private static final String SHARED = "shared";
    private static final String PUBLIC = "public";

    // ---------- ràng buộc ----------

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
    }

    private void requireOwner(Folder folder, User user) {
        if (!folder.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ chủ thư mục được thực hiện thao tác này.");
        }
    }

    private Folder resolveParent(UUID parentId, UUID selfId, List<Folder> all, User user) {
        if (parentId == null) {
            checkDepth(parentId, selfId, all);
            return null;
        }
        Folder parent = folderRepository.findById(parentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thư mục cha."));
        if (!parent.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Thư mục cha không thuộc quyền sở hữu của bạn.");
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
                throw new ResponseStatusException(HttpStatus.CONFLICT, DUPLICATE_NAME);
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
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.");
            }
            if (++parentDepth > maxDepth) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cây thư mục bị lỗi (phát hiện vòng lặp).");
            }
        }
        if (parentDepth + 1 + subtreeHeight(parentOf, selfId) > maxDepth) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thư mục chỉ lồng được tối đa " + maxDepth + " cấp.");
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

    /** id của {@code rootId} và mọi thư mục con cháu của nó trong danh sách thư mục của một chủ. */
    public static Set<UUID> subtreeIds(List<Folder> ownerFolders, UUID rootId) {
        Map<UUID, List<UUID>> childrenOf = new HashMap<>();
        for (Folder f : ownerFolders) {
            if (f.getParent() != null) {
                childrenOf.computeIfAbsent(f.getParent().getId(), k -> new ArrayList<>()).add(f.getId());
            }
        }
        Set<UUID> result = new java.util.LinkedHashSet<>();
        java.util.ArrayDeque<UUID> queue = new java.util.ArrayDeque<>(List.of(rootId));
        while (!queue.isEmpty()) {
            UUID id = queue.poll();
            if (result.add(id)) queue.addAll(childrenOf.getOrDefault(id, List.of())); // add()=false: chống vòng lặp
        }
        return result;
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

    /**
     * Cây con của các thư mục {@code ids} thuộc cùng một chủ (1 query cho mọi thư mục của chủ đó).
     * id nằm dưới một id khác trong tập thì không lặp lại thành gốc riêng.
     */
    private List<FolderResponse> subtrees(Long ownerId, Set<UUID> ids, String access) {
        List<FolderResponse> flat = new ArrayList<>();
        for (Folder f : folderRepository.findByUser_IdOrderByTitleAsc(ownerId)) {
            flat.add(mapToResponse(f, access));
        }
        Map<UUID, FolderResponse> byId = new HashMap<>();
        for (FolderResponse f : flat) byId.put(f.getId(), f);
        buildTree(flat);

        List<FolderResponse> result = new ArrayList<>();
        for (FolderResponse f : flat) {
            if (!ids.contains(f.getId())) continue;
            boolean underAnother = false;
            int guard = 0;
            for (UUID a = f.getParentId(); a != null && guard++ < MAX_DEPTH; a = byId.containsKey(a) ? byId.get(a).getParentId() : null) {
                if (ids.contains(a)) {
                    underAnother = true;
                    break;
                }
            }
            if (!underAnother) result.add(f);
        }
        return result;
    }

    private static String ownerName(User owner) {
        return owner.getFullName() != null && !owner.getFullName().isBlank() ? owner.getFullName() : owner.getEmail();
    }

    private FolderResponse mapToResponse(Folder folder, String access) {
        FolderResponse response = new FolderResponse();
        response.setId(folder.getId());
        response.setTitle(folder.getTitle());
        response.setDescription(folder.getDescription());
        response.setAccessType(folder.getAccessType());
        response.setLevel(folder.getLevel());
        response.setPinned(folder.isPinned());
        response.setMetadata(folder.getMetadata());
        response.setParentId(folder.getParent() == null ? null : folder.getParent().getId());
        response.setAccess(access);
        return response;
    }
}
