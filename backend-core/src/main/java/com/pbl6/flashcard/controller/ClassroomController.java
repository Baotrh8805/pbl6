package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.classroom.*;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.ClassroomService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/classrooms")
public class ClassroomController {

    private final ClassroomService classroomService;

    public ClassroomController(ClassroomService classroomService) {
        this.classroomService = classroomService;
    }

    /** Tạo lớp học mới (Yêu cầu tài khoản Premium) */
    @PostMapping
    public ResponseEntity<ClassroomResponse> createClassroom(
            @AuthenticationPrincipal CustomUserDetails me,
            @Valid @RequestBody CreateClassroomRequest req) {
        ClassroomResponse res = classroomService.createClassroom(me.getUser(), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    /** Danh sách các lớp học do mình làm chủ/giảng dạy */
    @GetMapping("/my-teaching")
    public ResponseEntity<List<ClassroomResponse>> getMyTeachingClassrooms(
            @AuthenticationPrincipal CustomUserDetails me) {
        return ResponseEntity.ok(classroomService.getMyTeachingClassrooms(me.getUser()));
    }

    /** Danh sách các lớp học mình đang tham gia học */
    @GetMapping("/my-enrolled")
    public ResponseEntity<List<ClassroomResponse>> getMyEnrolledClassrooms(
            @AuthenticationPrincipal CustomUserDetails me) {
        return ResponseEntity.ok(classroomService.getMyEnrolledClassrooms(me.getUser()));
    }

    /** Xem chi tiết một lớp học */
    @GetMapping("/{id}")
    public ResponseEntity<ClassroomResponse> getClassroomDetail(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id) {
        return ResponseEntity.ok(classroomService.getClassroomDetail(me.getUser(), id));
    }

    /** Học viên tham gia lớp bằng mã lớp 6 ký tự */
    @PostMapping("/join")
    public ResponseEntity<Map<String, Object>> joinClassroom(
            @AuthenticationPrincipal CustomUserDetails me,
            @Valid @RequestBody JoinClassroomRequest req) {
        return ResponseEntity.ok(classroomService.joinClassroom(me.getUser(), req.code()));
    }

    /** Lấy danh sách thành viên chờ duyệt (Dành cho chủ lớp) */
    @GetMapping("/{id}/pending-members")
    public ResponseEntity<List<ClassroomMemberDto>> getPendingMembers(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id) {
        return ResponseEntity.ok(classroomService.getPendingMembers(me.getUser(), id));
    }

    /** Lấy danh sách thành viên chính thức của lớp */
    @GetMapping("/{id}/members")
    public ResponseEntity<List<ClassroomMemberDto>> getApprovedMembers(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id) {
        return ResponseEntity.ok(classroomService.getApprovedMembers(me.getUser(), id));
    }

    /** Chủ lớp duyệt học viên vào lớp */
    @PostMapping("/{id}/members/{targetUserId}/approve")
    public ResponseEntity<Void> approveMember(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long targetUserId) {
        classroomService.approveMember(me.getUser(), id, targetUserId);
        return ResponseEntity.noContent().build();
    }

    /** Chủ lớp từ chối học viên xin vào lớp */
    @PostMapping("/{id}/members/{targetUserId}/reject")
    public ResponseEntity<Void> rejectMember(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long targetUserId) {
        classroomService.rejectMember(me.getUser(), id, targetUserId);
        return ResponseEntity.noContent().build();
    }

    /** Chủ lớp xóa học viên khỏi lớp */
    @DeleteMapping("/{id}/members/{targetUserId}")
    public ResponseEntity<Void> removeMember(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long targetUserId) {
        classroomService.removeMember(me.getUser(), id, targetUserId);
        return ResponseEntity.noContent().build();
    }

    /** Học viên / giáo viên hoàn thành một buổi học trong lớp */
    @PostMapping("/{id}/lessons/{lessonId}/complete")
    public ResponseEntity<Void> completeLesson(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long lessonId) {
        classroomService.completeLesson(me.getUser(), id, lessonId);
        return ResponseEntity.noContent().build();
    }

    /** Cập nhật thông tin / cài đặt lớp học (Chủ lớp) */
    @PutMapping("/{id}")
    public ResponseEntity<ClassroomResponse> updateClassroom(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @Valid @RequestBody UpdateClassroomRequest req) {
        return ResponseEntity.ok(classroomService.updateClassroom(me.getUser(), id, req));
    }

    /** Thêm buổi học mới vào lớp (Chủ lớp) */
    @PostMapping("/{id}/lessons")
    public ResponseEntity<ClassroomResponse.LessonResponse> addLesson(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @Valid @RequestBody AddLessonRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(classroomService.addLesson(me.getUser(), id, req));
    }

    /** Xóa một buổi học khỏi lớp (Chủ lớp) */
    @DeleteMapping("/{id}/lessons/{lessonId}")
    public ResponseEntity<Void> deleteLesson(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long lessonId) {
        classroomService.deleteLesson(me.getUser(), id, lessonId);
        return ResponseEntity.noContent().build();
    }

    /** Xem danh sách học viên đã hoàn thành / chưa hoàn thành buổi học (Chủ lớp) */
    @GetMapping("/{id}/lessons/{lessonId}/submissions")
    public ResponseEntity<List<LessonSubmissionDto>> getLessonSubmissions(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long lessonId) {
        return ResponseEntity.ok(classroomService.getLessonSubmissions(me.getUser(), id, lessonId));
    }

    /** Lấy danh sách thông báo bảng tin lớp học */
    @GetMapping("/{id}/announcements")
    public ResponseEntity<List<AnnouncementDto>> getAnnouncements(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id) {
        return ResponseEntity.ok(classroomService.getAnnouncements(me.getUser(), id));
    }

    /** Đăng thông báo mới lên bảng tin (Chủ lớp) */
    @PostMapping("/{id}/announcements")
    public ResponseEntity<AnnouncementDto> createAnnouncement(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @Valid @RequestBody CreateAnnouncementRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(classroomService.createAnnouncement(me.getUser(), id, req));
    }

    /** Xóa bài thông báo (Chủ lớp hoặc tác giả) */
    @DeleteMapping("/{id}/announcements/{announcementId}")
    public ResponseEntity<Void> deleteAnnouncement(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long announcementId) {
        classroomService.deleteAnnouncement(me.getUser(), id, announcementId);
        return ResponseEntity.noContent().build();
    }

    /** Gửi bình luận dưới bài thông báo */
    @PostMapping("/{id}/announcements/{announcementId}/comments")
    public ResponseEntity<AnnouncementDto.CommentDto> addComment(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long announcementId,
            @Valid @RequestBody CreateCommentRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(classroomService.addComment(me.getUser(), id, announcementId, req));
    }

    /** Xóa bình luận */
    @DeleteMapping("/{id}/announcements/{announcementId}/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long id,
            @PathVariable Long announcementId,
            @PathVariable Long commentId) {
        classroomService.deleteComment(me.getUser(), id, announcementId, commentId);
        return ResponseEntity.noContent().build();
    }
}
