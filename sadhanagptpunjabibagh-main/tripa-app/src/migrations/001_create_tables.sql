-- ============================================================
-- Tripa RideConnect Database Schema
-- Run this SQL directly in your Hostinger phpMyAdmin or MySQL client
-- Database: u451874010_app
-- ============================================================

-- ─── USERS TABLE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  name        VARCHAR(120)  NOT NULL,
  mobile      VARCHAR(20)   NOT NULL,
  password    VARCHAR(255)  NOT NULL,
  role        ENUM('driver','rider') NOT NULL DEFAULT 'driver',
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_mobile (mobile),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── VEHICLES TABLE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  user_id        CHAR(36)     NOT NULL,
  vehicle_number VARCHAR(30)  NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_vehicles_user_id (user_id),
  INDEX idx_vehicles_number (vehicle_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── RIDES TABLE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rides (
  id                CHAR(36)        NOT NULL PRIMARY KEY,
  user_id           CHAR(36)        NOT NULL,
  vehicle_id        CHAR(36)        NULL,
  driver_name       VARCHAR(120)    NOT NULL,
  phone_number      VARCHAR(20)     NOT NULL,
  vehicle_number    VARCHAR(30)     NOT NULL,
  from_location     VARCHAR(255)    NOT NULL,
  from_lat          DECIMAL(10, 8)  NULL,
  from_lng          DECIMAL(11, 8)  NULL,
  to_location       VARCHAR(255)    NOT NULL,
  to_lat            DECIMAL(10, 8)  NULL,
  to_lng            DECIMAL(11, 8)  NULL,
  travel_date       DATE            NOT NULL,
  travel_time       TIME            NOT NULL DEFAULT '00:00:00',
  booking_frequency ENUM('today_only','every_day','week_days','specific_date') NOT NULL DEFAULT 'today_only',
  weekdays          JSON            NULL,
  specific_date     DATE            NULL,
  price             DECIMAL(10,2)   NULL,
  price_mode        ENUM('fixed','negotiable') NOT NULL DEFAULT 'fixed',
  max_luggage       ENUM('none','small','medium','large') NOT NULL DEFAULT 'medium',
  status            ENUM('active','inactive','completed','cancelled') NOT NULL DEFAULT 'active',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rides_user    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_rides_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE SET NULL,
  INDEX idx_rides_user_id       (user_id),
  INDEX idx_rides_status        (status),
  INDEX idx_rides_travel_date   (travel_date),
  INDEX idx_rides_from_location (from_location(50)),
  INDEX idx_rides_to_location   (to_location(50)),
  INDEX idx_rides_phone         (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
