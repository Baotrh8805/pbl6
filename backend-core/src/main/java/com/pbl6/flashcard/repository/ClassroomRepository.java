package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Classroom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassroomRepository extends JpaRepository<Classroom, Long> {
    List<Classroom> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    Optional<Classroom> findByCode(String code);
    boolean existsByCode(String code);
}
