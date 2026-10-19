package com.pbl6.flashcard.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Gửi email chứa một liên kết về frontend (đặt lại mật khẩu, xác thực email). Tách từ PasswordResetService để hai luồng dùng
 * chung một cách gửi: cùng địa chỉ người gửi, cùng cách xử lý lỗi, cùng chế độ dev.
 * Không cấu hình SMTP (spring.mail.host): không có bean JavaMailSender -> link được ghi vào log để dev dùng - KHÔNG dùng cách
 * này khi triển khai thật.
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final ObjectProvider<JavaMailSender> mailSender;
    private final String frontendUrl;
    private final String mailFrom;

    public MailService(ObjectProvider<JavaMailSender> mailSender,
                       @Value("${app.frontend-url}") String frontendUrl,
                       @Value("${app.mail.from}") String mailFrom) {
        this.mailSender = mailSender;
        this.frontendUrl = frontendUrl.replaceAll("/+$", "");
        this.mailFrom = mailFrom;
    }

    /** Link tuyệt đối tới trang frontend, vd. frontendLink("/verify-email?token=abc"). */
    public String frontendLink(String pathAndQuery) {
        return frontendUrl + pathAndQuery;
    }

    /**
     * purpose là cụm từ cho log ("đặt lại mật khẩu", "xác thực email"). Lỗi gửi chỉ ghi log, không ném: các luồng gọi đều trả
     * thông báo chung cho client (không lộ email tồn tại), và người dùng luôn có đường xin gửi lại.
     */
    public void sendLink(String to, String purpose, String subject, String body, String link) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.warn("Chưa cấu hình SMTP (spring.mail.host) - link {} cho {}: {}", purpose, to, link);
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailFrom);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);
        try {
            sender.send(message);
        } catch (MailException e) {
            // Không lộ cho client (vẫn trả thông báo chung), chỉ ghi log để vận hành xử lý
            log.error("Gửi email {} thất bại cho {}", purpose, to, e);
        }
    }
}
