-- Starter SQL schema for storing user data.
-- Works with SQLite and most SQL databases with minor adjustments.
--
-- NOTE: Database structure has been split into 2 schemas:
-- 1. global_db.sql - Contains global user data and worldwide transactions
-- 2. family_db.sql - Contains family-specific data and group rankings
--
-- To initialize the database, run:
-- 1. global_db.sql (contains users, transactions, groups, and user_group_memberships tables)
-- 2. family_db.sql (contains family_groups, family_members, family_transactions, and family_goals tables)

-- ============================================================
-- GLOBAL DATABASE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(30) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Global transactions table - tracks all user savings across the platform
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id INTEGER,
    amount FLOAT NOT NULL,
    description VARCHAR(255),
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'savings',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

-- Groups table - for organizing users into families or groups
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User-Group membership table - associates users with groups and their roles
CREATE TABLE IF NOT EXISTS user_group_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    user_role VARCHAR(30) NOT NULL DEFAULT 'member',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    UNIQUE (user_id, group_id)
);

-- ============================================================
-- FAMILY DATABASE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS family_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_group_id INTEGER NOT NULL UNIQUE,
    group_name VARCHAR(50) NOT NULL,
    owner_id INTEGER NOT NULL,
    family_code VARCHAR(20) UNIQUE,
    total_savings FLOAT DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (global_group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- Family members snapshot - maintains a record of family members and their contributions
CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    global_user_id INTEGER NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    total_savings FLOAT DEFAULT 0,
    contribution_percentage FLOAT DEFAULT 0,
    member_since DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
    UNIQUE (family_group_id, global_user_id)
);

-- Family transactions log - cached transactions for performance
CREATE TABLE IF NOT EXISTS family_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    family_member_id INTEGER NOT NULL,
    amount FLOAT NOT NULL,
    description VARCHAR(255),
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'savings',
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE CASCADE
);

-- Family goals - shared savings goals for the family
CREATE TABLE IF NOT EXISTS family_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    goal_name VARCHAR(100) NOT NULL,
    target_amount FLOAT NOT NULL,
    current_amount FLOAT DEFAULT 0,
    deadline DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Global indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_user_group_memberships_user ON user_group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group ON user_group_memberships(group_id);

-- Family indexes
CREATE INDEX IF NOT EXISTS idx_family_groups_owner ON family_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_family_groups_code ON family_groups(family_code);
CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(global_user_id);
CREATE INDEX IF NOT EXISTS idx_family_transactions_group ON family_transactions(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_transactions_member ON family_transactions(family_member_id);
CREATE INDEX IF NOT EXISTS idx_family_goals_group ON family_goals(family_group_id);
