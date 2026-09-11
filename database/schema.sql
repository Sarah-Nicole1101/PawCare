-- PawCare 1.0 — MySQL 8.0+ / 8.4. All timestamps are UTC.
-- Applied once by scripts/migrate.mjs. No default users or sample medical data.
CREATE TABLE users (
 id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, email_verified_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE authenticators (
 user_id CHAR(36) PRIMARY KEY, secret_cipher TEXT NOT NULL, pending_cipher TEXT,
 pending_until DATETIME(3), enabled_at DATETIME(3), last_step BIGINT NOT NULL DEFAULT -1,
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE recovery_codes (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, code_hash CHAR(64) NOT NULL UNIQUE,
 used_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id), INDEX recovery_user (user_id, used_at)
) ENGINE=InnoDB;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36), level VARCHAR(16) NOT NULL DEFAULT 'anonymous',
 csrf_token CHAR(64) NOT NULL, attempts INT NOT NULL DEFAULT 0, expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id), INDEX session_user (user_id), INDEX session_expiry (expires_at),
 CHECK (level IN ('anonymous','password','enrollment','full'))
) ENGINE=InnoDB;
CREATE TABLE account_tokens (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, purpose VARCHAR(16) NOT NULL,
 expires_at DATETIME(3) NOT NULL, used_at DATETIME(3), FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX token_user (user_id, purpose), CHECK (purpose IN ('verify','reset'))
) ENGINE=InnoDB;
CREATE TABLE rate_limits (
 bucket CHAR(64) PRIMARY KEY, hits INT NOT NULL, expires_at DATETIME(3) NOT NULL,
 INDEX rate_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE security_events (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36), action VARCHAR(80) NOT NULL, detail VARCHAR(200),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX security_user (user_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE households (
 id CHAR(36) PRIMARY KEY, name VARCHAR(120) NOT NULL, timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Manila',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE household_members (
 user_id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, role VARCHAR(10) NOT NULL,
 joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (household_id) REFERENCES households(id),
 CHECK (role IN ('admin','member')), INDEX members_household (household_id, role)
) ENGINE=InnoDB;
CREATE TABLE invitations (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, email VARCHAR(254) NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, created_by CHAR(36) NOT NULL, expires_at DATETIME(3) NOT NULL,
 used_at DATETIME(3), revoked_at DATETIME(3), FOREIGN KEY (household_id) REFERENCES households(id),
 FOREIGN KEY (created_by) REFERENCES users(id), INDEX invitations_household (household_id)
) ENGINE=InnoDB;
CREATE TABLE pets (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL,
 species VARCHAR(40) NOT NULL, breed VARCHAR(100), sex VARCHAR(16) NOT NULL DEFAULT 'unknown',
 birth_date DATE, estimated_age VARCHAR(80), markings VARCHAR(160), neutered BOOLEAN NOT NULL DEFAULT FALSE,
 microchip VARCHAR(60), notes TEXT, archived_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id) REFERENCES households(id), UNIQUE pet_scope (household_id,id),
 CHECK (sex IN ('female','male','unknown')), INDEX pet_names (household_id, name)
) ENGINE=InnoDB;
CREATE TABLE files (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 kind VARCHAR(12) NOT NULL, title VARCHAR(160) NOT NULL, document_type VARCHAR(60),
 storage_key VARCHAR(100) NOT NULL UNIQUE, mime_type VARCHAR(100) NOT NULL, size_bytes INT NOT NULL,
 original_name VARCHAR(200) NOT NULL, notes TEXT, uploaded_by CHAR(36) NOT NULL,
 deleted_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (uploaded_by) REFERENCES users(id),
 CHECK (kind IN ('photo','document')), INDEX files_pet (household_id,pet_id,kind)
) ENGINE=InnoDB;
CREATE TABLE health_records (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, record_type VARCHAR(60) NOT NULL, event_date DATE NOT NULL,
 symptoms TEXT, diagnosis TEXT, procedure_notes TEXT, veterinarian VARCHAR(120), clinic VARCHAR(160),
 follow_up_date DATE, notes TEXT, created_by CHAR(36) NOT NULL, archived_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 INDEX health_pet (household_id,pet_id,event_date)
) ENGINE=InnoDB;
CREATE TABLE vaccinations (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, dose VARCHAR(80), event_date DATE NOT NULL, next_due_date DATE,
 veterinarian VARCHAR(120), clinic VARCHAR(160), batch_number VARCHAR(80), notes TEXT,
 created_by CHAR(36) NOT NULL, archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 INDEX vaccines_pet (household_id,pet_id,next_due_date)
) ENGINE=InnoDB;
CREATE TABLE appointments (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, starts_at DATETIME(3) NOT NULL, clinic VARCHAR(160), veterinarian VARCHAR(120),
 status VARCHAR(16) NOT NULL DEFAULT 'upcoming', notes TEXT, created_by CHAR(36) NOT NULL,
 archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 CHECK (status IN ('upcoming','completed','cancelled','rescheduled')), INDEX appointment_time (household_id,starts_at)
) ENGINE=InnoDB;
CREATE TABLE weight_logs (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 weight_kg DECIMAL(7,3) NOT NULL, event_date DATE NOT NULL, notes TEXT, created_by CHAR(36) NOT NULL,
 archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 CHECK (weight_kg > 0), INDEX weight_pet (household_id,pet_id,event_date)
) ENGINE=InnoDB;
CREATE TABLE feeding_schedules (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, food_type VARCHAR(80), portion_text VARCHAR(80) NOT NULL, notes TEXT,
 created_by CHAR(36) NOT NULL, archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE grooming_records (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, event_date DATE NOT NULL, next_due_date DATE, groomer VARCHAR(120),
 cost DECIMAL(12,2), notes TEXT, created_by CHAR(36) NOT NULL, archived_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 CHECK (cost IS NULL OR cost >= 0)
) ENGINE=InnoDB;
CREATE TABLE expenses (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, category VARCHAR(60) NOT NULL, amount DECIMAL(12,2) NOT NULL,
 event_date DATE NOT NULL, paid_by VARCHAR(100), notes TEXT, created_by CHAR(36) NOT NULL,
 archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 CHECK (amount >= 0), INDEX expenses_month (household_id,event_date)
) ENGINE=InnoDB;
CREATE TABLE medications (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, purpose VARCHAR(200), dosage VARCHAR(80) NOT NULL,
 route VARCHAR(60) NOT NULL, instructions TEXT, veterinarian VARCHAR(120),
 start_date DATE NOT NULL, end_date DATE, status VARCHAR(12) NOT NULL DEFAULT 'active',
 created_by CHAR(36) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 UNIQUE medication_scope (household_id,pet_id,id),
 CHECK (status IN ('active','completed','stopped')), CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB;
CREATE TABLE reminders (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL, category VARCHAR(60) NOT NULL, notes TEXT,
 created_by CHAR(36) NOT NULL, archived_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id), FOREIGN KEY (created_by) REFERENCES users(id),
 UNIQUE reminder_scope (household_id,pet_id,id)
) ENGINE=InnoDB;
CREATE TABLE schedules (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 medication_id CHAR(36), reminder_id CHAR(36), title VARCHAR(160) NOT NULL, detail TEXT,
 recurrence VARCHAR(12) NOT NULL, interval_hours INT, weekdays JSON, local_time CHAR(5),
 timezone VARCHAR(64) NOT NULL, start_at DATETIME(3) NOT NULL, end_at DATETIME(3),
 next_due_at DATETIME(3), active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id,pet_id) REFERENCES pets(household_id,id),
 FOREIGN KEY (household_id,pet_id,medication_id) REFERENCES medications(household_id,pet_id,id),
 FOREIGN KEY (household_id,pet_id,reminder_id) REFERENCES reminders(household_id,pet_id,id),
 UNIQUE schedule_scope (household_id,pet_id,id),
 CHECK ((medication_id IS NOT NULL AND reminder_id IS NULL) OR (medication_id IS NULL AND reminder_id IS NOT NULL)),
 CHECK (recurrence IN ('once','daily','weekly','weekdays','monthly','interval')),
 CHECK (interval_hours IS NULL OR interval_hours BETWEEN 1 AND 8760), INDEX schedule_due (active,next_due_at)
) ENGINE=InnoDB;
CREATE TABLE occurrences (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, pet_id CHAR(36) NOT NULL,
 schedule_id CHAR(36) NOT NULL, due_at DATETIME(3) NOT NULL, title VARCHAR(160) NOT NULL, detail TEXT,
 status VARCHAR(12) NOT NULL DEFAULT 'pending', completed_at DATETIME(3), completed_by CHAR(36),
 FOREIGN KEY (household_id,pet_id,schedule_id) REFERENCES schedules(household_id,pet_id,id),
 FOREIGN KEY (completed_by) REFERENCES users(id), UNIQUE one_occurrence (schedule_id,due_at),
 CHECK (status IN ('pending','done','skipped','cancelled')), INDEX occurrence_due (household_id,status,due_at)
) ENGINE=InnoDB;
CREATE TABLE medication_logs (
 id CHAR(36) PRIMARY KEY, occurrence_id CHAR(36) NOT NULL UNIQUE, user_id CHAR(36) NOT NULL,
 outcome VARCHAR(12) NOT NULL, notes VARCHAR(300), recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (occurrence_id) REFERENCES occurrences(id), FOREIGN KEY (user_id) REFERENCES users(id),
 CHECK (outcome IN ('given','skipped'))
) ENGINE=InnoDB;
CREATE TABLE alert_states (
 occurrence_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, snoozed_until DATETIME(3),
 dismissed_at DATETIME(3), PRIMARY KEY (occurrence_id,user_id),
 FOREIGN KEY (occurrence_id) REFERENCES occurrences(id), FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE record_files (
 id CHAR(36) PRIMARY KEY, file_id CHAR(36) NOT NULL, health_record_id CHAR(36),
 vaccination_id CHAR(36), expense_id CHAR(36),
 FOREIGN KEY (file_id) REFERENCES files(id), FOREIGN KEY (health_record_id) REFERENCES health_records(id),
 FOREIGN KEY (vaccination_id) REFERENCES vaccinations(id), FOREIGN KEY (expense_id) REFERENCES expenses(id),
 CHECK ((health_record_id IS NOT NULL) + (vaccination_id IS NOT NULL) + (expense_id IS NOT NULL) = 1)
) ENGINE=InnoDB;
CREATE TABLE activity_log (
 id CHAR(36) PRIMARY KEY, household_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
 action VARCHAR(160) NOT NULL, entity_type VARCHAR(40), entity_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (household_id) REFERENCES households(id), FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX activity_household (household_id,created_at)
) ENGINE=InnoDB;
