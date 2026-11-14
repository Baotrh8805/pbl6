-- G5/N2 (docs/Plan/plans/2026-10-18-admin-roadmap.md): nền cho thanh toán UC-40.
-- is_premium = true và premium_until null = vĩnh viễn; có hạn -> HousekeepingJob hạ về free khi quá hạn và báo người dùng.
ALTER TABLE users ADD COLUMN premium_until timestamptz(6);
