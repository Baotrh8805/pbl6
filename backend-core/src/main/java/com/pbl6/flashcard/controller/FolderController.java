package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.config.ApiExceptionHandler;
import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.folder.FolderResponse;
import com.pbl6.flashcard.dto.folder.FolderShareRequest;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.FolderShareRepository;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.FolderService;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }
    /**
     * Hai request tạo trùng tên cùng lúc lọt qua kiểm tra trong service nhưng bị index
     * uq_folder_name_* chặn ở DB (V1__baseline.sql). Trả 409 thay vì 500. Chỉ bắt đúng index đó:
     * vi phạm ràng buộc khác không được báo nhầm thành "trùng tên".
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiExceptionHandler.ApiError> onDuplicate(DataIntegrityViolationException e) {
        String cause = e.getMostSpecificCause().getMessage();
        if (cause != null && cause.contains("uq_folder_name_")) {
            return ApiExceptionHandler.error(HttpStatus.CONFLICT, "Đã có thư mục cùng tên ở vị trí này.");
        }
        return new ApiExceptionHandler().onConflict(e);
    }

// lấy token JWT để biết ai đang gọi API
    private User getCurrentUser(Authentication authentication) {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        return userDetails.getUser();
    }

    /** Cây thư mục của chính mình. */
    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(Authentication authentication) {
        User user = getCurrentUser(authentication);
        List<FolderResponse> folders = folderService.getUserFolders(user);
        return ResponseEntity.ok(folders);
    }

    /** Thư mục người khác chia sẻ cho mình (chỉ xem). */
    @GetMapping("/shared")
    public List<FolderResponse> getSharedFolders(Authentication authentication) {
        return folderService.getSharedWithMe(getCurrentUser(authentication));
    }

    /** Một thư mục + cây con: của mình, được chia sẻ, hoặc public (mở từ link). */
    @GetMapping("/{id}")
    public FolderResponse getFolder(@PathVariable UUID id, Authentication authentication) {
        return folderService.getFolder(id, getCurrentUser(authentication));
    }

    @PostMapping
    public ResponseEntity<FolderResponse> createFolder(
            @Valid @RequestBody FolderRequest request,
            Authentication authentication) {
        User user = getCurrentUser(authentication);
        FolderResponse response = folderService.createFolder(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<FolderResponse> updateFolder(
            @PathVariable UUID id,
            @Valid @RequestBody FolderRequest request,
            Authentication authentication) {
        User user = getCurrentUser(authentication);
        FolderResponse response = folderService.updateFolder(id, request, user);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteFolder(
            @PathVariable UUID id,
            Authentication authentication) {
        User user = getCurrentUser(authentication);
        folderService.deleteFolder(id, user);
        return ResponseEntity.noContent().build();
    }

    // ---------- chia sẻ (chỉ chủ thư mục) ----------

    @GetMapping("/{id}/shares")
    public List<FolderShareRepository.Member> shares(@PathVariable UUID id, Authentication authentication) {
        return folderService.members(id, getCurrentUser(authentication));
    }

    /** Mời người dùng (theo email) xem thư mục; trả danh sách sau khi thêm. */
    @PutMapping("/{id}/shares")
    public List<FolderShareRepository.Member> share(@PathVariable UUID id, @Valid @RequestBody FolderShareRequest req,
                                                    Authentication authentication) {
        return folderService.share(id, req.email(), getCurrentUser(authentication));
    }

    /** Bật/tắt "ai có link đều xem được". Body: {"public": true|false}. */
    @PutMapping("/{id}/link-access")
    public FolderResponse setLinkAccess(@PathVariable UUID id, @Valid @RequestBody LinkAccessRequest req,
                                        Authentication authentication) {
        return folderService.setLinkAccess(id, req.isPublic(), getCurrentUser(authentication));
    }

    public record LinkAccessRequest(@jakarta.validation.constraints.NotNull
                                    @com.fasterxml.jackson.annotation.JsonProperty("public") Boolean isPublic) {}

    @DeleteMapping("/{id}/shares/{userId}")
    public ResponseEntity<Void> unshare(@PathVariable UUID id, @PathVariable Long userId, Authentication authentication) {
        folderService.unshare(id, userId, getCurrentUser(authentication));
        return ResponseEntity.noContent().build();
    }
}
