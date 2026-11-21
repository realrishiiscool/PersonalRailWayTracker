CREATE DATABASE IF NOT EXISTS railway_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE railway_tracker;

CREATE TABLE IF NOT EXISTS stations (
  station_code VARCHAR(8) PRIMARY KEY, name VARCHAR(160) NOT NULL, city VARCHAR(120), state VARCHAR(100),
  latitude DECIMAL(9,6), longitude DECIMAL(9,6), zone_code VARCHAR(8), division_name VARCHAR(120),
  platform_count SMALLINT UNSIGNED, is_junction BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX idx_station_name (name), INDEX idx_station_city (city), INDEX idx_station_zone (zone_code)
);
CREATE TABLE IF NOT EXISTS trains (
  train_number VARCHAR(8) PRIMARY KEY, name VARCHAR(180) NOT NULL, train_type VARCHAR(40), zone_code VARCHAR(8),
  frequency VARCHAR(30), source_code VARCHAR(8), destination_code VARCHAR(8),
  FOREIGN KEY (source_code) REFERENCES stations(station_code), FOREIGN KEY (destination_code) REFERENCES stations(station_code),
  INDEX idx_train_name (name)
);
CREATE TABLE IF NOT EXISTS train_stops (
  train_number VARCHAR(8) NOT NULL, sequence_no SMALLINT UNSIGNED NOT NULL, station_code VARCHAR(8) NOT NULL,
  arrival_time TIME, departure_time TIME, halt_minutes SMALLINT UNSIGNED DEFAULT 0, distance_km DECIMAL(7,2),
  platform VARCHAR(8), day_offset SMALLINT UNSIGNED DEFAULT 0,
  PRIMARY KEY (train_number, sequence_no), FOREIGN KEY (train_number) REFERENCES trains(train_number) ON DELETE CASCADE,
  FOREIGN KEY (station_code) REFERENCES stations(station_code), INDEX idx_stop_station (station_code)
);
CREATE TABLE IF NOT EXISTS train_running_days (
  train_number VARCHAR(8) NOT NULL, weekday TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (train_number, weekday), FOREIGN KEY (train_number) REFERENCES trains(train_number) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS live_positions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, train_number VARCHAR(8) NOT NULL, latitude DECIMAL(9,6), longitude DECIMAL(9,6),
  speed_kmh DECIMAL(5,2), heading_degrees SMALLINT UNSIGNED, current_station_code VARCHAR(8), next_station_code VARCHAR(8),
  distance_to_next_km DECIMAL(7,2), eta_next DATETIME, delay_minutes SMALLINT, source VARCHAR(40), received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (train_number) REFERENCES trains(train_number), INDEX idx_position_latest (train_number, received_at)
);
CREATE TABLE IF NOT EXISTS locomotives (
  locomotive_number VARCHAR(16) PRIMARY KEY, class_name VARCHAR(30), traction ENUM('electric','diesel','other'), shed VARCHAR(100), zone_code VARCHAR(8),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS train_rakes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, train_number VARCHAR(8) NOT NULL, effective_from DATE, effective_to DATE,
  locomotive_number VARCHAR(16), coach_count SMALLINT UNSIGNED, notes VARCHAR(255), FOREIGN KEY (train_number) REFERENCES trains(train_number),
  FOREIGN KEY (locomotive_number) REFERENCES locomotives(locomotive_number)
);
CREATE TABLE IF NOT EXISTS rake_coaches (
  rake_id BIGINT UNSIGNED NOT NULL, position_no SMALLINT UNSIGNED NOT NULL, coach_code VARCHAR(12) NOT NULL,
  coach_type VARCHAR(40), orientation ENUM('front','rear','middle') DEFAULT 'middle', PRIMARY KEY (rake_id, position_no),
  FOREIGN KEY (rake_id) REFERENCES train_rakes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS provider_sync_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(50) NOT NULL, dataset VARCHAR(80) NOT NULL,
  outcome ENUM('success','partial','error') NOT NULL, records_changed INT UNSIGNED DEFAULT 0, message VARCHAR(500),
  started_at DATETIME NOT NULL, completed_at DATETIME, INDEX idx_sync_dataset (dataset, started_at)
);
