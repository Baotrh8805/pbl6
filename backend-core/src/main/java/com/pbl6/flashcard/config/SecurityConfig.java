package com.pbl6.flashcard.config;

import com.pbl6.flashcard.security.CustomUserDetailsService;
import com.pbl6.flashcard.security.JwtAuthenticationFilter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {
    public SecurityConfig(CustomUserDetailsService userDetailsService, JwtAuthenticationFilter jwtAuthFilter,
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        this.userDetailsService = userDetailsService;
        this.jwtAuthFilter = jwtAuthFilter;
        this.allowedOrigins = allowedOrigins;
    }

    private final CustomUserDetailsService userDetailsService;
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final List<String> allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // CorsFilter tự dựng (không qua .cors()) để origin bị từ chối nhận 403 JSON tiếng Việt thay vì chữ thô "Invalid CORS request"
        CorsFilter corsFilter = new CorsFilter(corsConfigurationSource());
        corsFilter.setCorsProcessor(new JsonCorsProcessor());
        http
                .cors(AbstractHttpConfigurer::disable)
                .addFilterAt(corsFilter, CorsFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Chỉ login/register là công khai. /me, /profile, /password, /jlpt-level thao
                        // tác
                        // trên tài khoản đang đăng nhập -> phải có token, thiếu token là 401 chứ không
                        // phải NPE 500.
                        .requestMatchers("/api/auth/login", "/api/auth/register",
                                "/api/auth/forgot-password", "/api/auth/reset-password",
                                "/api/auth/refresh", "/api/auth/logout").permitAll()
                        // Người chưa xác thực email / bị khoá không có token: xác thực, xin gửi lại link, gửi khiếu nại
                        .requestMatchers("/api/auth/verify-email", "/api/auth/resend-verification",
                                "/api/auth/appeals").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll() // Mở khóa
                                                                                                              // Swagger
                        .requestMatchers("/error").permitAll()
                        // Mọi vai trò đã đăng nhập: hồ sơ, đổi mật khẩu, thông báo hệ thống
                        .requestMatchers("/api/auth/**", "/api/announcement", "/api/notifications/**").authenticated()
                        // Admin Panel: staff (ADMIN; SUPER_ADMIN qua RoleHierarchy); đổi vai trò / sửa cấu hình nâng bậc bằng @PreAuthorize
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // API học tập chỉ cho người học: staff bị 403 (một tài khoản một vai trò)
                        .anyRequest().hasRole("USER")
                )
                // Thiếu/sai/hết hạn token -> 401 (mặc định Spring trả 403, làm interceptor 401 ở
                // frontend không bao giờ chạy). 403 chỉ dành cho "đã đăng nhập nhưng không có quyền".
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** SUPER_ADMIN > ADMIN; USER đứng ngoài. Spring Security 6.x tự dùng bean này cho cả URL lẫn @PreAuthorize. */
    @Bean
    public RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.fromHierarchy("ROLE_SUPER_ADMIN > ROLE_ADMIN");
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(); // Mã hóa mật khẩu
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins); // app.cors.allowed-origins, không dùng "*"
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
