package com.pbl6.flashcard.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

/**
 * Worker bóc tách tài liệu chạy nền trong cùng tiến trình (1 instance, chưa cần hàng đợi ngoài).
 * Bảng extraction_jobs là nguồn sự thật; restart = job dở dang bị đánh FAILED (ExtractionService#failOrphans).
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    public static final String EXTRACTION_EXECUTOR = "extractionExecutor";

    @Bean(EXTRACTION_EXECUTOR)
    public ThreadPoolTaskExecutor extractionExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setThreadNamePrefix("extract-");
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(4);
        ex.setQueueCapacity(50);
        // Hàng đợi đầy -> ném RejectedExecutionException -> ExtractionService trả 429 thay vì chạy trên thread web
        ex.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        ex.setWaitForTasksToCompleteOnShutdown(false);
        return ex;
    }
}
