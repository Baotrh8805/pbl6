package com.pbl6.flashcard.dto.folder;

/** Một người được chia sẻ thư mục (quyền xem & học). Dựng thẳng từ FolderShareRepository.findMembers. */
public record FolderMemberResponse(Long userId, String email, String fullName) {}
