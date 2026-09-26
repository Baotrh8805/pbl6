package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.config.ApiExceptionHandler;
import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.folder.FolderResponse;
import com.pbl6.flashcard.model.User;
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
            return ApiExceptionHandler.error(HttpStatus.CONFLICT, "A folder with this name already exists here");
        }
        return new ApiExceptionHandler().onConflict(e);
    }

// lấy token JWT để biết ai đang gọi API
    private User getCurrentUser(Authentication authentication) {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        return userDetails.getUser();
    }

    @GetMapping
    public ResponseEntity<List<FolderResponse>> getFolders(Authentication authentication) {
        User user = getCurrentUser(authentication);
        List<FolderResponse> folders = folderService.getUserFolders(user);
        return ResponseEntity.ok(folders);
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
}
