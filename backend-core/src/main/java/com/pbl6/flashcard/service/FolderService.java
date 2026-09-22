package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.folder.FolderRequest;
import com.pbl6.flashcard.dto.folder.FolderResponse;
import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.FolderRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FolderService {

    private final FolderRepository folderRepository;

    public FolderService(FolderRepository folderRepository) {
        this.folderRepository = folderRepository;
    }

    public FolderResponse createFolder(FolderRequest request, User user) {
        Folder folder = new Folder(
                request.getTitle(),
                request.getDescription(),
                request.getAccessType(),
                request.getLevel(),
                request.isPinned(),
                request.getMetadata(),
                user
        );
        Folder savedFolder = folderRepository.save(folder);
        return mapToResponse(savedFolder);
    }

    public List<FolderResponse> getUserFolders(User user) {
        List<Folder> folders = folderRepository.findByUser(user);
        return folders.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public FolderResponse updateFolder(UUID id, FolderRequest request, User user) {
        Folder folder = folderRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Folder not found"));

        if (!folder.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You do not have permission to modify this folder");
        }

        folder.setTitle(request.getTitle());
        folder.setDescription(request.getDescription());
        folder.setAccessType(request.getAccessType());
        folder.setLevel(request.getLevel());
        folder.setPinned(request.isPinned());
        folder.setMetadata(request.getMetadata());

        Folder updatedFolder = folderRepository.save(folder);
        return mapToResponse(updatedFolder);
    }

    public void deleteFolder(UUID id, User user) {
        Folder folder = folderRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Folder not found"));

        if (!folder.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You do not have permission to delete this folder");
        }

        folderRepository.delete(folder);
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
        
        return response;
    }
}
