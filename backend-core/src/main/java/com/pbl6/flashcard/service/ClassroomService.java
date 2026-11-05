package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.classroom.*;
import com.pbl6.flashcard.model.*;
import com.pbl6.flashcard.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ClassroomService {

    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ClassroomRepository classroomRepo;
    private final ClassroomMemberRepository memberRepo;
    private final ClassroomLessonRepository lessonRepo;
    private final ClassroomLessonProgressRepository progressRepo;
    private final UserRepository userRepo;
    private final ClassroomAnnouncementRepository announcementRepo;
    private final ClassroomAnnouncementCommentRepository commentRepo;

    public ClassroomService(ClassroomRepository classroomRepo,
                            ClassroomMemberRepository memberRepo,
                            ClassroomLessonRepository lessonRepo,
                            ClassroomLessonProgressRepository progressRepo,
                            UserRepository userRepo,
                            ClassroomAnnouncementRepository announcementRepo,
                            ClassroomAnnouncementCommentRepository commentRepo) {
        this.classroomRepo = classroomRepo;
        this.memberRepo = memberRepo;
        this.lessonRepo = lessonRepo;
        this.progressRepo = progressRepo;
        this.userRepo = userRepo;
        this.announcementRepo = announcementRepo;
        this.commentRepo = commentRepo;
    }

    private String generateUniqueCode(String jlptLevel) {
        String prefix = (jlptLevel != null && !jlptLevel.isBlank()) ? jlptLevel.toUpperCase() : "JP";
        if (prefix.length() > 3) prefix = prefix.substring(0, 3);

        for (int i = 0; i < 10; i++) {
            StringBuilder sb = new StringBuilder(prefix).append("-");
            for (int j = 0; j < 4; j++) {
                sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())));
            }
            String code = sb.toString();
            if (!classroomRepo.existsByCode(code)) {
                return code;
            }
        }
        return UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    @Transactional
    public ClassroomResponse createClassroom(User user, CreateClassroomRequest req) {
        // Chỉ tài khoản Premium mới được tạo lớp học
        if (!Boolean.TRUE.equals(user.getIsPremium())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ tài khoản Premium mới có quyền tạo lớp học.");
        }

        Classroom c = new Classroom();
        c.setName(req.name().trim());
        c.setDescription(req.description());
        c.setJlptLevel(req.jlptLevel() != null ? req.jlptLevel() : "N5");
        c.setPrivacy(Classroom.PRIVACY_PUBLIC.equalsIgnoreCase(req.privacy()) ? Classroom.PRIVACY_PUBLIC : Classroom.PRIVACY_PRIVATE);
        c.setMaxStudents(req.maxStudents() != null && req.maxStudents() > 0 ? req.maxStudents() : 30);
        c.setOwnerId(user.getId());
        c.setCode(generateUniqueCode(c.getJlptLevel()));
        c = classroomRepo.save(c);

        // Giáo viên làm chủ lớp, tự động có vai trò TEACHER và APPROVED
        ClassroomMember teacherMember = new ClassroomMember(c.getId(), user.getId(), ClassroomMember.ROLE_TEACHER, ClassroomMember.STATUS_APPROVED);
        memberRepo.save(teacherMember);

        // Lưu các buổi học nếu có
        List<ClassroomResponse.LessonResponse> lessonResponses = new ArrayList<>();
        if (req.lessons() != null && !req.lessons().isEmpty()) {
            for (int i = 0; i < req.lessons().size(); i++) {
                var lReq = req.lessons().get(i);
                ClassroomLesson lesson = new ClassroomLesson();
                lesson.setClassroomId(c.getId());
                lesson.setOrderIndex(lReq.orderIndex() != null ? lReq.orderIndex() : (i + 1));
                lesson.setTitle(lReq.title() != null ? lReq.title().trim() : "Buổi " + (i + 1));
                lesson.setScheduledDate(lReq.scheduledDate());
                lesson.setHasQuiz(Boolean.TRUE.equals(lReq.hasQuiz()));
                lesson.setQuizDurationMinutes(lReq.quizDurationMinutes() != null ? lReq.quizDurationMinutes() : 15);
                if (lReq.deckIds() != null) {
                    lesson.setDeckIds(new ArrayList<>(lReq.deckIds()));
                }
                lesson = lessonRepo.save(lesson);

                lessonResponses.add(new ClassroomResponse.LessonResponse(
                        lesson.getId(),
                        lesson.getOrderIndex(),
                        lesson.getTitle(),
                        lesson.getScheduledDate(),
                        lesson.getHasQuiz(),
                        lesson.getQuizDurationMinutes(),
                        lesson.getDeckIds() != null ? new ArrayList<>(lesson.getDeckIds()) : Collections.emptyList(),
                        false,
                        null,
                        0L
                ));
            }
        }

        return toClassroomResponse(c, user, user.getFullName(), 1L, 0L, true, ClassroomMember.STATUS_APPROVED, lessonResponses);
    }

    @Transactional(readOnly = true)
    public List<ClassroomResponse> getMyTeachingClassrooms(User user) {
        List<Classroom> classrooms = classroomRepo.findByOwnerIdOrderByCreatedAtDesc(user.getId());
        return classrooms.stream().map(c -> {
            long members = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
            long pending = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_PENDING);
            return toClassroomResponse(c, user, user.getFullName(), members, pending, true, ClassroomMember.STATUS_APPROVED, Collections.emptyList());
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ClassroomResponse> getMyEnrolledClassrooms(User user) {
        List<ClassroomMember> memberships = memberRepo.findByUserIdAndStatus(user.getId(), ClassroomMember.STATUS_APPROVED);
        List<ClassroomResponse> result = new ArrayList<>();

        for (ClassroomMember m : memberships) {
            Optional<Classroom> cOpt = classroomRepo.findById(m.getClassroomId());
            if (cOpt.isEmpty()) continue;
            Classroom c = cOpt.get();
            // Bỏ qua lớp do chính mình làm chủ (đã có ở mục Teaching)
            if (c.getOwnerId().equals(user.getId())) continue;

            String ownerName = userRepo.findById(c.getOwnerId()).map(User::getFullName).orElse("Giáo viên");
            long members = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
            result.add(toClassroomResponse(c, user, ownerName, members, 0L, false, m.getStatus(), Collections.emptyList()));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public ClassroomResponse getClassroomDetail(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));

        boolean isOwner = c.getOwnerId().equals(user.getId());
        Optional<ClassroomMember> myMember = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());

        if (!isOwner && myMember.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chưa tham gia lớp học này.");
        }

        String myStatus = myMember.map(ClassroomMember::getStatus).orElse(isOwner ? ClassroomMember.STATUS_APPROVED : "NONE");
        if (!isOwner && ClassroomMember.STATUS_PENDING.equals(myStatus)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Yêu cầu tham gia của bạn đang chờ giáo viên duyệt.");
        }

        String ownerName = userRepo.findById(c.getOwnerId()).map(User::getFullName).orElse("Giáo viên");
        long memberCount = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
        long pendingCount = isOwner ? memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_PENDING) : 0L;

        List<ClassroomLesson> lessons = lessonRepo.findByClassroomIdOrderByOrderIndexAsc(c.getId());
        List<Long> lessonIds = lessons.stream().map(ClassroomLesson::getId).filter(Objects::nonNull).toList();
        Map<Long, ClassroomLessonProgress> progressMap = lessonIds.isEmpty()
                ? Collections.emptyMap()
                : progressRepo.findByLessonIdInAndUserId(lessonIds, user.getId())
                        .stream().collect(Collectors.toMap(ClassroomLessonProgress::getLessonId, p -> p, (a, b) -> a));

        // Thống kê số học viên đã hoàn thành cho từng buổi học
        Map<Long, Long> completedCountsMap = new HashMap<>();
        if (!lessonIds.isEmpty()) {
            List<Object[]> rows = progressRepo.countCompletedByLessonIds(lessonIds);
            for (Object[] r : rows) {
                if (r[0] != null && r[1] != null) {
                    completedCountsMap.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
                }
            }
        }

        List<ClassroomResponse.LessonResponse> lessonResponses = lessons.stream().map(l -> {
            ClassroomLessonProgress p = progressMap.get(l.getId());
            return new ClassroomResponse.LessonResponse(
                    l.getId(),
                    l.getOrderIndex(),
                    l.getTitle(),
                    l.getScheduledDate(),
                    l.getHasQuiz(),
                    l.getQuizDurationMinutes(),
                    l.getDeckIds() != null ? new ArrayList<>(l.getDeckIds()) : Collections.emptyList(),
                    p != null && Boolean.TRUE.equals(p.getIsCompleted()),
                    p != null ? p.getQuizScore() : null,
                    completedCountsMap.getOrDefault(l.getId(), 0L)
            );
        }).toList();

        return toClassroomResponse(c, user, ownerName, memberCount, pendingCount, isOwner, myStatus, lessonResponses);
    }

    @Transactional
    public Map<String, Object> joinClassroom(User user, String code) {
        Classroom c = classroomRepo.findByCode(code.trim().toUpperCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mã lớp học không hợp lệ hoặc không tồn tại."));

        if (c.getOwnerId().equals(user.getId())) {
            return Map.of("classroomId", c.getId(), "status", ClassroomMember.STATUS_APPROVED, "message", "Bạn là chủ sở hữu lớp học này.");
        }

        Optional<ClassroomMember> existing = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());
        if (existing.isPresent()) {
            return Map.of("classroomId", c.getId(), "status", existing.get().getStatus(), "message", "Bạn đã tham gia hoặc đang chờ duyệt lớp này.");
        }

        long currentApproved = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
        if (c.getMaxStudents() != null && currentApproved >= c.getMaxStudents()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lớp học đã đạt sĩ số tối đa (" + c.getMaxStudents() + " học viên).");
        }

        // Lớp công khai: duyệt thẳng. Lớp riêng tư: chờ duyệt
        String newStatus = Classroom.PRIVACY_PUBLIC.equalsIgnoreCase(c.getPrivacy())
                ? ClassroomMember.STATUS_APPROVED
                : ClassroomMember.STATUS_PENDING;

        ClassroomMember m = new ClassroomMember(c.getId(), user.getId(), ClassroomMember.ROLE_STUDENT, newStatus);
        memberRepo.save(m);

        String msg = ClassroomMember.STATUS_APPROVED.equals(newStatus)
                ? "Tham gia lớp học thành công!"
                : "Đã gửi yêu cầu tham gia lớp. Vui lòng chờ giáo viên xác nhận.";

        return Map.of("classroomId", c.getId(), "status", newStatus, "message", msg);
    }

    @Transactional(readOnly = true)
    public List<ClassroomMemberDto> getPendingMembers(User user, Long classroomId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        List<ClassroomMember> pending = memberRepo.findByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_PENDING);
        return toMemberDtos(c.getId(), pending);
    }

    @Transactional(readOnly = true)
    public List<ClassroomMemberDto> getApprovedMembers(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        List<ClassroomMember> approved = memberRepo.findByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
        return toMemberDtos(c.getId(), approved);
    }

    @Transactional
    public void completeLesson(User user, Long classroomId, Long lessonId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));

        ClassroomLesson lesson = lessonRepo.findById(lessonId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));

        if (!lesson.getClassroomId().equals(c.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Buổi học không thuộc lớp học này.");
        }

        boolean isOwner = c.getOwnerId().equals(user.getId());
        Optional<ClassroomMember> member = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());
        if (!isOwner && (member.isEmpty() || !ClassroomMember.STATUS_APPROVED.equals(member.get().getStatus()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không phải thành viên chính thức của lớp học này.");
        }

        ClassroomLessonProgress progress = progressRepo.findByLessonIdAndUserId(lesson.getId(), user.getId())
                .orElse(new ClassroomLessonProgress(lesson.getId(), user.getId()));

        progress.setIsCompleted(true);
        if (progress.getCompletedAt() == null) {
            progress.setCompletedAt(Instant.now());
        }
        progressRepo.save(progress);
    }

    @Transactional
    public void approveMember(User user, Long classroomId, Long targetUserId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        ClassroomMember m = memberRepo.findByClassroomIdAndUserId(c.getId(), targetUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy yêu cầu của học viên."));
        m.setStatus(ClassroomMember.STATUS_APPROVED);
        m.setJoinedAt(Instant.now());
        memberRepo.save(m);
    }

    @Transactional
    public void rejectMember(User user, Long classroomId, Long targetUserId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        memberRepo.deleteByClassroomIdAndUserId(c.getId(), targetUserId);
    }

    @Transactional
    public void removeMember(User user, Long classroomId, Long targetUserId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        if (c.getOwnerId().equals(targetUserId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể xóa chủ lớp khỏi lớp học.");
        }
        memberRepo.deleteByClassroomIdAndUserId(c.getId(), targetUserId);
    }

    private Classroom getOwnedClassroom(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        if (!c.getOwnerId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản lý lớp học này.");
        }
        return c;
    }

    private List<ClassroomMemberDto> toMemberDtos(Long classroomId, List<ClassroomMember> members) {
        if (members == null || members.isEmpty()) return Collections.emptyList();
        List<Long> userIds = members.stream().map(ClassroomMember::getUserId).filter(Objects::nonNull).distinct().toList();
        Map<Long, User> userMap = userIds.isEmpty()
                ? Collections.emptyMap()
                : userRepo.findAllById(userIds).stream()
                        .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        List<ClassroomLesson> lessons = lessonRepo.findByClassroomIdOrderByOrderIndexAsc(classroomId);
        List<Long> lessonIds = lessons.stream().map(ClassroomLesson::getId).filter(Objects::nonNull).toList();
        Map<Long, Long> userCompletedMap = new HashMap<>();
        if (!lessonIds.isEmpty()) {
            List<Object[]> rows = progressRepo.countCompletedByUserAndLessonIds(lessonIds);
            for (Object[] r : rows) {
                if (r[0] != null && r[1] != null) {
                    userCompletedMap.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
                }
            }
        }

        return members.stream().map(m -> {
            User u = userMap.get(m.getUserId());
            return new ClassroomMemberDto(
                    m.getUserId(),
                    u != null && u.getFullName() != null ? u.getFullName() : "Học viên",
                    u != null && u.getEmail() != null ? u.getEmail() : "",
                    m.getRole() != null ? m.getRole() : ClassroomMember.ROLE_STUDENT,
                    m.getStatus() != null ? m.getStatus() : ClassroomMember.STATUS_APPROVED,
                    m.getJoinedAt(),
                    userCompletedMap.getOrDefault(m.getUserId(), 0L)
            );
        }).toList();
    }

    @Transactional
    public ClassroomResponse updateClassroom(User user, Long classroomId, UpdateClassroomRequest req) {
        Classroom c = getOwnedClassroom(user, classroomId);

        long currentApproved = memberRepo.countByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
        if (req.maxStudents() != null) {
            if (req.maxStudents() < currentApproved) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Sĩ số tối đa không thể nhỏ hơn số học viên hiện tại trong lớp (" + currentApproved + " bạn).");
            }
            c.setMaxStudents(req.maxStudents());
        }

        c.setName(req.name().trim());
        c.setDescription(req.description());
        if (req.jlptLevel() != null && !req.jlptLevel().isBlank()) {
            c.setJlptLevel(req.jlptLevel());
        }
        if (req.privacy() != null && !req.privacy().isBlank()) {
            c.setPrivacy(Classroom.PRIVACY_PUBLIC.equalsIgnoreCase(req.privacy()) ? Classroom.PRIVACY_PUBLIC : Classroom.PRIVACY_PRIVATE);
        }
        c.setUpdatedAt(Instant.now());
        classroomRepo.save(c);

        if (req.lessons() != null) {
            List<ClassroomLesson> existingLessons = lessonRepo.findByClassroomIdOrderByOrderIndexAsc(c.getId());
            Set<Long> retainedIds = req.lessons().stream()
                    .map(UpdateClassroomRequest.LessonItemRequest::id)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            // Xóa các buổi học không còn nằm trong danh sách cập nhật
            for (ClassroomLesson old : existingLessons) {
                if (!retainedIds.contains(old.getId())) {
                    lessonRepo.delete(old);
                }
            }

            // Cập nhật các buổi cũ hoặc tạo buổi mới
            for (int i = 0; i < req.lessons().size(); i++) {
                UpdateClassroomRequest.LessonItemRequest item = req.lessons().get(i);
                ClassroomLesson lesson = null;
                if (item.id() != null) {
                    lesson = lessonRepo.findById(item.id()).orElse(null);
                }
                if (lesson == null) {
                    lesson = new ClassroomLesson();
                    lesson.setClassroomId(c.getId());
                }
                lesson.setOrderIndex(i + 1);
                lesson.setTitle(item.title() != null ? item.title().trim() : "Buổi " + (i + 1));
                lesson.setScheduledDate(item.scheduledDate());
                if (item.deckIds() != null) {
                    lesson.setDeckIds(new ArrayList<>(item.deckIds()));
                }
                lessonRepo.save(lesson);
            }
        }

        return getClassroomDetail(user, c.getId());
    }

    @Transactional
    public ClassroomResponse.LessonResponse addLesson(User user, Long classroomId, AddLessonRequest req) {
        Classroom c = getOwnedClassroom(user, classroomId);
        List<ClassroomLesson> existing = lessonRepo.findByClassroomIdOrderByOrderIndexAsc(c.getId());
        int nextOrder = req.orderIndex() != null ? req.orderIndex() : (existing.size() + 1);

        ClassroomLesson lesson = new ClassroomLesson();
        lesson.setClassroomId(c.getId());
        lesson.setOrderIndex(nextOrder);
        lesson.setTitle(req.title().trim());
        lesson.setScheduledDate(req.scheduledDate());
        lesson.setHasQuiz(Boolean.TRUE.equals(req.hasQuiz()));
        lesson.setQuizDurationMinutes(req.quizDurationMinutes() != null ? req.quizDurationMinutes() : 15);
        if (req.deckIds() != null) {
            lesson.setDeckIds(new ArrayList<>(req.deckIds()));
        }
        lesson = lessonRepo.save(lesson);

        return new ClassroomResponse.LessonResponse(
                lesson.getId(),
                lesson.getOrderIndex(),
                lesson.getTitle(),
                lesson.getScheduledDate(),
                lesson.getHasQuiz(),
                lesson.getQuizDurationMinutes(),
                lesson.getDeckIds() != null ? new ArrayList<>(lesson.getDeckIds()) : Collections.emptyList(),
                false,
                null,
                0L
        );
    }

    @Transactional
    public void deleteLesson(User user, Long classroomId, Long lessonId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        ClassroomLesson lesson = lessonRepo.findById(lessonId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));
        if (!lesson.getClassroomId().equals(c.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Buổi học không thuộc lớp này.");
        }
        lessonRepo.delete(lesson);
    }

    @Transactional(readOnly = true)
    public List<LessonSubmissionDto> getLessonSubmissions(User user, Long classroomId, Long lessonId) {
        Classroom c = getOwnedClassroom(user, classroomId);
        ClassroomLesson lesson = lessonRepo.findById(lessonId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));
        if (!lesson.getClassroomId().equals(c.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Buổi học không thuộc lớp này.");
        }

        List<ClassroomMember> members = memberRepo.findByClassroomIdAndStatus(c.getId(), ClassroomMember.STATUS_APPROVED);
        List<Long> userIds = members.stream().map(ClassroomMember::getUserId).toList();
        Map<Long, User> userMap = userIds.isEmpty() ? Collections.emptyMap() :
                userRepo.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        return members.stream()
                .filter(m -> !m.getUserId().equals(c.getOwnerId()))
                .map(m -> {
                    User u = userMap.get(m.getUserId());
                    Optional<ClassroomLessonProgress> pOpt = progressRepo.findByLessonIdAndUserId(lesson.getId(), m.getUserId());
                    boolean completed = pOpt.map(p -> Boolean.TRUE.equals(p.getIsCompleted())).orElse(false);
                    Instant completedAt = pOpt.map(ClassroomLessonProgress::getCompletedAt).orElse(null);
                    Integer quizScore = pOpt.map(ClassroomLessonProgress::getQuizScore).orElse(null);
                    return new LessonSubmissionDto(
                            m.getUserId(),
                            u != null ? u.getFullName() : "Học viên",
                            u != null ? u.getEmail() : "",
                            completed,
                            completedAt,
                            quizScore
                    );
                }).toList();
    }

    @Transactional(readOnly = true)
    public List<AnnouncementDto> getAnnouncements(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));

        boolean isOwner = c.getOwnerId().equals(user.getId());
        Optional<ClassroomMember> member = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());
        if (!isOwner && (member.isEmpty() || !ClassroomMember.STATUS_APPROVED.equals(member.get().getStatus()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chưa tham gia lớp học này.");
        }

        List<ClassroomAnnouncement> list = announcementRepo.findByClassroomIdOrderByIsPinnedDescCreatedAtDesc(c.getId());
        if (list.isEmpty()) return Collections.emptyList();

        List<Long> announcementIds = list.stream().map(ClassroomAnnouncement::getId).toList();
        List<ClassroomAnnouncementComment> allComments = commentRepo.findByAnnouncementIdInOrderByCreatedAtAsc(announcementIds);

        Set<Long> authorIds = new HashSet<>();
        list.forEach(a -> authorIds.add(a.getAuthorId()));
        allComments.forEach(cm -> authorIds.add(cm.getUserId()));

        Map<Long, String> nameMap = userRepo.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName, (a, b) -> a));

        Map<Long, List<ClassroomAnnouncementComment>> commentGroup = allComments.stream()
                .collect(Collectors.groupingBy(ClassroomAnnouncementComment::getAnnouncementId));

        return list.stream().map(a -> {
            List<AnnouncementDto.CommentDto> commentDtos = commentGroup.getOrDefault(a.getId(), Collections.emptyList())
                    .stream().map(cm -> new AnnouncementDto.CommentDto(
                            cm.getId(),
                            cm.getAnnouncementId(),
                            cm.getUserId(),
                            nameMap.getOrDefault(cm.getUserId(), "Thành viên"),
                            cm.getContent(),
                            cm.getCreatedAt()
                    )).toList();

            return new AnnouncementDto(
                    a.getId(),
                    a.getClassroomId(),
                    a.getAuthorId(),
                    nameMap.getOrDefault(a.getAuthorId(), "Giáo viên"),
                    a.getTitle(),
                    a.getContent(),
                    a.getIsPinned(),
                    a.getCreatedAt(),
                    commentDtos
            );
        }).toList();
    }

    @Transactional
    public AnnouncementDto createAnnouncement(User user, Long classroomId, CreateAnnouncementRequest req) {
        Classroom c = getOwnedClassroom(user, classroomId);
        ClassroomAnnouncement a = new ClassroomAnnouncement();
        a.setClassroomId(c.getId());
        a.setAuthorId(user.getId());
        a.setTitle(req.title() != null ? req.title().trim() : null);
        a.setContent(req.content().trim());
        a.setIsPinned(Boolean.TRUE.equals(req.isPinned()));
        a.setCreatedAt(Instant.now());
        a = announcementRepo.save(a);

        return new AnnouncementDto(
                a.getId(),
                a.getClassroomId(),
                a.getAuthorId(),
                user.getFullName(),
                a.getTitle(),
                a.getContent(),
                a.getIsPinned(),
                a.getCreatedAt(),
                Collections.emptyList()
        );
    }

    @Transactional
    public void deleteAnnouncement(User user, Long classroomId, Long announcementId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        ClassroomAnnouncement a = announcementRepo.findById(announcementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thông báo."));

        if (!a.getClassroomId().equals(c.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thông báo không thuộc lớp này.");
        }
        if (!c.getOwnerId().equals(user.getId()) && !a.getAuthorId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xóa thông báo này.");
        }
        announcementRepo.delete(a);
    }

    @Transactional
    public AnnouncementDto.CommentDto addComment(User user, Long classroomId, Long announcementId, CreateCommentRequest req) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));

        boolean isOwner = c.getOwnerId().equals(user.getId());
        Optional<ClassroomMember> member = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());
        if (!isOwner && (member.isEmpty() || !ClassroomMember.STATUS_APPROVED.equals(member.get().getStatus()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chưa tham gia lớp học này.");
        }

        ClassroomAnnouncement a = announcementRepo.findById(announcementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thông báo."));

        if (!a.getClassroomId().equals(c.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thông báo không thuộc lớp này.");
        }

        ClassroomAnnouncementComment cm = new ClassroomAnnouncementComment();
        cm.setAnnouncementId(a.getId());
        cm.setUserId(user.getId());
        cm.setContent(req.content().trim());
        cm.setCreatedAt(Instant.now());
        cm = commentRepo.save(cm);

        return new AnnouncementDto.CommentDto(
                cm.getId(),
                cm.getAnnouncementId(),
                cm.getUserId(),
                user.getFullName(),
                cm.getContent(),
                cm.getCreatedAt()
        );
    }

    @Transactional
    public void deleteComment(User user, Long classroomId, Long announcementId, Long commentId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        ClassroomAnnouncementComment cm = commentRepo.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận."));

        if (!cm.getAnnouncementId().equals(announcementId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bình luận không khớp thông báo.");
        }

        if (!c.getOwnerId().equals(user.getId()) && !cm.getUserId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xóa bình luận này.");
        }
        commentRepo.delete(cm);
    }

    private ClassroomResponse toClassroomResponse(Classroom c, User user, String ownerName,
                                                  Long memberCount, Long pendingCount,
                                                  boolean isOwner, String myStatus,
                                                  List<ClassroomResponse.LessonResponse> lessons) {
        return new ClassroomResponse(
                c.getId(),
                c.getName(),
                c.getDescription(),
                c.getCode(),
                c.getJlptLevel(),
                c.getPrivacy(),
                c.getOwnerId(),
                ownerName,
                c.getMaxStudents(),
                memberCount,
                pendingCount,
                isOwner,
                myStatus,
                c.getCreatedAt(),
                lessons
        );
    }
}
